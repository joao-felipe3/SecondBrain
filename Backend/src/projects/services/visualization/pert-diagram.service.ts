import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { ProjectDocument } from '../../schemas/project.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { CPMService, type TaskNode } from '../../../tasks/services/dependencies';
import type { PertDiagramDataResponse } from '../../dto/pert-diagram.dto';
import * as pertHelpers from './utils/pert-helpers.util';

@Injectable()
export class PertDiagramService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
    private readonly cpmService: CPMService,
  ) {}

  async getPertDiagramData(
    projectId: string,
    options?: { includeCompleted?: boolean },
  ): Promise<PertDiagramDataResponse> {
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

    const includeCompleted = options?.includeCompleted ?? true;
    const query: FilterQuery<TaskDocument> = { project: projectId };
    if (!includeCompleted) query.isConcluded = { $ne: true };

    const [tasks, dependencies] = await Promise.all([
      this.taskModel.find(query).exec(),
      this.cpmService.getDependencies(projectId),
    ]);

    const taskNodes = pertHelpers.buildTaskNodes({
      tasks,
      dependencies,
      normalizeRelationship: (rel) => this.cpmService.normalizeRelationship(rel),
    });
    const analysis = this.cpmService.calculateCriticalPath(taskNodes);

    const metricsById = new Map<string, TaskNode>();
    for (const metric of analysis.tasksByImpact) {
      metricsById.set(metric.id, metric);
    }

    const taskNodesById = new Map<string, TaskNode>();
    for (const node of taskNodes) {
      taskNodesById.set(node.id, node);
    }

    const taskLevels = pertHelpers.computeTaskLevels(tasks, dependencies);
    const nodes = pertHelpers.mapNodes({ tasks, metricsById, taskLevels });
    const edges = pertHelpers.mapEdges({
      dependencies,
      taskNodesById,
      criticalPath: analysis.criticalPath,
    });

    const totalTasks = nodes.length;
    const criticalTasks = nodes.filter((node) => node.isCritical).length;

    return {
      projectId,
      projectName: String(project.name || 'Projeto'),
      projectDurationHours: pertHelpers.round2(analysis.projectDuration),
      nodes,
      edges,
      criticalPath: analysis.criticalPath,
      alerts: analysis.alerts,
      statistics: {
        totalTasks,
        criticalTasks,
        criticalPercent: totalTasks > 0 ? pertHelpers.round2((criticalTasks / totalTasks) * 100) : 0,
        totalEdges: edges.length,
        maxParallelism: pertHelpers.round2(analysis.diagnostics?.impliedParallelism || 0),
      },
      diagnostics: analysis.diagnostics,
      packageCriticality: analysis.packageCriticality,
    };
  }
}
