import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MongoClient, ObjectId as NativeObjectId } from 'mongodb';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs/wbs.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

import {
  WaveTask,
  WbsNodeFlat,
  AIPlanWave,
  AIPlan,
  AIWaveStructure,
  ReplanTaskDeadlinesResult,
} from '../../interfaces/rolling-wave.interface';

import {
  flattenWbsTree,
  estimateTaskHours,
  startOfDay,
  endOfDay,
  addDays,
  buildTaskScheduleMetrics,
  resolveGroupKey,
  buildBalancedWaveDurations,
  normalizeWavePlanShape,
  redistributeTasksAcrossWaves,
  extractAndValidateJSON,
} from './utils/rolling-wave-helpers.util';

@Injectable()
export class RollingWaveService {
  private readonly logger = new Logger(RollingWaveService.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    @InjectModel(ProjectWave.name)
    private waveModel: Model<ProjectWaveDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Primeira chamada Gemini: determinar número ideal de ondas
   */
  private async planWaveStructure(
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
      const minimumDaysRequired = Math.ceil(totalTaskHours / dailyCapacityHours);

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

  /**
   * Executa operacoes criticas em um cliente Mongo dedicado para evitar sockets stale do pool.
   */
  private async executeWithFreshMongoClient<T>(
    operation: (collection: any) => Promise<T>,
    operationName: string,
    maxAttempts = 5,
  ): Promise<T | null> {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      this.logger.warn(`[MONGO_FRESH] MONGODB_URI ausente para ${operationName}`);
      return null;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let client: MongoClient | null = null;
      try {
        client = new MongoClient(uri, {
          maxPoolSize: 2,
          minPoolSize: 0,
          serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
          connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
          socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 120000),
          retryWrites: true,
          family: 4,
        });

        await client.connect();
        const dbName = this.waveModel.db?.name || undefined;
        const db = dbName ? client.db(dbName) : client.db();
        const collection = db.collection(this.waveModel.collection.name);
        const result = await operation(collection);
        return result;
      } catch (err: any) {
        this.logger.warn(
          `[MONGO_FRESH] ${operationName} tentativa ${attempt}/${maxAttempts} falhou: ${err?.message || err}`,
        );
        if (attempt < maxAttempts) {
          const baseDelay = Math.min(8000, Math.pow(2, attempt - 1) * 1000);
          const jitter = Math.random() * baseDelay * 0.1;
          const totalDelay = baseDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, totalDelay));
        }
      } finally {
        if (client) {
          try {
            await client.close();
          } catch {
            // noop
          }
        }
      }
    }

    return null;
  }

  /**
   * Persistencia em chunks pequenos para evitar resets em payload grande.
   */
  private async persistWaveIncrementalChunked(
    projectId: string,
    wave: {
      waveNumber: number;
      startDate: Date;
      endDate: Date;
      status: 'planned';
      taskIds: Types.ObjectId[];
      description?: string;
    },
    chunkSize = 25,
  ): Promise<boolean> {
    const projectObjectId = new NativeObjectId(projectId);
    const safeDescription =
      typeof wave.description === 'string' ? wave.description.slice(0, 1000) : undefined;

    const metadataResult = await this.executeWithFreshMongoClient(
      (collection) =>
        collection.updateOne(
          { projectId: projectObjectId, waveNumber: wave.waveNumber },
          {
            $set: {
              projectId: projectObjectId,
              waveNumber: wave.waveNumber,
              startDate: wave.startDate,
              endDate: wave.endDate,
              status: wave.status,
              description: safeDescription,
              taskIds: [],
            },
          },
          { upsert: true },
        ),
      `chunked metadata upsert wave ${wave.waveNumber} for project ${projectId}`,
      5,
    );

    if (metadataResult === null) {
      return false;
    }

    const nativeTaskIds = wave.taskIds
      .map((id) => String(id))
      .filter((id) => NativeObjectId.isValid(id))
      .map((id) => new NativeObjectId(id));

    for (let i = 0; i < nativeTaskIds.length; i += chunkSize) {
      const chunk = nativeTaskIds.slice(i, i + chunkSize);
      const chunkResult = await this.executeWithFreshMongoClient(
        (collection) =>
          collection.updateOne(
            { projectId: projectObjectId, waveNumber: wave.waveNumber },
            { $addToSet: { taskIds: { $each: chunk } } },
          ),
        `chunked taskIds upsert wave ${wave.waveNumber} chunk ${Math.floor(i / chunkSize) + 1}`,
        5,
      );

      if (chunkResult === null) {
        return false;
      }
    }

    return true;
  }

  /**
   * Segunda chamada Gemini: Determinar alocação de WBS para cada onda
   * Em vez de alocar tasks diretamente, Gemini define:
   * "Wave 1: 20 tasks de HSK N2 Vocabulário, 10 de HSK N2 Gramática, etc"
   */
  private async planWaveGrouping(
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
    } catch (error) {
      this.logger.warn(`Erro ao chamar Gemini para agrupamento WBS: ${error.message}`);
      return null;
    }
  }

  /**
   * Rebalancear distribuição de tasks se ondas ficarem muito desbalanceadas
   */
  private rebalanceWaveDistribution(
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
   * Aplicar o plano gerado por Gemini às ondas do banco
   */
  private async applyAIPlanToWaves(
    projectId: string,
    tasks: any[],
    aiPlan: AIPlan,
    expectedWaveCount: number,
    totalDurationDays: number,
  ): Promise<ProjectWave[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Resetar para início do dia
    const dayMs = 24 * 60 * 60 * 1000;

    // Validar o plano
    const validPlan = normalizeWavePlanShape(
      this.rebalanceEmptyWaves(
        aiPlan,
        tasks.map((t) => String(t._id || t.id)),
      ),
      expectedWaveCount,
      totalDurationDays,
    );

    const taskMap = new Map(tasks.map((t: any) => [String(t._id || t.id), t]));
    const allTaskIds = tasks.map((t) => String(t._id || t.id));

    // Validar se há IDs inválidos na resposta de Gemini
    const allocatedTaskIds = new Set<string>();
    let invalidIdCount = 0;
    for (const wave of validPlan.waves) {
      for (const taskId of wave.taskIds) {
        if (taskMap.has(taskId)) {
          allocatedTaskIds.add(taskId);
        } else {
          invalidIdCount++;
        }
      }
    }

    // Se há IDs inválidos, fazer um fallback: redistribuir tarefas reais equilibradamente
    if (invalidIdCount > 0) {
      this.logger.warn(
        `[FALLBACK] ${invalidIdCount} IDs inválidos detectados. Redistribuindo tarefas reais equilibradamente...`,
      );

      // Limpar todas as ondas
      for (const wave of validPlan.waves) {
        wave.taskIds = [];
      }

      // Redistribuir tarefas reais equilibradamente
      const targetPerWave = Math.ceil(allTaskIds.length / validPlan.waves.length);
      for (let i = 0; i < allTaskIds.length; i++) {
        const waveIndex = Math.floor(i / targetPerWave) % validPlan.waves.length;
        validPlan.waves[waveIndex].taskIds.push(allTaskIds[i]);
      }

      this.logger.debug(
        `[FALLBACK] Redistribuídas ${allTaskIds.length} tarefas em ${validPlan.waves.length} ondas (~${targetPerWave} tasks/onda)`,
      );
    }

    // DEBUG: Log do plano após rebalance
    this.logger.debug(`[DEBUG] Plano após rebalance (${validPlan.waves.length} ondas):`);
    for (const wave of validPlan.waves) {
      this.logger.debug(
        `  Wave ${wave.waveNumber}: ${wave.taskIds.length} taskIds = [${wave.taskIds.slice(0, 3).join(', ')}${wave.taskIds.length > 3 ? '...' : ''}]`,
      );
    }
    this.logger.debug(
      `[DEBUG] Todos os taskIds disponíveis (${allTaskIds.length}): ${allTaskIds.slice(0, 3).join(', ')}...`,
    );

    const projectObjectId = new Types.ObjectId(projectId);
    const waveNumbersToKeep: number[] = [];
    const bulkOps: any[] = [];
    const preparedWaves: Array<{
      waveNumber: number;
      startDate: Date;
      endDate: Date;
      status: 'planned';
      taskIds: Types.ObjectId[];
      description?: string;
    }> = [];
    let currentWaveStart = today;

    for (const aiWave of validPlan.waves) {
      const waveEnd = new Date(currentWaveStart.getTime() + aiWave.durationDays * dayMs);

      const validTaskIds: Types.ObjectId[] = [];
      let notFoundCount = 0;

      for (const taskId of aiWave.taskIds) {
        // Validar que a tarefa existe
        if (taskMap.has(taskId)) {
          try {
            validTaskIds.push(new Types.ObjectId(taskId));
          } catch (e) {
            this.logger.warn(`[WARN] ID inválido (ObjectId parse failed): ${taskId}`);
            notFoundCount++;
          }
        } else {
          notFoundCount++;
          this.logger.debug(
            `[DEBUG] Wave ${aiWave.waveNumber}: Tarefa não encontrada: ${String(taskId).substring(0, 20)}...`,
          );
        }
      }

      if (notFoundCount > 0) {
        this.logger.warn(
          `[WARN] Wave ${aiWave.waveNumber}: ${notFoundCount}/${aiWave.taskIds.length} tarefas não encontradas`,
        );
      }

      waveNumbersToKeep.push(aiWave.waveNumber);
      preparedWaves.push({
        waveNumber: aiWave.waveNumber,
        startDate: currentWaveStart,
        endDate: waveEnd,
        status: 'planned',
        taskIds: validTaskIds,
        description: aiWave.description,
      });
      bulkOps.push({
        replaceOne: {
          filter: {
            projectId: projectObjectId,
            waveNumber: aiWave.waveNumber,
          },
          replacement: {
            projectId: projectObjectId,
            waveNumber: aiWave.waveNumber,
            startDate: currentWaveStart,
            endDate: waveEnd,
            status: 'planned',
            taskIds: validTaskIds,
            description: aiWave.description,
          },
          upsert: true,
        },
      });

      currentWaveStart = waveEnd;
    }

    const bulkResult = await this.executeWithFreshMongoClient(
      (collection) => collection.bulkWrite(bulkOps, { ordered: true }),
      `bulkWrite waves for project ${projectId}`,
      5,
    );
    if (bulkResult === null) {
      this.logger.warn(
        `[MONGO_FALLBACK] bulkWrite falhou. Tentando persistência incremental em chunks por onda...`,
      );

      for (const wave of preparedWaves) {
        const persisted = await this.persistWaveIncrementalChunked(projectId, wave, 25);
        if (!persisted) {
          this.logger.error(
            `Falha ao persistir Wave ${wave.waveNumber} no fallback incremental em chunks.`,
          );
          throw new Error('Database operation failed after retries');
        }
      }
    }

    const cleanupResult = await this.executeWithFreshMongoClient(
      (collection) =>
        collection.deleteMany({
          projectId: projectObjectId,
          waveNumber: { $nin: waveNumbersToKeep },
        }),
      `cleanup stale waves for project ${projectId}`,
      5,
    );
    if (cleanupResult === null) {
      this.logger.error(`Falha ao limpar waves antigas após bulkWrite.`);
      throw new Error('Database operation failed after retries');
    }

    const wavesResult = await this.executeWithFreshMongoClient(
      (collection) => collection.find({ projectId: projectObjectId }).sort({ waveNumber: 1 }).toArray(),
      `fetch saved waves for project ${projectId}`,
      5,
    );
    if (wavesResult === null) {
      this.logger.error(`Falha ao recuperar waves salvas após bulkWrite.`);
      throw new Error('Database operation failed after retries');
    }

    const waves = wavesResult as ProjectWave[];
    const wavesSummary = waves
      .map(
        (w) =>
          `Wave ${w.waveNumber}: ${w.taskIds.length} tasks (${(w.endDate.getTime() - w.startDate.getTime()) / dayMs}d)`,
      )
      .join(' | ');
    this.logger.debug(
      `✓ Criadas ${waves.length} ondas (via IA 2-step) para projeto ${projectId} | ${wavesSummary}`,
    );

    return waves;
  }

  /**
   * Rebalancear ondas vazias se necessário
   */
  private rebalanceEmptyWaves(aiPlan: AIPlan, allTaskIds: string[]): AIPlan {
    const emptyWaveCount = aiPlan.waves.filter((w) => w.taskIds.length === 0).length;

    if (emptyWaveCount === 0) {
      return aiPlan;
    }

    this.logger.warn(`Detectadas ${emptyWaveCount} ondas vazias — rebalanceando...`);

    const allocatedTaskIds = new Set<string>();
    for (const wave of aiPlan.waves) {
      for (const tid of wave.taskIds) {
        allocatedTaskIds.add(tid);
      }
    }

    const unallocatedTasks = allTaskIds.filter((tid) => !allocatedTaskIds.has(tid));

    if (unallocatedTasks.length === 0) {
      const allTasks = aiPlan.waves.flatMap((w) => w.taskIds);
      const tasksPerWave = Math.max(1, Math.ceil(allTasks.length / aiPlan.waves.length));

      const rebalanced = aiPlan.waves.map((wave, idx) => ({
        ...wave,
        taskIds: allTasks.slice(idx * tasksPerWave, (idx + 1) * tasksPerWave),
      }));

      return { ...aiPlan, waves: rebalanced };
    }

    const wavesToFill = aiPlan.waves.filter((w) => w.taskIds.length === 0);
    let taskIdx = 0;

    for (const wave of wavesToFill) {
      if (taskIdx < unallocatedTasks.length) {
        wave.taskIds.push(unallocatedTasks[taskIdx]);
        taskIdx++;
      }
    }

    while (taskIdx < unallocatedTasks.length) {
      for (let i = 0; i < aiPlan.waves.length && taskIdx < unallocatedTasks.length; i++) {
        aiPlan.waves[i].taskIds.push(unallocatedTasks[taskIdx]);
        taskIdx++;
      }
    }

    return aiPlan;
  }

  /**
   * Fallback determinístico
   */
  private async createWavesDeterministic(
    projectId: string,
    project: any,
    tasks: any[],
    wbsTree: any[],
    dailyCapacityHours: number,
    waveLengthDays: number,
  ): Promise<ProjectWave[]> {
    const safeWaveLengthDays = Math.max(7, waveLengthDays);
    const dayMs = 24 * 60 * 60 * 1000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(project.deadline);
    const plannedTotalMs = deadline.getTime() - today.getTime();
    const plannedDurationDays = Math.max(1, Math.ceil(plannedTotalMs / dayMs));

    const totalTaskHours = tasks.reduce((sum, task) => sum + estimateTaskHours(task), 0);
    const requiredDaysByCapacity = Math.max(1, Math.ceil(totalTaskHours / dailyCapacityHours));

    const effectiveDurationDays = Math.max(plannedDurationDays, requiredDaysByCapacity);

    if (effectiveDurationDays > plannedDurationDays) {
      const adjustedDeadline = new Date(today.getTime() + effectiveDurationDays * dayMs);
      await this.projectsService.update(projectId, {
        deadline: adjustedDeadline,
      } as any);
      this.logger.warn(
        `Deadline ajustado para ${adjustedDeadline.toISOString()} (requer ${effectiveDurationDays} dias)`,
      );
    }

    const waveLengthMs = safeWaveLengthDays * dayMs;
    const waveCount = Math.max(1, Math.ceil(effectiveDurationDays / safeWaveLengthDays));

    await this.waveModel.deleteMany({
      projectId: new Types.ObjectId(projectId),
    });

    const waves: ProjectWave[] = [];
    const waveTaskIds = new Map<number, Types.ObjectId[]>();
    const waveUsedHours = new Array<number>(waveCount).fill(0);

    const wbsFlat = flattenWbsTree(wbsTree);
    const wbsById = new Map(wbsFlat.map((node) => [node.id, node]));

    const timelineRangeMs = Math.max(1, effectiveDurationDays * dayMs);
    const normalizedTasks: WaveTask[] = tasks.map((task: any) => {
      const id = String(task._id || task.id);
      const hours = estimateTaskHours(task);
      const deadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;
      const groupKey = resolveGroupKey(task, wbsById, today.getTime(), timelineRangeMs);
      return { id, hours, deadlineTime, groupKey };
    });

    const waveCapacityHours = safeWaveLengthDays * dailyCapacityHours;

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const findWaveIndexWithCapacity = (preferredIndex: number, taskHours: number): number => {
      for (let idx = preferredIndex; idx >= 0; idx--) {
        if (waveUsedHours[idx] + taskHours <= waveCapacityHours) return idx;
      }
      for (let idx = preferredIndex + 1; idx < waveCount; idx++) {
        if (waveUsedHours[idx] + taskHours <= waveCapacityHours) return idx;
      }
      return waveCount - 1;
    };

    const pushToWave = (waveIndex: number, task: WaveTask) => {
      waveUsedHours[waveIndex] += task.hours;
      const bucket = waveTaskIds.get(waveIndex) || [];
      bucket.push(new Types.ObjectId(task.id));
      waveTaskIds.set(waveIndex, bucket);
    };

    const tasksWithDeadline = normalizedTasks
      .filter((t) => t.deadlineTime != null)
      .sort((a, b) => {
        const aDeadline = a.deadlineTime as number;
        const bDeadline = b.deadlineTime as number;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        return b.hours - a.hours;
      });

    for (const task of tasksWithDeadline) {
      const desiredIndex = clamp(
        Math.floor(((task.deadlineTime as number) - today.getTime()) / waveLengthMs),
        0,
        waveCount - 1,
      );
      const targetIndex = findWaveIndexWithCapacity(desiredIndex, task.hours);
      pushToWave(targetIndex, task);
    }

    const tasksWithoutDeadline = normalizedTasks
      .filter((t) => t.deadlineTime == null)
      .sort((a, b) => b.hours - a.hours);

    const findLeastLoadedWave = (taskHours: number): number => {
      let bestIdx = 0;
      let bestUsed = Number.POSITIVE_INFINITY;
      for (let idx = 0; idx < waveCount; idx++) {
        const score = waveUsedHours[idx];
        if (score < bestUsed) {
          bestUsed = score;
          bestIdx = idx;
        }
      }
      return bestIdx;
    };

    for (const task of tasksWithoutDeadline) {
      const preferredIndex = findLeastLoadedWave(task.hours);
      const targetIndex = findWaveIndexWithCapacity(preferredIndex, task.hours);
      pushToWave(targetIndex, task);
    }

    for (let i = 1; i <= waveCount; i++) {
      const waveStartDate = new Date(today.getTime() + (i - 1) * waveLengthMs);
      const nominalEnd = new Date(waveStartDate.getTime() + waveLengthMs);
      const hardEnd = deadline;
      const waveEndDate = nominalEnd > hardEnd ? hardEnd : nominalEnd;
      const taskIds = waveTaskIds.get(i - 1) || [];

      const wave = new this.waveModel({
        projectId: new Types.ObjectId(projectId),
        waveNumber: i,
        startDate: waveStartDate,
        endDate: waveEndDate,
        status: 'planned',
        taskIds,
        description: `Wave ${i}`,
      });

      await wave.save();
      waves.push(wave);
    }

    this.logger.debug(`Criadas ${waveCount} ondas (determinísticas) para ${projectId}`);

    return waves;
  }

  /**
   * Criar ondas iniciais com 2 requisições inteligentes ao Gemini
   */
  async createInitialWaves(
    projectId: string,
    project: any,
    waveLengthDays: number = 28,
  ): Promise<ProjectWave[]> {
    const dailyCapacityHours = Number(process.env.ROLLING_WAVE_DAILY_CAPACITY_HOURS || 6);

    this.logger.debug(`Planejando ondas inteligentes (2-step IA) para projeto ${projectId}`);

    const tasks = (await this.projectsService.getTasksForProject(projectId)) as any[];
    const wbsTree = await this.wbsService.getWBS(projectId);

    // Passo 1: Determinar estrutura de ondas
    const waveStructure = await this.planWaveStructure(project, tasks, dailyCapacityHours);

    if (!waveStructure) {
      this.logger.warn(`Fallback para modo determinístico (sem IA) para ${projectId}`);
      return this.createWavesDeterministic(
        projectId,
        project,
        tasks,
        wbsTree,
        dailyCapacityHours,
        waveLengthDays,
      );
    }

    // Passo 2: Agrupar tarefas nas ondas
    const aiPlan = await this.planWaveGrouping(
      project,
      tasks,
      waveStructure.recommendedWaveCount,
      wbsTree,
      dailyCapacityHours,
    );

    if (aiPlan) {
      return this.applyAIPlanToWaves(
        projectId,
        tasks,
        aiPlan,
        waveStructure.recommendedWaveCount,
        waveStructure.totalDurationDays,
      );
    }

    return this.createWavesDeterministic(
      projectId,
      project,
      tasks,
      wbsTree,
      dailyCapacityHours,
      waveLengthDays,
    );
  }

  /**
   * Obter todas as ondas de um projeto
   */
  async getWavesByProject(projectId: string): Promise<ProjectWave[]> {
    return this.waveModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ waveNumber: 1 })
      .exec();
  }

  /**
   * Atualizar status de uma onda
   */
  async updateWaveStatus(
    projectId: string,
    waveId: string,
    status: 'planned' | 'active' | 'completed',
  ): Promise<ProjectWave | null> {
    if (status === 'active') {
      await this.waveModel.updateMany(
        { projectId: new Types.ObjectId(projectId), status: 'active' },
        { status: 'planned' },
      );
    }

    return this.waveModel.findByIdAndUpdate(waveId, { status }, { new: true }).exec();
  }

  /**
   * Adicionar tarefa a uma onda
   */
  async addTaskToWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(waveId, { $addToSet: { taskIds: new Types.ObjectId(taskId) } }, { new: true })
      .exec();
  }

  /**
   * Remover tarefa de uma onda
   */
  async removeTaskFromWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(waveId, { $pull: { taskIds: new Types.ObjectId(taskId) } }, { new: true })
      .exec();
  }

  /**
   * Obter onda atual (em progresso)
   */
  async getCurrentWave(projectId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findOne({
        projectId: new Types.ObjectId(projectId),
        status: 'active',
      })
      .exec();
  }

  /**
   * Avançar para próxima onda
   */
  async advanceToNextWave(projectId: string): Promise<ProjectWave | null> {
    const currentWave = await this.getCurrentWave(projectId);
    if (currentWave) {
      const waveId = (currentWave as any)._id?.toString();
      if (waveId) {
        await this.updateWaveStatus(projectId, waveId, 'completed');
      }
    }

    const waves = await this.getWavesByProject(projectId);
    const plannedWave = waves.find((w) => w.status === 'planned');

    if (plannedWave) {
      const waveId = (plannedWave as any)._id?.toString();
      if (waveId) {
        return this.updateWaveStatus(projectId, waveId, 'active');
      }
    }

    return null;
  }

  async replanTaskDeadlines(projectId: string): Promise<ReplanTaskDeadlinesResult> {
    const waves = (await this.getWavesByProject(projectId)).sort(
      (left, right) => left.waveNumber - right.waveNumber,
    );

    if (waves.length === 0) {
      return {
        updatedCount: 0,
        skippedConcludedCount: 0,
        waveCount: 0,
        summaries: [],
      };
    }

    const uniqueTaskIds = Array.from(
      new Set(
        waves.flatMap((wave) =>
          (wave.taskIds || [])
            .map((taskId) => String(taskId))
            .filter((taskId) => Types.ObjectId.isValid(taskId)),
        ),
      ),
    );

    if (uniqueTaskIds.length === 0) {
      return {
        updatedCount: 0,
        skippedConcludedCount: 0,
        waveCount: waves.length,
        summaries: waves.map((wave) => ({
          waveNumber: wave.waveNumber,
          updatedTasks: 0,
          skippedConcludedTasks: 0,
          effectiveStartDate: null,
          effectiveEndDate: null,
        })),
      };
    }

    const projectQuery = Types.ObjectId.isValid(projectId) ? new Types.ObjectId(projectId) : projectId;
    const tasks = await this.taskModel
      .find({
        project: projectQuery,
        _id: { $in: uniqueTaskIds.map((taskId) => new Types.ObjectId(taskId)) },
      })
      .lean()
      .exec();

    const taskById = new Map(tasks.map((task: any) => [String(task._id), task]));
    const activeWaveIndex = waves.findIndex((wave) => wave.status === 'active');
    const firstPlannedWaveIndex = waves.findIndex((wave) => wave.status === 'planned');
    const anchorWaveIndex =
      activeWaveIndex >= 0 ? activeWaveIndex : firstPlannedWaveIndex >= 0 ? firstPlannedWaveIndex : 0;
    const dayMs = 24 * 60 * 60 * 1000;

    let cursor = startOfDay(new Date());
    let updatedCount = 0;
    let skippedConcludedCount = 0;
    const bulkOps: any[] = [];
    const summaries: ReplanTaskDeadlinesResult['summaries'] = [];

    for (let index = 0; index < waves.length; index++) {
      const wave = waves[index];
      const waveTasks = (wave.taskIds || [])
        .map((taskId) => taskById.get(String(taskId)))
        .filter(Boolean);

      const skippedConcludedTasks = waveTasks.filter((task) => Boolean(task?.isConcluded)).length;
      skippedConcludedCount += skippedConcludedTasks;

      const pendingTasks = waveTasks
        .filter((task) => !task?.isConcluded)
        .sort((left, right) => {
          const leftDeadline = left?.deadline
            ? new Date(left.deadline).getTime()
            : Number.POSITIVE_INFINITY;
          const rightDeadline = right?.deadline
            ? new Date(right.deadline).getTime()
            : Number.POSITIVE_INFINITY;
          if (leftDeadline !== rightDeadline) {
            return leftDeadline - rightDeadline;
          }

          const rightHours = estimateTaskHours(right);
          const leftHours = estimateTaskHours(left);
          if (rightHours !== leftHours) {
            return rightHours - leftHours;
          }

          const leftCreatedAt = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
          const rightCreatedAt = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
          return leftCreatedAt - rightCreatedAt;
        });

      if (pendingTasks.length === 0) {
        summaries.push({
          waveNumber: wave.waveNumber,
          updatedTasks: 0,
          skippedConcludedTasks,
          effectiveStartDate: null,
          effectiveEndDate: null,
        });
        continue;
      }

      const originalStart = startOfDay(new Date(wave.startDate));
      const originalEnd = endOfDay(new Date(wave.endDate));
      const originalDurationDays = Math.max(
        1,
        Math.ceil((startOfDay(originalEnd).getTime() - originalStart.getTime()) / dayMs) + 1,
      );

      const effectiveStart =
        index <= anchorWaveIndex
          ? startOfDay(cursor)
          : startOfDay(new Date(Math.max(cursor.getTime(), originalStart.getTime())));

      const effectiveEnd =
        originalEnd.getTime() >= effectiveStart.getTime()
          ? originalEnd
          : endOfDay(addDays(effectiveStart, Math.max(0, originalDurationDays - 1)));

      const availableDays = Math.max(
        1,
        Math.ceil(
          (startOfDay(effectiveEnd).getTime() - startOfDay(effectiveStart).getTime()) / dayMs,
        ) + 1,
      );
      const totalHours = pendingTasks.reduce(
        (sum, task) => sum + Math.max(0.25, estimateTaskHours(task)),
        0,
      );

      let cumulativeHours = 0;
      let waveUpdatedCount = 0;

      for (const task of pendingTasks) {
        cumulativeHours += Math.max(0.25, estimateTaskHours(task));

        const dayOffset = Math.min(
          availableDays - 1,
          Math.max(0, Math.ceil((cumulativeHours / totalHours) * availableDays) - 1),
        );
        const nextDeadline = endOfDay(addDays(effectiveStart, dayOffset));
        const currentDeadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;

        if (currentDeadlineTime === nextDeadline.getTime()) {
          continue;
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: task._id },
            update: {
              $set: {
                deadline: nextDeadline,
                late: !task?.isConcluded && nextDeadline.getTime() < Date.now(),
                ...buildTaskScheduleMetrics(task, nextDeadline),
              },
            },
          },
        });
        updatedCount++;
        waveUpdatedCount++;
      }

      summaries.push({
        waveNumber: wave.waveNumber,
        updatedTasks: waveUpdatedCount,
        skippedConcludedTasks,
        effectiveStartDate: effectiveStart.toISOString(),
        effectiveEndDate: effectiveEnd.toISOString(),
      });

      cursor = startOfDay(addDays(effectiveEnd, 1));
    }

    if (bulkOps.length > 0) {
      await this.taskModel.bulkWrite(bulkOps, { ordered: false });
      await this.projectsService.recalculateProjectStats(projectId);
    }

    this.logger.debug(
      `[REPLAN_DEADLINES] Projeto ${projectId}: ${updatedCount} tarefas atualizadas em ${waves.length} ondas`,
    );

    return {
      updatedCount,
      skippedConcludedCount,
      waveCount: waves.length,
      summaries,
    };
  }
}
