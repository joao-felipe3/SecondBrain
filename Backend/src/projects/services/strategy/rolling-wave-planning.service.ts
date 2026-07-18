import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs';
import { RollingWaveAIService } from '../../../ai/services/projects/rolling-wave-ai.service';
import { AIPlan } from '../../interfaces/rolling-wave.interface';
import { normalizeWavePlanShape } from './utils/rolling-wave-helpers.util';
import {
  executeWithFreshMongoClient,
  persistWaveIncrementalChunked,
} from './utils/rolling-wave-db-helpers.util';
import { partitionTasksDeterministically } from './utils/rolling-wave-deterministic-helpers.util';

@Injectable()
export class RollingWavePlanningService {
  private readonly logger = new Logger(RollingWavePlanningService.name);

  constructor(
    @InjectModel(ProjectWave.name)
    private waveModel: Model<ProjectWaveDocument>,
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
    private readonly rollingWaveAIService: RollingWaveAIService,
  ) {}

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const partitionResult = partitionTasksDeterministically({
      project,
      tasks,
      wbsTree,
      dailyCapacityHours,
      waveLengthDays,
      today,
    });

    if (partitionResult.adjustedDeadline) {
      await this.projectsService.update(projectId, {
        deadline: partitionResult.adjustedDeadline,
      } as any);
      this.logger.warn(
        `Deadline ajustado para ${partitionResult.adjustedDeadline.toISOString()} (requer mais dias)`,
      );
    }

    await this.waveModel.deleteMany({
      projectId: new Types.ObjectId(projectId),
    });

    const waves: ProjectWave[] = [];
    for (const waveData of partitionResult.waves) {
      const wave = new this.waveModel({
        projectId: new Types.ObjectId(projectId),
        waveNumber: waveData.waveNumber,
        startDate: waveData.startDate,
        endDate: waveData.endDate,
        status: waveData.status,
        taskIds: waveData.taskIds,
        description: waveData.description,
      });

      await wave.save();
      waves.push(wave);
    }

    this.logger.debug(`Criadas ${waves.length} ondas (determinísticas) para ${projectId}`);

    return waves;
  }

  private prepareWavesAndBulkOps(
    projectId: string,
    validPlan: any,
    taskMap: Map<string, any>,
    today: Date,
    dayMs: number,
  ): {
    waveNumbersToKeep: number[];
    bulkOps: any[];
    preparedWaves: Array<{
      waveNumber: number;
      startDate: Date;
      endDate: Date;
      status: 'planned';
      taskIds: Types.ObjectId[];
      description?: string;
    }>;
  } {
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
        if (taskMap.has(taskId)) {
          try {
            validTaskIds.push(new Types.ObjectId(taskId));
          } catch (e) {
            this.logger.warn(`[WARN] ID inválido (ObjectId parse failed): ${taskId}`);
            notFoundCount++;
          }
        } else {
          notFoundCount++;
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

    return { waveNumbersToKeep, bulkOps, preparedWaves };
  }

  private async persistWavesToDb(
    projectId: string,
    bulkOps: any[],
    preparedWaves: any[],
  ): Promise<void> {
    const bulkResult = await executeWithFreshMongoClient({
      waveModel: this.waveModel,
      operation: (collection) => collection.bulkWrite(bulkOps, { ordered: true }),
      operationName: `bulkWrite waves for project ${projectId}`,
      logger: this.logger,
      maxAttempts: 5,
    });
    if (bulkResult === null) {
      this.logger.warn(
        `[MONGO_FALLBACK] bulkWrite falhou. Tentando persistência incremental em chunks por onda...`,
      );

      for (const wave of preparedWaves) {
        const persisted = await persistWaveIncrementalChunked({
          waveModel: this.waveModel,
          projectId,
          wave,
          logger: this.logger,
          chunkSize: 25,
        });
        if (!persisted) {
          this.logger.error(
            `Falha ao persistir Wave ${wave.waveNumber} no fallback incremental em chunks.`,
          );
          throw new Error('Database operation failed after retries');
        }
      }
    }
  }

  private async cleanupAndFetchWaves(
    projectId: string,
    waveNumbersToKeep: number[],
    dayMs: number,
  ): Promise<ProjectWave[]> {
    const projectObjectId = new Types.ObjectId(projectId);
    const cleanupResult = await executeWithFreshMongoClient({
      waveModel: this.waveModel,
      operation: (collection) =>
        collection.deleteMany({
          projectId: projectObjectId,
          waveNumber: { $nin: waveNumbersToKeep },
        }),
      operationName: `cleanup stale waves for project ${projectId}`,
      logger: this.logger,
      maxAttempts: 5,
    });
    if (cleanupResult === null) {
      this.logger.error(`Falha ao limpar waves antigas após bulkWrite.`);
      throw new Error('Database operation failed after retries');
    }

    const wavesResult = await executeWithFreshMongoClient({
      waveModel: this.waveModel,
      operation: (collection) =>
        collection.find({ projectId: projectObjectId }).sort({ waveNumber: 1 }).toArray(),
      operationName: `fetch saved waves for project ${projectId}`,
      logger: this.logger,
      maxAttempts: 5,
    });
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

  private async applyAIPlanToWaves(
    projectId: string,
    tasks: any[],
    aiPlan: AIPlan,
    expectedWaveCount: number,
    totalDurationDays: number,
  ): Promise<ProjectWave[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const validPlan = normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);

    const taskMap = new Map(tasks.map((t: any) => [String(t._id || t.id), t]));

    this.logger.debug(`[DEBUG] Plano após normalização (${validPlan.waves.length} ondas):`);
    for (const wave of validPlan.waves) {
      this.logger.debug(
        `  Wave ${wave.waveNumber}: ${wave.taskIds.length} taskIds = [${wave.taskIds.slice(0, 3).join(', ')}${wave.taskIds.length > 3 ? '...' : ''}]`,
      );
    }

    const { waveNumbersToKeep, bulkOps, preparedWaves } = this.prepareWavesAndBulkOps(
      projectId,
      validPlan,
      taskMap,
      today,
      dayMs,
    );

    await this.persistWavesToDb(projectId, bulkOps, preparedWaves);

    return this.cleanupAndFetchWaves(projectId, waveNumbersToKeep, dayMs);
  }

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
    const waveStructure = await this.rollingWaveAIService.planWaveStructure({
      project,
      tasks,
      dailyCapacityHours,
    });

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
    const aiPlan = await this.rollingWaveAIService.planWaveGrouping({
      project,
      tasks,
      waveCount: waveStructure.recommendedWaveCount,
      wbsTree,
      dailyCapacityHours,
    });

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
}
