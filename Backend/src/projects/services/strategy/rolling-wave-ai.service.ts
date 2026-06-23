import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIPlan, AIWaveStructure } from '../../interfaces/rolling-wave.interface';
import {
  estimateTaskHours,
  buildBalancedWaveDurations,
  normalizeWavePlanShape,
  redistributeTasksAcrossWaves,
  extractAndValidateJSON,
} from './utils/rolling-wave-helpers.util';

@Injectable()
export class RollingWaveAIService {
  private readonly logger = new Logger(RollingWaveAIService.name);
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Primeira chamada Gemini: determinar número ideal de ondas
   */
  async planWaveStructure(
    project: any,
    tasks: any[],
    dailyCapacityHours: number,
  ): Promise<AIWaveStructure | null> {
    try {
      const modelName = process.env.GEMINI_MODEL || 'gemma-3-27b-it';
      const model = this.genAI.getGenerativeModel({ model: modelName });

      const today = new Date();
      const deadline = new Date(project.deadline);
      const availableDays = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const totalTaskHours = tasks.reduce((sum, t) => sum + estimateTaskHours(t), 0);

      const prompt = `Você é especialista em Rolling Waves. Determine número ideal de ondas.

PROJETO: ${project.name || 'Sem nome'}
Data: ${today.toISOString().split('T')[0]} até ${deadline.toISOString().split('T')[0]}
Dias: ${availableDays} | Tarefas: ${tasks.length} | Trabalho: ${totalTaskHours.toFixed(1)}h | Capacidade: ${dailyCapacityHours}h/dia

Recomende ondas que cubram EXATAMENTE ${availableDays} dias (cada onda: 14-45 dias, total: 3-15 ondas).

RETORNE APENAS JSON (SEM MARKDOWN, STRINGS EM UMA LINHA):
{"recommendedWaveCount":NUMERO,"totalDurationDays":${availableDays},"description":"Descrição breve em uma linha","reasoning":"Explicação em uma linha sem quebras"}`;

      const result = await this.generateContentWithRetry(model, prompt);
      if (!result) {
        this.logger.warn(`[GENAI] planWaveStructure: Falha ao obter resposta do modelo após retries`);
        return null;
      }
      const responseText = result.response.text();

      // Validar e extrair JSON
      const parsed = extractAndValidateJSON<AIWaveStructure>(responseText, [
        'recommendedWaveCount',
        'totalDurationDays',
        'description',
        'reasoning',
      ], this.logger);

      if (!parsed) {
        this.logger.warn(
          `[PARSE_ERROR] planWaveStructure: Resposta inválida.\nRaw: ${responseText.substring(0, 500)}`,
        );
        return null;
      }

      // Validar valores
      if (
        !parsed.recommendedWaveCount ||
        !parsed.totalDurationDays ||
        parsed.totalDurationDays < availableDays
      ) {
        this.logger.warn(
          `[VALIDATION_ERROR] planWaveStructure: Valores inválidos. waveCount=${parsed.recommendedWaveCount}, totalDays=${parsed.totalDurationDays}, required=${availableDays}`,
        );
        return null;
      }

      this.logger.debug(
        `Estrutura de ondas sugerida: ${parsed.recommendedWaveCount} ondas em ${parsed.totalDurationDays} dias`,
      );
      return parsed;
    } catch (error: any) {
      this.logger.warn(`Erro ao chamar Gemini para estrutura: ${error.message}`);
      return null;
    }
  }

  /**
   * Segunda chamada Gemini: Determinar alocação de WBS para cada onda
   * Em vez de alocar tasks diretamente, Gemini define:
   * "Wave 1: 20 tasks de HSK N2 Vocabulário, 10 de HSK N2 Gramática, etc"
   */
  async planWaveGrouping(
    project: any,
    tasks: any[],
    waveCount: number,
    wbsTree: any[],
    dailyCapacityHours: number,
  ): Promise<AIPlan | null> {
    try {
      const modelName = process.env.GEMINI_STRONG_MODEL || 'gemini-2.5-flash-lite';
      const model = this.genAI.getGenerativeModel({ model: modelName });

      const today = new Date();
      const deadline = new Date(project.deadline);
      const totalAvailableDays = Math.ceil(
        (deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      const waveDurations = buildBalancedWaveDurations(totalAvailableDays, waveCount);

      // Calcular distribuição equilibrada de tasks
      const totalTasks = tasks.length;
      const tasksPerWave = Math.ceil(totalTasks / waveCount);
      const minTasksPerWave = Math.max(1, Math.floor(tasksPerWave * 0.8));
      const maxTasksPerWave = Math.ceil(tasksPerWave * 1.2);

      this.logger.debug(
        `[DISTRIBUTION] Total tasks: ${totalTasks}, waves: ${waveCount}, target: ${tasksPerWave}±20% (${minTasksPerWave}-${maxTasksPerWave})`,
      );

      // Montar ESTRUTURA WBS com QUANTIDADE de tasks por pacote
      const wbsTaskCount = new Map<string, number>();
      const tasksByWbs = new Map<string, any[]>();

      for (const task of tasks) {
        const wbsPath = task.wbsPath || 'SEM_WBS';
        wbsTaskCount.set(wbsPath, (wbsTaskCount.get(wbsPath) || 0) + 1);

        if (!tasksByWbs.has(wbsPath)) {
          tasksByWbs.set(wbsPath, []);
        }
        tasksByWbs.get(wbsPath)!.push(task);
      }

      const wbsDistribution = Array.from(wbsTaskCount.entries())
        .map(([wbs, count]) => ({ wbs, count }))
        .sort((a, b) => b.count - a.count);

      // Preparar exemplos de tasks por WBS (apenas títulos)
      const taskExamplesByWbs = new Map<string, string[]>();
      for (const [wbs, taskList] of tasksByWbs.entries()) {
        taskExamplesByWbs.set(
          wbs,
          taskList.slice(0, 5).map((t) => t.name || 'sem título'),
        );
      }

      // IMPORTANTE: Usar títulos, não IDs, para semântica real
      const wbsWithExamples = wbsDistribution.map((item) => ({
        wbs: item.wbs,
        count: item.count,
        examples: (taskExamplesByWbs.get(item.wbs) || []).slice(0, 3),
      }));

      const prompt = `
Você é um especialista em Rolling Waves. Aloque pacotes WBS às ondas com alocação equilibrada.

PROJETO: ${project.name || 'Sem nome'}
Período: ${totalAvailableDays} dias, ${waveCount} ondas, ${totalTasks} tarefas
Meta por onda: ${tasksPerWave} tarefas (${minTasksPerWave}-${maxTasksPerWave} aceitável)
Duracões exatas por onda: ${waveDurations.join(', ')} dias

PACOTES WBS:
${JSON.stringify(wbsWithExamples, null, 2)}

REGRAS CRÍTICAS:
0. RETORNE EXATAMENTE ${waveCount} ondas, numeradas de 1 até ${waveCount}
1. CADA WBS ALOCADO A EXATAMENTE UMA ONDA (sem duplicação)
2. NENHUMA QUANTIDADE 0 (se aloca WBS, quantidade maior que 0)
3. SOMA TOTAL = ${totalTasks} tarefas
4. CADA ONDA: ${minTasksPerWave}-${maxTasksPerWave} tarefas
5. JSON VÁLIDO, SEM MARKDOWN, SEM TRUNCAÇÃO

ESTRUTURA JSON OBRIGATÓRIA:
{
  "waves": [
    {
      "waveNumber": 1,
      "name": "Nome da Onda",
      "description": "Descrição clara do que será feito nesta onda, resumindo os principais WBS blocos alocados",
      "durationDays": DURACAO_EXATA_DA_ONDA,
      "focus": "Foco principal desta onda",
      "wbsAllocation": {
        "WBS_NAME": NUMERO,
        "WBS_NAME2": NUMERO
      }
    }
  ],
  "rationale": "Soma total tarefas = ${totalTasks}"
}

REQUISITOS CRÍTICOS:
- Use NÚMEROS para quantidades (não strings entre aspas)
- SEM ASPAS no início/fim de strings (use aspas simples se necessário)
- DESCRIPTION obrigatória: resumir em 1-2 linhas os principais WBS blocos (ex: "Vocabulário HSK N2 parte 1, Gramática básica e Compreensão auditiva")
- As ${waveCount} ondas devem existir mesmo que algumas tenham poucos WBS; nunca retorne menos de ${waveCount} ondas
- Use estas durações exatamente nesta ordem: ${waveDurations.join(', ')}
- Sem caracteres especiais em descriptions (acentos OK)
- JSON deve ser válido: JSON.parse() sem erros
- Sem markdown, sem truncação, JSON completo
`;

      const result = await this.generateContentWithRetry(model, prompt);
      if (!result) {
        this.logger.warn(`[GENAI] planWaveGrouping: Falha ao obter resposta do modelo após retries`);
        return null;
      }
      const responseText = result.response.text();

      const parsed = extractAndValidateJSON<AIPlan>(responseText, ['waves', 'rationale'], this.logger);

      if (!parsed || !parsed.waves || parsed.waves.length === 0) {
        this.logger.warn(
          `[PARSE_ERROR] planWaveGrouping: Resposta inválida.\nRaw: ${responseText.substring(0, 500)}`,
        );
        return null;
      }

      if (parsed.waves.length !== waveCount) {
        this.logger.warn(
          `[WAVE_COUNT_MISMATCH] Gemini retornou ${parsed.waves.length} ondas, mas eram esperadas ${waveCount}. O plano será normalizado.`,
        );
      }

      const normalizedPlan = normalizeWavePlanShape(parsed, waveCount, totalAvailableDays);
      const taskCursorByWbs = new Map<string, number>();

      // CONVERTER ALOCAÇÃO DE WBS EM TASK IDs REAIS
      for (const wave of normalizedPlan.waves) {
        const taskIds: string[] = [];

        // Para cada WBS alocado nesta onda
        const wbsAllocation = wave.wbsAllocation || {};
        for (const [wbs, quantityNeeded] of Object.entries(wbsAllocation)) {
          const tasksInWbs = tasksByWbs.get(wbs) || [];
          const startIndex = taskCursorByWbs.get(wbs) || 0;
          const safeQuantityNeeded = Math.max(0, Number(quantityNeeded) || 0);

          // Consumir tarefas sem reaproveitar o mesmo começo do pacote em múltiplas ondas.
          const selectedTasks = tasksInWbs.slice(startIndex, startIndex + safeQuantityNeeded);

          for (const task of selectedTasks) {
            taskIds.push(String(task._id || task.id));
          }

          taskCursorByWbs.set(wbs, startIndex + selectedTasks.length);

          if (selectedTasks.length < safeQuantityNeeded) {
            this.logger.warn(
              `[WBS_ALLOCATION_SHORTFALL] Wave ${wave.waveNumber}: WBS "${wbs}" pediu ${safeQuantityNeeded}, mas só ${selectedTasks.length} tarefas estavam disponíveis.`,
            );
          }
        }

        wave.taskIds = taskIds;
      }

      // DEBUG: Log
      this.logger.debug(
        `[GEMINI] Agrupamento (WBS-based) retornou: ${normalizedPlan.waves.length} ondas`,
      );
      for (const wave of normalizedPlan.waves) {
        const wbsList = Object.entries(wave.wbsAllocation || {})
          .map(([w, c]) => `${w}(${c})`)
          .join(', ');
        this.logger.debug(
          `[GEMINI] Wave ${wave.waveNumber}: ${wave.durationDays}d, ${wave.taskIds.length} tasks | Desc: "${wave.description}" | WBS=[${wbsList}]`,
        );
      }

      // VALIDAR DISTRIBUIÇÃO
      const allTaskIds = tasks.map((t) => String(t._id || t.id));
      const taskCountByWave = normalizedPlan.waves.map((w) => w.taskIds.length);
      const allocatedUniqueTaskIds = new Set(normalizedPlan.waves.flatMap((w) => w.taskIds));
      const missingTaskCount = allTaskIds.length - allocatedUniqueTaskIds.size;
      const unbalancedWaves = taskCountByWave.filter(
        (cnt) => cnt < minTasksPerWave || cnt > maxTasksPerWave,
      );

      if (parsed.waves.length !== waveCount || missingTaskCount > 0 || unbalancedWaves.length > 0) {
        this.logger.warn(
          `[DISTRIBUTION] Plano inválido para persistência direta: mismatchOndas=${parsed.waves.length !== waveCount}, missingTasks=${missingTaskCount}, ondasForaDoRange=${unbalancedWaves.length}. Rebalanceando...`,
        );
        return this.rebalanceWaveDistribution(
          normalizedPlan,
          allTaskIds,
          minTasksPerWave,
          maxTasksPerWave,
          waveCount,
          totalAvailableDays,
        );
      }

      return normalizedPlan;
    } catch (error: any) {
      this.logger.warn(`Erro ao chamar Gemini para agrupamento WBS: ${error.message}`);
      return null;
    }
  }

  /**
   * Rebalancear distribuição de tasks se ondas ficarem muito desbalanceadas
   */
  rebalanceWaveDistribution(
    aiPlan: AIPlan,
    allTaskIds: string[],
    minTasksPerWave: number,
    maxTasksPerWave: number,
    expectedWaveCount: number,
    totalDurationDays: number,
  ): AIPlan {
    this.logger.debug(`[REBALANCE] Iniciando rebalanceamento de distribuição...`);

    const normalizedPlan = normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);

    // Coletar todas as tarefas alocadas do plano
    const allocatedTasks = new Set<string>();
    let duplicateTaskCount = 0;
    for (const wave of normalizedPlan.waves) {
      for (const tid of wave.taskIds) {
        if (allocatedTasks.has(tid)) {
          duplicateTaskCount++;
          continue;
        }
        allocatedTasks.add(tid);
      }
    }

    // Encontrar tarefas não alocadas
    const unallocatedTasks = allTaskIds.filter((tid) => !allocatedTasks.has(tid));
    this.logger.debug(
      `[REBALANCE] Tarefas alocadas: ${allocatedTasks.size}, não alocadas: ${unallocatedTasks.length}, duplicadas ignoradas: ${duplicateTaskCount}`,
    );

    this.logger.debug(
      `[REBALANCE] Redistribuindo ${allTaskIds.length} tarefas em ${expectedWaveCount} ondas.`,
    );

    const redistributedPlan = redistributeTasksAcrossWaves(
      normalizedPlan,
      allTaskIds,
      expectedWaveCount,
      totalDurationDays,
      minTasksPerWave,
      maxTasksPerWave,
    );

    // Log Final
    this.logger.debug(`[REBALANCE] Distribuição final:`);
    for (const wave of redistributedPlan.waves) {
      this.logger.debug(`  Wave ${wave.waveNumber}: ${wave.taskIds.length} tasks`);
    }

    const finalCounts = redistributedPlan.waves.map((w) => w.taskIds.length);
    const finalOutOfRangeCount = finalCounts.filter(
      (cnt) => cnt < minTasksPerWave || cnt > maxTasksPerWave,
    ).length;
    if (finalOutOfRangeCount > 0) {
      this.logger.warn(
        `[REBALANCE] ${finalOutOfRangeCount} ondas ainda ficaram fora do range alvo ${minTasksPerWave}-${maxTasksPerWave}, embora todas as tarefas tenham sido redistribuídas.`,
      );
    }

    return redistributedPlan;
  }

  /**
   * Wrapper para chamadas ao modelo com retry/backoff para erros de rede transitórios
   */
  private async generateContentWithRetry(
    model: any,
    prompt: string,
    maxAttempts = 3,
  ): Promise<any | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        return result;
      } catch (err: any) {
        this.logger.warn(
          `[GENAI_RETRY] Tentativa ${attempt}/${maxAttempts} falhou: ${err?.message || err}`,
        );
        if (attempt < maxAttempts) {
          const delay = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        this.logger.warn('[GENAI_RETRY] Todas as tentativas falharam');
        return null;
      }
    }
    return null;
  }
}
