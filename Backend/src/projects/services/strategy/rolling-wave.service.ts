import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MongoClient, ObjectId as NativeObjectId } from 'mongodb';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs/wbs.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

type WaveTask = {
  id: string;
  hours: number;
  deadlineTime: number | null;
  groupKey: string;
};

type WbsNodeFlat = {
  id: string;
  parentId?: string;
  level: number;
  name: string;
};

type AIPlanWave = {
  waveNumber: number;
  name: string;
  description: string;
  durationDays: number;
  focus: string;
  wbsAllocation: Record<string, number>; // { "WBS Name": quantidade de tasks }
  taskIds: string[]; // Preenchido depois pela aplicação
};

type AIPlan = {
  waves: AIPlanWave[];
  rationale: string;
};

type AIWaveStructure = {
  recommendedWaveCount: number;
  totalDurationDays: number;
  description: string;
  reasoning: string;
};

type ReplanTaskDeadlinesResult = {
  updatedCount: number;
  skippedConcludedCount: number;
  waveCount: number;
  summaries: Array<{
    waveNumber: number;
    updatedTasks: number;
    skippedConcludedTasks: number;
    effectiveStartDate: string | null;
    effectiveEndDate: string | null;
  }>;
};

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

  private flattenWbsTree(nodes: any[], acc: WbsNodeFlat[] = []): WbsNodeFlat[] {
    for (const node of nodes || []) {
      acc.push({
        id: String(node._id || node.id),
        parentId: node.parentId ? String(node.parentId) : undefined,
        level: Number(node.level || 1),
        name: String(node.name || 'Pacote WBS'),
      });
      if (node.children?.length) {
        this.flattenWbsTree(node.children, acc);
      }
    }
    return acc;
  }

  private estimateTaskHours(task: any): number {
    if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
      return task.pertExpectedMinutes / 60;
    }
    if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
      return task.pomodorosPlanned * 0.5;
    }
    return 1;
  }

  private startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private endOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(23, 59, 59, 999);
    return normalized;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private buildTaskScheduleMetrics(task: any, deadline: Date) {
    const expectedMinutes =
      typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0
        ? task.pertExpectedMinutes
        : typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0
          ? task.pomodorosPlanned * 25
          : undefined;

    if (!expectedMinutes) {
      return {};
    }

    const pomodorosPlanned =
      typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0
        ? task.pomodorosPlanned
        : Math.max(1, Math.round(expectedMinutes / 25));
    const pomodorosDid = typeof task?.pomodorosDid === 'number' ? task.pomodorosDid : 0;
    const progress = Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));

    const createdAt = task?.createdAt ? new Date(task.createdAt) : new Date();
    const totalDurationMs = deadline.getTime() - createdAt.getTime();
    const elapsedRatio =
      totalDurationMs <= 0
        ? 1
        : Math.max(0, Math.min(1, (Date.now() - createdAt.getTime()) / totalDurationMs));

    const plannedValue = expectedMinutes * elapsedRatio;
    const earnedValue = expectedMinutes * progress;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : progress > 0 ? 1 : 0;

    return {
      evmProgress: Number(progress.toFixed(2)),
      evmPlannedValueMinutes: Math.round(plannedValue),
      evmEarnedValueMinutes: Math.round(earnedValue),
      evmSchedulePerformanceIndex: Number(spi.toFixed(2)),
      evmAlert: spi > 0 && spi < 0.9 ? 'SPI abaixo de 0.9 (risco de atraso)' : undefined,
    };
  }

  private resolveGroupKey(
    task: any,
    wbsById: Map<string, WbsNodeFlat>,
    startTime: number,
    totalRangeMs: number,
  ): string {
    const parentWbsNodeId = task?.parentWbsNodeId ? String(task.parentWbsNodeId) : '';
    if (parentWbsNodeId && wbsById.has(parentWbsNodeId)) {
      const visited = new Set<string>();
      let cursor = wbsById.get(parentWbsNodeId);
      while (cursor?.parentId && wbsById.has(cursor.parentId) && !visited.has(cursor.parentId)) {
        visited.add(cursor.parentId);
        cursor = wbsById.get(cursor.parentId);
      }
      if (cursor?.name) {
        return `wbs:${cursor.name}`;
      }
    }

    const deadline = task?.deadline ? new Date(task.deadline) : null;
    const deadlineTime = deadline?.getTime() || null;
    if (deadlineTime && totalRangeMs > 0) {
      const ratio = (deadlineTime - startTime) / totalRangeMs;
      if (ratio <= 0.33) return 'goal:Curto Prazo';
      if (ratio <= 0.66) return 'goal:Médio Prazo';
      return 'goal:Longo Prazo';
    }

    return 'goal:Execução Geral';
  }

  private buildBalancedWaveDurations(totalDurationDays: number, waveCount: number): number[] {
    const safeWaveCount = Math.max(1, waveCount);
    const safeTotalDurationDays = Math.max(safeWaveCount, totalDurationDays);
    const baseDuration = Math.floor(safeTotalDurationDays / safeWaveCount);
    const remainder = safeTotalDurationDays % safeWaveCount;

    return Array.from(
      { length: safeWaveCount },
      (_, index) => baseDuration + (index < remainder ? 1 : 0),
    );
  }

  private normalizeWavePlanShape(
    aiPlan: AIPlan,
    expectedWaveCount: number,
    totalDurationDays: number,
  ): AIPlan {
    const durations = this.buildBalancedWaveDurations(totalDurationDays, expectedWaveCount);
    const existingWaves = Array.isArray(aiPlan.waves) ? aiPlan.waves : [];

    const normalizedWaves: AIPlanWave[] = Array.from({ length: expectedWaveCount }, (_, index) => {
      const existingWave = existingWaves[index];

      return {
        waveNumber: index + 1,
        name: existingWave?.name?.trim() || `Wave ${index + 1}`,
        description: existingWave?.description?.trim() || `Execução balanceada da Wave ${index + 1}.`,
        durationDays: durations[index],
        focus: existingWave?.focus?.trim() || `Entrega incremental da Wave ${index + 1}`,
        wbsAllocation: existingWave?.wbsAllocation || {},
        taskIds: Array.isArray(existingWave?.taskIds) ? [...existingWave.taskIds] : [],
      };
    });

    return {
      ...aiPlan,
      waves: normalizedWaves,
    };
  }

  private takeTaskForTransfer(
    waves: AIPlanWave[],
    donorIndex: number,
    recipientIndex: number,
  ): string | undefined {
    if (donorIndex < 0 || donorIndex >= waves.length || donorIndex === recipientIndex) {
      return undefined;
    }

    if (donorIndex < recipientIndex) {
      return waves[donorIndex].taskIds.pop();
    }

    return waves[donorIndex].taskIds.shift();
  }

  private findBestDonorIndex(
    waves: AIPlanWave[],
    recipientIndex: number,
    minimumCountToKeep: number,
  ): number {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestSurplus = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < waves.length; index++) {
      if (index === recipientIndex) {
        continue;
      }

      const surplus = waves[index].taskIds.length - minimumCountToKeep;
      if (surplus <= 0) {
        continue;
      }

      const distance = Math.abs(index - recipientIndex);
      if (distance < bestDistance || (distance === bestDistance && surplus > bestSurplus)) {
        bestIndex = index;
        bestDistance = distance;
        bestSurplus = surplus;
      }
    }

    return bestIndex;
  }

  private findBestRecipientIndex(
    waves: AIPlanWave[],
    donorIndex: number,
    maxTasksPerWave: number,
  ): number {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let lowestCount = Number.POSITIVE_INFINITY;

    for (let index = 0; index < waves.length; index++) {
      if (index === donorIndex || waves[index].taskIds.length >= maxTasksPerWave) {
        continue;
      }

      const distance = Math.abs(index - donorIndex);
      const currentCount = waves[index].taskIds.length;
      if (currentCount < lowestCount || (currentCount === lowestCount && distance < bestDistance)) {
        bestIndex = index;
        bestDistance = distance;
        lowestCount = currentCount;
      }
    }

    return bestIndex;
  }

  private redistributeTasksAcrossWaves(
    aiPlan: AIPlan,
    allTaskIds: string[],
    expectedWaveCount: number,
    totalDurationDays: number,
    minTasksPerWave: number,
    maxTasksPerWave: number,
  ): AIPlan {
    const normalizedPlan = this.normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);
    const validTaskIdSet = new Set(allTaskIds);
    const seenTaskIds = new Set<string>();

    for (const wave of normalizedPlan.waves) {
      const sanitizedTaskIds: string[] = [];
      for (const taskId of wave.taskIds || []) {
        if (!validTaskIdSet.has(taskId) || seenTaskIds.has(taskId)) {
          continue;
        }
        seenTaskIds.add(taskId);
        sanitizedTaskIds.push(taskId);
      }
      wave.taskIds = sanitizedTaskIds;
    }

    const missingTaskIds: string[] = [];
    for (const taskId of allTaskIds) {
      if (!seenTaskIds.has(taskId)) {
        missingTaskIds.push(taskId);
        seenTaskIds.add(taskId);
      }
    }

    while (missingTaskIds.length > 0) {
      let targetIndex = 0;
      for (let index = 1; index < normalizedPlan.waves.length; index++) {
        if (
          normalizedPlan.waves[index].taskIds.length < normalizedPlan.waves[targetIndex].taskIds.length
        ) {
          targetIndex = index;
        }
      }

      const taskId = missingTaskIds.shift();
      if (!taskId) {
        break;
      }
      normalizedPlan.waves[targetIndex].taskIds.push(taskId);
    }

    const recipientIndices = normalizedPlan.waves
      .map((wave, index) => ({ index, size: wave.taskIds.length }))
      .sort((left, right) => left.size - right.size || left.index - right.index)
      .map((item) => item.index);

    for (const recipientIndex of recipientIndices) {
      while (normalizedPlan.waves[recipientIndex].taskIds.length < minTasksPerWave) {
        let donorIndex = this.findBestDonorIndex(normalizedPlan.waves, recipientIndex, maxTasksPerWave);
        if (donorIndex < 0) {
          donorIndex = this.findBestDonorIndex(normalizedPlan.waves, recipientIndex, minTasksPerWave);
        }
        if (donorIndex < 0) {
          break;
        }

        const taskId = this.takeTaskForTransfer(normalizedPlan.waves, donorIndex, recipientIndex);
        if (!taskId) {
          break;
        }

        normalizedPlan.waves[recipientIndex].taskIds.push(taskId);
      }
    }

    for (let donorIndex = 0; donorIndex < normalizedPlan.waves.length; donorIndex++) {
      while (normalizedPlan.waves[donorIndex].taskIds.length > maxTasksPerWave) {
        const recipientIndex = this.findBestRecipientIndex(
          normalizedPlan.waves,
          donorIndex,
          maxTasksPerWave,
        );
        if (recipientIndex < 0) {
          break;
        }

        const taskId = this.takeTaskForTransfer(normalizedPlan.waves, donorIndex, recipientIndex);
        if (!taskId) {
          break;
        }

        normalizedPlan.waves[recipientIndex].taskIds.push(taskId);
      }
    }

    return normalizedPlan;
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
      const totalTaskHours = tasks.reduce((sum, t) => sum + this.estimateTaskHours(t), 0);
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
      const parsed = this.extractAndValidateJSON<AIWaveStructure>(responseText, [
        'recommendedWaveCount',
        'totalDurationDays',
        'description',
        'reasoning',
      ]);

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
    } catch (error) {
      this.logger.warn(`Erro ao chamar Gemini para estrutura: ${error.message}`);
      return null;
    }
  }

  /**
   * Sanitizar JSON malformado do Gemini (limpar quotes não escapadas, newlines, etc)
   */
  private sanitizeJSON(jsonString: string): string {
    try {
      let result = jsonString;

      // Caso 1: Remover quebras de linha dentro de strings literais
      // Padrão: "fieldName": "value with\nliteral newline"
      // Abordagem: processar caractere por caractere para escapar newlines em valores string
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

        // Se estamos dentro de uma string e encontramos newline, substituir por espaço
        if (inString && (char === '\n' || char === '\r')) {
          chars.push(' ');
          continue;
        }

        chars.push(char);
      }

      result = chars.join('');

      // Caso 2: Trailing commas antes de }
      result = result.replace(/,\s*}/g, '}');
      result = result.replace(/,\s*]/g, ']');

      // Caso 3: Escapar aspas duplas não escapadas dentro de strings
      result = result.replace(/"([^"]*?)(['"])([^"]*?)"/g, (match, prefix, quote, suffix) => {
        if (quote === "'") {
          // Apóstrofo dentro de string - É seguro deixar
          return match;
        }
        return match;
      });

      return result;
    } catch (e) {
      this.logger.warn(`[JSON_SANITIZE] Erro ao sanitizar: ${e.message}`);
      return jsonString;
    }
  }

  /**
   * Validar e extrair JSON de resposta Gemini
   */
  private extractAndValidateJSON<T extends Record<string, any>>(
    responseText: string,
    requiredFields: string[],
  ): T | null {
    try {
      // Limpar markdown code blocks
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[\s\n]*```/gm, '')
        .replace(/```[\s\n]*$/gm, '')
        .trim();

      // Extrair JSON
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');

      if (jsonStart < 0 || jsonEnd <= jsonStart) {
        this.logger.warn(`[JSON_EXTRACT] Nenhum JSON encontrado na resposta`);
        return null;
      }

      let jsonString = cleaned.substring(jsonStart, jsonEnd + 1);

      // Validar que JSON é completo (termina com })
      if (!jsonString.endsWith('}')) {
        this.logger.warn(
          `[JSON_INCOMPLETE] JSON não termina com "}" - truncado?\nEnd: ...${jsonString.substring(Math.max(0, jsonString.length - 100))}`,
        );
        return null;
      }

      // Sanitizar JSON malformado
      jsonString = this.sanitizeJSON(jsonString);

      // Tentar parsear para any e validar campos antes de coagir ao tipo T
      const parsedAny: any = JSON.parse(jsonString);

      // Validar campos obrigatórios
      for (const field of requiredFields) {
        if (!(field in parsedAny)) {
          this.logger.warn(`[JSON_MISSING_FIELD] Campo obrigatório ausente: ${field}`);
          return null;
        }
      }

      return parsedAny as T;
    } catch (e) {
      this.logger.warn(`[JSON_PARSE_ERROR] ${e.message}\nResponse: ${responseText.substring(0, 400)}`);
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
      const waveDurations = this.buildBalancedWaveDurations(totalAvailableDays, waveCount);

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

      const parsed = this.extractAndValidateJSON<AIPlan>(responseText, ['waves', 'rationale']);

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

      const normalizedPlan = this.normalizeWavePlanShape(parsed, waveCount, totalAvailableDays);
      const taskCursorByWbs = new Map<string, number>();
      const allTaskIds = tasks.map((t) => String(t._id || t.id));

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

    const normalizedPlan = this.normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);

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

    const redistributedPlan = this.redistributeTasksAcrossWaves(
      normalizedPlan,
      allTaskIds,
      expectedWaveCount,
      totalDurationDays,
      minTasksPerWave,
      maxTasksPerWave,
    );

    // Log Final
    const finalCounts = redistributedPlan.waves.map((w) => w.taskIds.length);
    this.logger.debug(`[REBALANCE] Distribuição final:`);
    for (const wave of redistributedPlan.waves) {
      this.logger.debug(`  Wave ${wave.waveNumber}: ${wave.taskIds.length} tasks`);
    }

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
    const validPlan = this.normalizeWavePlanShape(
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

    const totalTaskHours = tasks.reduce((sum, task) => sum + this.estimateTaskHours(task), 0);
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

    const wbsFlat = this.flattenWbsTree(wbsTree);
    const wbsById = new Map(wbsFlat.map((node) => [node.id, node]));

    const timelineRangeMs = Math.max(1, effectiveDurationDays * dayMs);
    const normalizedTasks: WaveTask[] = tasks.map((task: any) => {
      const id = String(task._id || task.id);
      const hours = this.estimateTaskHours(task);
      const deadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;
      const groupKey = this.resolveGroupKey(task, wbsById, today.getTime(), timelineRangeMs);
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

    let cursor = this.startOfDay(new Date());
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

          const rightHours = this.estimateTaskHours(right);
          const leftHours = this.estimateTaskHours(left);
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

      const originalStart = this.startOfDay(new Date(wave.startDate));
      const originalEnd = this.endOfDay(new Date(wave.endDate));
      const originalDurationDays = Math.max(
        1,
        Math.ceil((this.startOfDay(originalEnd).getTime() - originalStart.getTime()) / dayMs) + 1,
      );

      const effectiveStart =
        index <= anchorWaveIndex
          ? this.startOfDay(cursor)
          : this.startOfDay(new Date(Math.max(cursor.getTime(), originalStart.getTime())));

      const effectiveEnd =
        originalEnd.getTime() >= effectiveStart.getTime()
          ? originalEnd
          : this.endOfDay(this.addDays(effectiveStart, Math.max(0, originalDurationDays - 1)));

      const availableDays = Math.max(
        1,
        Math.ceil(
          (this.startOfDay(effectiveEnd).getTime() - this.startOfDay(effectiveStart).getTime()) / dayMs,
        ) + 1,
      );
      const totalHours = pendingTasks.reduce(
        (sum, task) => sum + Math.max(0.25, this.estimateTaskHours(task)),
        0,
      );

      let cumulativeHours = 0;
      let waveUpdatedCount = 0;

      for (const task of pendingTasks) {
        cumulativeHours += Math.max(0.25, this.estimateTaskHours(task));

        const dayOffset = Math.min(
          availableDays - 1,
          Math.max(0, Math.ceil((cumulativeHours / totalHours) * availableDays) - 1),
        );
        const nextDeadline = this.endOfDay(this.addDays(effectiveStart, dayOffset));
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
                ...this.buildTaskScheduleMetrics(task, nextDeadline),
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

      cursor = this.startOfDay(this.addDays(effectiveEnd, 1));
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
