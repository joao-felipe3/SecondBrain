import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { ProjectDocument } from '../../schemas/project.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectWave, type ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { CPMService } from '../../../tasks/services/dependencies';
import { TaskDependency } from '../../../tasks/entities/task-dependency.entity';
import type { GanttDataResponse, GanttQueryOptions } from '../../dto/gantt.dto';
import * as ganttHelpers from './utils/gantt-helpers.util';

@Injectable()
export class GanttService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(ProjectWave.name)
    private readonly waveModel: Model<ProjectWaveDocument>,
    @Inject(forwardRef(() => CPMService))
    private readonly cpmService: CPMService,
  ) {}

  async getGanttData(
    projectId: string,
    options?: GanttQueryOptions,
  ): Promise<GanttDataResponse> {
    const project = await this.validateAndGetProject(projectId);
    const includeCompleted = options?.includeCompleted ?? true;
    const [tasks, dependencies, waves] = await this.fetchGanttRawData(projectId, includeCompleted);

    const taskNodes = ganttHelpers.buildTaskNodes({
      tasks,
      dependencies,
      normalizeRelationship: (rel) => this.cpmService.normalizeRelationship(rel),
    });
    const analysis = this.cpmService.calculateCriticalPath(taskNodes);

    const waveByTaskId = ganttHelpers.mapWavesByTaskId(waves);
    const fallbackProjectStart = ganttHelpers.calculateFallbackProjectStart(project, waves[0]);
    const metricsById = ganttHelpers.mapMetricsByTaskId(analysis.tasksByImpact);

    const taskItems = ganttHelpers.mapTaskItems({
      tasks,
      metricsById,
      waveByTaskId,
      project,
    });
    const dependencyItems = ganttHelpers.mapDependencyItems(dependencies);

    const { criticalPath, alerts, diagnostics, packageCriticality, projectDuration } = analysis;

    return {
      projectId,
      projectName: project.name || 'Projeto',
      projectStartDate: fallbackProjectStart.toISOString(),
      projectDeadline: project.deadline?.toISOString() ?? null,
      projectDurationHours: ganttHelpers.round2(projectDuration),
      tasks: taskItems,
      dependencies: dependencyItems,
      criticalPath,
      alerts,
      diagnostics,
      packageCriticality,
    };
  }

  private async validateAndGetProject(projectId: string): Promise<ProjectDocument> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID inválido: ${projectId}`);
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async fetchGanttRawData(
    projectId: string,
    includeCompleted: boolean,
  ): Promise<[TaskDocument[], TaskDependency[], ProjectWaveDocument[]]> {
    const query: FilterQuery<TaskDocument> = {
      project: projectId,
      ...(includeCompleted ? {} : { isConcluded: { $ne: true } }),
    };

    return Promise.all([
      this.taskModel.find(query).exec(),
      this.cpmService.getDependencies(projectId),
      this.waveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ]);
  }
}
