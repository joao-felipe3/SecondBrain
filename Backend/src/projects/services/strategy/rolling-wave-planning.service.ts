import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs';
import { RollingWaveAIService } from '../../../ai/services/projects/rolling-wave-ai.service';
import { AIPlan, DeterministicProjectInput } from '../../interfaces/rolling-wave.interface';
import { UpdateProjectDto } from '../../dto/update-project.dto';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { normalizeWavePlanShape } from './utils/rolling-wave-helpers.util';
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
    project: DeterministicProjectInput,
    tasks: TaskDocument[],
    wbsTree: WBSNodeDto[],
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
      const updateDto: UpdateProjectDto = {
        deadline: partitionResult.adjustedDeadline,
      };
      await this.projectsService.update(projectId, updateDto);
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
    validPlan: AIPlan,
    taskMap: Map<string, TaskDocument>,
    today: Date,
    dayMs: number,
  ): {
    waveNumbersToKeep: number[];
    preparedWaves: Array<{
      waveNumber: number;
      startDate: Date;
      endDate: Date;
      status: 'planned';
      taskIds: Types.ObjectId[];
      description?: string;
    }>;
  } {
    const waveNumbersToKeep: number[] = [];
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
          } catch {
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

      currentWaveStart = waveEnd;
    }

    return { waveNumbersToKeep, preparedWaves };
  }

  private async persistWavesToDb(
    projectId: string,
    preparedWaves: Array<{
      waveNumber: number;
      startDate: Date;
      endDate: Date;
      status: 'planned';
      taskIds: Types.ObjectId[];
      description?: string;
    }>,
  ): Promise<void> {
    for (const wave of preparedWaves) {
      await this.waveModel
        .findOneAndUpdate(
          {
            projectId: new Types.ObjectId(projectId),
            waveNumber: wave.waveNumber,
          },
          {
            projectId: new Types.ObjectId(projectId),
            waveNumber: wave.waveNumber,
            startDate: wave.startDate,
            endDate: wave.endDate,
            status: wave.status,
            taskIds: wave.taskIds,
            description: wave.description,
          },
          { upsert: true, new: true },
        )
        .exec();
    }
  }

  private async cleanupAndFetchWaves(
    projectId: string,
    waveNumbersToKeep: number[],
    dayMs: number,
  ): Promise<ProjectWave[]> {
    const projectObjectId = new Types.ObjectId(projectId);
    await this.waveModel
      .deleteMany({
        projectId: projectObjectId,
        waveNumber: { $nin: waveNumbersToKeep },
      })
      .exec();

    const waves = await this.waveModel
      .find({ projectId: projectObjectId })
      .sort({ waveNumber: 1 })
      .exec();
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
    tasks: TaskDocument[],
    aiPlan: AIPlan,
    expectedWaveCount: number,
    totalDurationDays: number,
  ): Promise<ProjectWave[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const validPlan = normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);

    const taskMap = new Map<string, TaskDocument>(tasks.map((task) => [String(task._id), task]));

    this.logger.debug(`[DEBUG] Plano após normalização (${validPlan.waves.length} ondas):`);
    for (const wave of validPlan.waves) {
      this.logger.debug(
        `  Wave ${wave.waveNumber}: ${wave.taskIds.length} taskIds = [${wave.taskIds.slice(0, 3).join(', ')}${wave.taskIds.length > 3 ? '...' : ''}]`,
      );
    }

    const { waveNumbersToKeep, preparedWaves } = this.prepareWavesAndBulkOps(
      projectId,
      validPlan,
      taskMap,
      today,
      dayMs,
    );

    await this.persistWavesToDb(projectId, preparedWaves);

    return this.cleanupAndFetchWaves(projectId, waveNumbersToKeep, dayMs);
  }

  async createInitialWaves(
    projectId: string,
    project: DeterministicProjectInput,
    waveLengthDays: number = 28,
  ): Promise<ProjectWave[]> {
    const dailyCapacityHours = Number(process.env.ROLLING_WAVE_DAILY_CAPACITY_HOURS || 6);

    this.logger.debug(`Planejando ondas inteligentes (2-step IA) para projeto ${projectId}`);

    const tasks = await this.projectsService.getTasksForProject(projectId);
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
