import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectDocument } from '../../schemas/project.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectWave, type ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { CPMService, type TaskNode } from '../../../tasks/services/dependencies';
import type { GanttDataResponse } from '../../dto/gantt.dto';

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
    options?: { includeCompleted?: boolean },
  ): Promise<GanttDataResponse> {
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

    const [tasks, dependencies, waves] = await Promise.all([
      this.taskModel.find(query).exec(),
      this.cpmService.getDependencies(projectId),
      this.waveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ]);

    const taskNodes = this.buildTaskNodes(tasks, dependencies);
    const analysis = this.cpmService.calculateCriticalPath(taskNodes);

    const waveByTaskId = new Map<string, ProjectWaveDocument>();
    for (const wave of waves) {
      for (const taskId of wave.taskIds || []) {
        waveByTaskId.set(String(taskId), wave);
      }
    }

    const fallbackProjectStart = project.startDate
      ? new Date(project.startDate)
      : waves[0]?.startDate
        ? new Date(waves[0].startDate)
        : new Date();

    const metricsById = new Map<string, TaskNode>();
    for (const metric of analysis.tasksByImpact) {
      metricsById.set(metric.id, metric);
    }

    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

    const taskItems = this.mapTaskItems(tasks, metricsById, waveByTaskId, project);
    const dependencyItems = this.mapDependencyItems(dependencies);

    return {
      projectId,
      projectName: String(project.name || 'Projeto'),
      projectStartDate: fallbackProjectStart.toISOString(),
      projectDeadline: project.deadline ? new Date(project.deadline).toISOString() : null,
      projectDurationHours: round2(analysis.projectDuration),
      tasks: taskItems,
      dependencies: dependencyItems,
      criticalPath: analysis.criticalPath,
      alerts: analysis.alerts,
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
    for (const node of taskNodes) nodeById.set(node.id, node);

    for (const dep of dependencies as any[]) {
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

  private resolveWindowByDeadline(
    task: any,
    durationHours: number,
    wave: any,
    project: any,
  ): { startDate: string; endDate: string } {
    const waveStart = wave?.startDate ? new Date(wave.startDate) : null;
    const waveEnd = wave?.endDate ? new Date(wave.endDate) : null;

    const taskDeadline = task?.deadline ? new Date(task.deadline) : null;
    const projectDeadline = project.deadline ? new Date(project.deadline) : null;
    const durationMs = Math.max(1, durationHours) * 60 * 60 * 1000;

    let effectiveEnd = taskDeadline || waveEnd || projectDeadline || new Date();
    if (waveEnd && effectiveEnd.getTime() > waveEnd.getTime()) {
      effectiveEnd = new Date(waveEnd);
    }

    let effectiveStart = new Date(effectiveEnd.getTime() - durationMs);

    if (waveStart && effectiveStart.getTime() < waveStart.getTime()) {
      effectiveStart = new Date(waveStart);
    }

    if (waveEnd && effectiveStart.getTime() > waveEnd.getTime()) {
      effectiveStart = new Date(
        Math.max(
          waveStart?.getTime?.() || waveEnd.getTime() - durationMs,
          waveEnd.getTime() - durationMs,
        ),
      );
      effectiveEnd = new Date(waveEnd);
    }

    if (effectiveStart.getTime() > effectiveEnd.getTime()) {
      effectiveStart = new Date(effectiveEnd.getTime() - durationMs);
    }

    return {
      startDate: effectiveStart.toISOString(),
      endDate: effectiveEnd.toISOString(),
    };
  }

  private mapTaskItems(
    tasks: any[],
    metricsById: Map<string, TaskNode>,
    waveByTaskId: Map<string, any>,
    project: any,
  ) {
    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

    return tasks
      .map((task: any) => {
        const id = task?._id?.toString?.() || String(task?.id || '');
        const metric = metricsById.get(id);
        const durationHours = round2(this.toMinutes(task) / 60);
        const earlyStart = round2(metric?.earlyStart ?? 0);
        const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
        const lateStart = round2(metric?.lateStart ?? earlyStart);
        const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
        const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
        const wave = waveByTaskId.get(id) || null;
        const timelineWindow = this.resolveWindowByDeadline(task, durationHours, wave, project);

        return {
          id,
          name: String(task?.title || task?.name || 'Task'),
          startDate: timelineWindow.startDate,
          endDate: timelineWindow.endDate,
          durationHours,
          earlyStart,
          earlyFinish,
          lateStart,
          lateFinish,
          slack: round2(metric?.slack ?? 0),
          isCritical: Boolean(metric?.isCritical),
          progress: round2(progress),
          isConcluded: Boolean(task?.isConcluded),
          priority: Number(task?.priority || 0),
          parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
          wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
        };
      })
      .sort((a, b) => {
        const left = new Date(a.startDate).getTime();
        const right = new Date(b.startDate).getTime();
        return left - right || a.name.localeCompare(b.name);
      });
  }

  private mapDependencyItems(dependencies: any[]) {
    return dependencies
      .map((dep: any) => ({
        id: dep?._id?.toString?.() || `${dep.taskId}-${dep.dependsOnTaskId}`,
        fromTaskId: String(dep?.dependsOnTaskId || ''),
        toTaskId: String(dep?.taskId || ''),
        relationship: (dep?.relationship || 'finish-to-start') as
          | 'finish-to-start'
          | 'start-to-start'
          | 'finish-to-finish',
        reason: dep?.reason ? String(dep.reason) : undefined,
        isAutoIdentified: Boolean(dep?.isAutoIdentified),
      }))
      .filter((dep) => dep.fromTaskId && dep.toTaskId);
  }
}
