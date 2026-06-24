import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs/wbs.service';
import { RollingWaveAIService } from './rolling-wave-ai.service';

import {
  AIPlan,
  ReplanTaskDeadlinesResult,
} from '../../interfaces/rolling-wave.interface';

import { normalizeWavePlanShape } from './utils/rolling-wave-helpers.util';
import {
  executeWithFreshMongoClient,
  persistWaveIncrementalChunked,
} from './utils/rolling-wave-db-helpers.util';
import { partitionTasksDeterministically } from './utils/rolling-wave-deterministic-helpers.util';
import { calculateReplannedDeadlines } from './utils/rolling-wave-replan-helpers.util';

@Injectable()
export class RollingWaveService {
  private readonly logger = new Logger(RollingWaveService.name);

  constructor(
    @InjectModel(ProjectWave.name)
    private waveModel: Model<ProjectWaveDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
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

    const partitionResult = partitionTasksDeterministically(
      project,
      tasks,
      wbsTree,
      dailyCapacityHours,
      waveLengthDays,
      today,
    );

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
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const validPlan = normalizeWavePlanShape(
      aiPlan,
      expectedWaveCount,
      totalDurationDays,
    );

    const taskMap = new Map(tasks.map((t: any) => [String(t._id || t.id), t]));

    this.logger.debug(`[DEBUG] Plano após normalização (${validPlan.waves.length} ondas):`);
    for (const wave of validPlan.waves) {
      this.logger.debug(
        `  Wave ${wave.waveNumber}: ${wave.taskIds.length} taskIds = [${wave.taskIds.slice(0, 3).join(', ')}${wave.taskIds.length > 3 ? '...' : ''}]`,
      );
    }

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

    const bulkResult = await executeWithFreshMongoClient(
      this.waveModel,
      (collection) => collection.bulkWrite(bulkOps, { ordered: true }),
      `bulkWrite waves for project ${projectId}`,
      this.logger,
      5,
    );
    if (bulkResult === null) {
      this.logger.warn(
        `[MONGO_FALLBACK] bulkWrite falhou. Tentando persistência incremental em chunks por onda...`,
      );

      for (const wave of preparedWaves) {
        const persisted = await persistWaveIncrementalChunked(
          this.waveModel,
          projectId,
          wave,
          this.logger,
          25,
        );
        if (!persisted) {
          this.logger.error(
            `Falha ao persistir Wave ${wave.waveNumber} no fallback incremental em chunks.`,
          );
          throw new Error('Database operation failed after retries');
        }
      }
    }

    const cleanupResult = await executeWithFreshMongoClient(
      this.waveModel,
      (collection) =>
        collection.deleteMany({
          projectId: projectObjectId,
          waveNumber: { $nin: waveNumbersToKeep },
        }),
      `cleanup stale waves for project ${projectId}`,
      this.logger,
      5,
    );
    if (cleanupResult === null) {
      this.logger.error(`Falha ao limpar waves antigas após bulkWrite.`);
      throw new Error('Database operation failed after retries');
    }

    const wavesResult = await executeWithFreshMongoClient(
      this.waveModel,
      (collection) =>
        collection.find({ projectId: projectObjectId }).sort({ waveNumber: 1 }).toArray(),
      `fetch saved waves for project ${projectId}`,
      this.logger,
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
    const waveStructure = await this.rollingWaveAIService.planWaveStructure(
      project,
      tasks,
      dailyCapacityHours,
    );

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
    const aiPlan = await this.rollingWaveAIService.planWaveGrouping(
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

    const result = calculateReplannedDeadlines(waves, tasks, new Date());

    if (result.bulkOps.length > 0) {
      await this.taskModel.bulkWrite(result.bulkOps, { ordered: false });
      await this.projectsService.recalculateProjectStats(projectId);
    }

    this.logger.debug(
      `[REPLAN_DEADLINES] Projeto ${projectId}: ${result.updatedCount} tarefas atualizadas em ${waves.length} ondas`,
    );

    return {
      updatedCount: result.updatedCount,
      skippedConcludedCount: result.skippedConcludedCount,
      waveCount: waves.length,
      summaries: result.summaries,
    };
  }
}
