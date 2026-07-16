import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import {
  buildPlanWaveStructurePrompt,
  buildPlanWaveGroupingPrompt,
} from './prompts/rolling-wave.prompts';
import { AIPlan, AIWaveStructure } from '../projects/interfaces/rolling-wave.interface';
import {
  estimateTaskHours,
  buildBalancedWaveDurations,
  normalizeWavePlanShape,
  redistributeTasksAcrossWaves,
} from '../projects/services/strategy/utils/rolling-wave-helpers.util';

function sanitizeJSON(jsonString: string): string {
  try {
    let result = jsonString.trim();
    const chars: string[] = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < result.length; i++) {
      const char = result[i];

      if (escapeNext) {
        chars.push(char);
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        chars.push(char);
        escapeNext = true;
        continue;
      }

      if (char === '"' && (i === 0 || result[i - 1] !== '\\')) {
        inString = !inString;
        chars.push(char);
        continue;
      }

      if (inString && (char === '\n' || char === '\r')) {
        chars.push(' ');
        continue;
      }

      chars.push(char);
    }

    result = chars.join('');
    result = result.replace(/,\s*}/g, '}');
    result = result.replace(/,\s*]/g, ']');

    result = result.replace(/"([^"]*?)(['"])([^"]*?)"/g, (match, prefix, quote, suffix) => {
      if (quote === "'") {
        return match;
      }
      return match;
    });

    return result;
  } catch (e) {
    return jsonString;
  }
}

function extractAndValidateJSON<T extends Record<string, any>>(
  responseText: string,
  requiredFields: string[],
  logger?: { warn: (msg: string) => void },
): T | null {
  try {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^[\s\n]*```/gm, '')
      .replace(/```[\s\n]*$/gm, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      logger?.warn(`[JSON_EXTRACT] Nenhum JSON encontrado na resposta`);
      return null;
    }

    let jsonString = cleaned.substring(jsonStart, jsonEnd + 1);

    if (!jsonString.endsWith('}')) {
      logger?.warn(
        `[JSON_INCOMPLETE] JSON não termina com "}" - truncado?\nEnd: ...${jsonString.substring(Math.max(0, jsonString.length - 100))}`,
      );
      return null;
    }

    jsonString = sanitizeJSON(jsonString);

    const parsedAny: any = JSON.parse(jsonString);

    for (const field of requiredFields) {
      if (!(field in parsedAny)) {
        logger?.warn(`[JSON_MISSING_FIELD] Campo obrigatório ausente: ${field}`);
        return null;
      }
    }

    return parsedAny as T;
  } catch (e: any) {
    logger?.warn(`[JSON_PARSE_ERROR] ${e.message}\nResponse: ${responseText.substring(0, 400)}`);
    return null;
  }
}

@Injectable()
export class RollingWaveAIService {
  private readonly logger = new Logger(RollingWaveAIService.name);

  constructor(private readonly geminiService: GeminiService) {}

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

      const today = new Date();
      const deadline = new Date(project.deadline);
      const availableDays = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const totalTaskHours = tasks.reduce((sum, t) => sum + estimateTaskHours(t), 0);

      const prompt = buildPlanWaveStructurePrompt({
        projectName: project.name || 'Sem nome',
        todayIso: today.toISOString().split('T')[0],
        deadlineIso: deadline.toISOString().split('T')[0],
        availableDays,
        taskCount: tasks.length,
        totalTaskHours,
        dailyCapacityHours,
      });

      const responseText = await this.geminiService.generateContent(prompt, { model: modelName });

      // Validar e extrair JSON
      const parsed = extractAndValidateJSON<AIWaveStructure>(
        responseText,
        ['recommendedWaveCount', 'totalDurationDays', 'description', 'reasoning'],
        this.logger,
      );

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

      const prompt = buildPlanWaveGroupingPrompt({
        projectName: project.name || 'Sem nome',
        totalAvailableDays,
        waveCount,
        totalTasks,
        tasksPerWave,
        minTasksPerWave,
        maxTasksPerWave,
        waveDurations,
        wbsWithExamples,
      });

      const responseText = await this.geminiService.generateContent(prompt, { model: modelName });

      const parsed = extractAndValidateJSON<AIPlan>(responseText, ['waves', 'rationale'], this.logger);

      if (!parsed || !parsed.waves || parsed.waves.length === 0) {
        this.logger.warn(
          `[PARSE_ERROR] planWaveGrouping: Resposta inválida.\nRaw: ${responseText.substring(0, 500)}`,
        );
        return null;
      }

      if (parsed.waves.length !== waveCount) {
        this.logger.warn(
          `[WAVE_COUNT_MISMATCH] Gemini retornou ${parsed.waves.length} ondas, mas eras esperadas ${waveCount}. O plano será normalizado.`,
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
}
