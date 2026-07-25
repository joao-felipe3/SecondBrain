import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectsService } from '../../projects.service';
import { RollingWavePlanningService } from './rolling-wave-planning.service';
import { DeterministicProjectInput } from '../../interfaces/rolling-wave.interface';

import { ReplanTaskDeadlinesResult } from '../../interfaces/rolling-wave.interface';

import { calculateReplannedDeadlines } from './utils/rolling-wave-replan-helpers.util';

@Injectable()
export class RollingWaveService {
  private readonly logger = new Logger(RollingWaveService.name);

  constructor(
    @InjectModel(ProjectWave.name)
    private waveModel: Model<ProjectWaveDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly rollingWavePlanningService: RollingWavePlanningService,
  ) {}

  async createInitialWaves(
    projectId: string,
    project: DeterministicProjectInput,
    waveLengthDays: number = 28,
  ): Promise<ProjectWave[]> {
    return this.rollingWavePlanningService.createInitialWaves(projectId, project, waveLengthDays);
  }

  async getWavesByProject(projectId: string): Promise<ProjectWaveDocument[]> {
    return this.waveModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ waveNumber: 1 })
      .exec();
  }

  async updateWaveStatus(
    projectId: string,
    waveId: string,
    status: 'planned' | 'active' | 'completed',
  ): Promise<ProjectWaveDocument | null> {
    if (status === 'active') {
      await this.waveModel.updateMany(
        { projectId: new Types.ObjectId(projectId), status: 'active' },
        { status: 'planned' },
      );
    }

    return this.waveModel
      .findByIdAndUpdate(String(waveId), { status: String(status) }, { new: true })
      .exec();
  }

  async addTaskToWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(
        String(waveId),
        { $addToSet: { taskIds: new Types.ObjectId(String(taskId)) } },
        { new: true },
      )
      .exec();
  }

  async removeTaskFromWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(waveId, { $pull: { taskIds: new Types.ObjectId(taskId) } }, { new: true })
      .exec();
  }

  async getCurrentWave(projectId: string): Promise<ProjectWaveDocument | null> {
    return this.waveModel
      .findOne({
        projectId: new Types.ObjectId(projectId),
        status: 'active',
      })
      .exec();
  }

  async advanceToNextWave(projectId: string): Promise<ProjectWaveDocument | null> {
    const currentWave = await this.getCurrentWave(projectId);
    if (currentWave) {
      const waveId = String(currentWave._id);
      if (waveId) {
        await this.updateWaveStatus(projectId, waveId, 'completed');
      }
    }

    const waves = await this.getWavesByProject(projectId);
    const plannedWave = waves.find((w) => w.status === 'planned');

    if (plannedWave) {
      const waveId = String(plannedWave._id);
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

    const result = calculateReplannedDeadlines({
      waves,
      tasks,
      now: new Date(),
    });

    if (result.bulkOps.length > 0) {
      await this.taskModel.bulkWrite(result.bulkOps as Parameters<typeof this.taskModel.bulkWrite>[0], {
        ordered: false,
      });
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
