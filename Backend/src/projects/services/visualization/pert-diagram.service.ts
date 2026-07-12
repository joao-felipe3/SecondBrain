import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectDocument } from '../../schemas/project.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { CPMService, type TaskNode } from '../../../tasks/services/dependencies';
import type { PertDiagramDataResponse } from '../../dto/pert-diagram.dto';

@Injectable()
export class PertDiagramService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
    @Inject(forwardRef(() => CPMService))
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
    const query: Record<string, any> = { project: projectId };
    if (!includeCompleted) query.isConcluded = { $ne: true };

    const [tasks, dependencies] = await Promise.all([
      this.taskModel.find(query).exec(),
      this.cpmService.getDependencies(projectId),
    ]);

    const taskNodes = this.buildTaskNodes(tasks, dependencies);
    const analysis = this.cpmService.calculateCriticalPath(taskNodes);

    const metricsById = new Map<string, TaskNode>();
    for (const metric of analysis.tasksByImpact) {
      metricsById.set(metric.id, metric);
    }

    const taskNodesById = new Map<string, any>();
    for (const node of taskNodes) {
      taskNodesById.set(node.id, node);
    }

    const taskLevels = this.computeTaskLevels(tasks, dependencies);
    const nodes = this.mapNodes(tasks, metricsById, taskLevels);
    const edges = this.mapEdges(
      dependencies,
      taskNodesById,
      analysis.criticalPath,
    ) as PertDiagramDataResponse['edges'];

    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
    const totalTasks = nodes.length;
    const criticalTasks = nodes.filter((node) => node.isCritical).length;

    return {
      projectId,
      projectName: String(project.name || 'Projeto'),
      projectDurationHours: round2(analysis.projectDuration),
      nodes,
      edges,
      criticalPath: analysis.criticalPath,
      alerts: analysis.alerts,
      statistics: {
        totalTasks,
        criticalTasks,
        criticalPercent: totalTasks > 0 ? round2((criticalTasks / totalTasks) * 100) : 0,
        totalEdges: edges.length,
        maxParallelism: round2(analysis.diagnostics?.impliedParallelism || 0),
      },
      diagnostics: analysis.diagnostics,
      packageCriticality: analysis.packageCriticality,
    };
  }

  private toMinutes(task: any): number {
    if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
      return task.pertExpectedMinutes;
    }
    if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
      return task.pomodorosPlanned * 25;
    }
    return 60;
  }

  private buildTaskNodes(tasks: any[], dependencies: any[]): TaskNode[] {
    const taskNodes: TaskNode[] = tasks.map((task: any) => ({
      id: task?._id?.toString?.() || String(task?.id || ''),
      name: String(task?.title || task?.name || 'Task'),
      duration: this.toMinutes(task),
      dependencies: [],
      dependencyEdges: [],
      parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
      wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
    }));

    const nodeById = new Map<string, TaskNode>();
    for (const node of taskNodes) {
      nodeById.set(node.id, node);
    }

    for (const dep of dependencies) {
      const taskId = String(dep?.taskId || '').trim();
      const dependsOnTaskId = String(dep?.dependsOnTaskId || '').trim();
      if (!taskId || !dependsOnTaskId) continue;
      const node = nodeById.get(taskId);
      if (node) {
        node.dependencies.push(dependsOnTaskId);
        node.dependencyEdges?.push({
          predecessorId: dependsOnTaskId,
          relationship: this.cpmService.normalizeRelationship(dep?.relationship),
        });
      }
    }

    return taskNodes;
  }

  private computeTaskLevels(tasks: any[], dependencies: any[]): Map<string, number> {
    const predecessorMap = new Map<string, Set<string>>();
    for (const task of tasks) {
      const id = task?._id?.toString?.() || String(task?.id || '');
      predecessorMap.set(id, new Set<string>());
    }

    for (const dep of dependencies) {
      const target = String(dep?.taskId || '').trim();
      const source = String(dep?.dependsOnTaskId || '').trim();
      if (!predecessorMap.has(target) || !predecessorMap.has(source)) continue;
      predecessorMap.get(target)!.add(source);
    }

    const levelMemo = new Map<string, number>();
    const computeLevel = (taskId: string, stack = new Set<string>()): number => {
      if (levelMemo.has(taskId)) return levelMemo.get(taskId)!;
      if (stack.has(taskId)) return 0;
      stack.add(taskId);
      const predecessors = Array.from(predecessorMap.get(taskId) || []);
      if (predecessors.length === 0) {
        levelMemo.set(taskId, 0);
        stack.delete(taskId);
        return 0;
      }

      const level = 1 + Math.max(...predecessors.map((id) => computeLevel(id, stack)));
      levelMemo.set(taskId, level);
      stack.delete(taskId);
      return level;
    };

    const taskLevels = new Map<string, number>();
    for (const task of tasks) {
      const id = task?._id?.toString?.() || String(task?.id || '');
      taskLevels.set(id, computeLevel(id));
    }
    return taskLevels;
  }

  private mapNodes(tasks: any[], metricsById: Map<string, TaskNode>, taskLevels: Map<string, number>) {
    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

    return tasks.map((task: any) => {
      const id = task?._id?.toString?.() || String(task?.id || '');
      const metric = metricsById.get(id);
      const durationHours = round2(this.toMinutes(task) / 60);
      const earlyStart = round2(metric?.earlyStart ?? 0);
      const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
      const lateStart = round2(metric?.lateStart ?? earlyStart);
      const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
      const slack = round2(metric?.slack ?? 0);
      const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
      const level = taskLevels.get(id) ?? 0;
      return {
        id,
        name: String(task?.title || task?.name || 'Task'),
        durationHours,
        earlyStart,
        earlyFinish,
        lateStart,
        lateFinish,
        slack,
        isCritical: Boolean(metric?.isCritical),
        progress: round2(progress),
        isConcluded: Boolean(task?.isConcluded),
        priority: Number(task?.priority || 0),
        parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
        wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
        x: level,
        y: earlyStart,
      };
    });
  }

  private mapEdges(dependencies: any[], taskNodesById: Map<string, any>, criticalPath: string[]) {
    const criticalSet = new Set(criticalPath || []);
    return dependencies
      .map((dep: any) => {
        const source = String(dep?.dependsOnTaskId || '').trim();
        const target = String(dep?.taskId || '').trim();
        if (!source || !target || !taskNodesById.has(source) || !taskNodesById.has(target)) return null;

        return {
          id: dep?._id?.toString?.() || `${source}-${target}`,
          source,
          target,
          relationship: (dep?.relationship || 'finish-to-start') as
            | 'finish-to-start'
            | 'start-to-start'
            | 'finish-to-finish',
          reason: dep?.reason ? String(dep.reason) : undefined,
          isAutoIdentified: Boolean(dep?.isAutoIdentified),
          isCriticalEdge: criticalSet.has(source) && criticalSet.has(target),
        };
      })
      .filter(Boolean);
  }
}
