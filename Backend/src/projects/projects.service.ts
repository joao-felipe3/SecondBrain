import { InjectModel } from '@nestjs/mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectDocument } from './schemas/project.schema';
import { CPMService, type TaskNode } from '../tasks/services/analysis';
import type { GanttDataResponse } from './dto/gantt.dto';
import type { PertDiagramDataResponse } from './dto/pert-diagram.dto';
import { ProjectWave, type ProjectWaveDocument } from './schemas/project-wave.schema';
import type { CreateXMatrixDto, XMatrixResponseDto } from './dto/x-matrix.dto';
import { ProjectsXMatrixService } from './services/projects-x-matrix.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel(ProjectWave.name)
    private readonly waveModel: Model<ProjectWaveDocument>,
    @Inject(forwardRef(() => CPMService))
    private readonly cpmService: CPMService,
    private readonly xMatrixService: ProjectsXMatrixService,
  ) {}

  async createXMatrix(projectId: string, dto: CreateXMatrixDto): Promise<XMatrixResponseDto> {
    return this.xMatrixService.createXMatrix(projectId, dto);
  }

  async getSavedXMatrix(projectId: string): Promise<XMatrixResponseDto | null> {
    return this.xMatrixService.getSavedXMatrix(projectId);
  }

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

    const toMinutes = (task: any): number => {
      if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
        return task.pertExpectedMinutes;
      }
      if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
        return task.pomodorosPlanned * 25;
      }
      return 60;
    };

    const taskNodes: TaskNode[] = tasks.map((task: any) => ({
      id: task?._id?.toString?.() || String(task?.id || ''),
      name: String(task?.title || task?.name || 'Task'),
      duration: toMinutes(task),
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
    const addHours = (base: Date, hours: number) => {
      const date = new Date(base);
      date.setTime(date.getTime() + Math.max(0, hours) * 60 * 60 * 1000);
      return date.toISOString();
    };

    const resolveWindowByDeadline = (task: any, durationHours: number) => {
      const taskId = task?._id?.toString?.() || String(task?.id || '');
      const wave = waveByTaskId.get(taskId) || null;

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
    };

    const taskItems = tasks
      .map((task: any) => {
        const id = task?._id?.toString?.() || String(task?.id || '');
        const metric = metricsById.get(id);
        const durationHours = round2(toMinutes(task) / 60);
        const earlyStart = round2(metric?.earlyStart ?? 0);
        const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
        const lateStart = round2(metric?.lateStart ?? earlyStart);
        const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
        const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
        const timelineWindow = resolveWindowByDeadline(task, durationHours);

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

    const dependencyItems = (dependencies as any[])
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

    const toMinutes = (task: any): number => {
      if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0)
        return task.pertExpectedMinutes;
      if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0)
        return task.pomodorosPlanned * 25;
      return 60;
    };

    const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

    const taskNodes: TaskNode[] = tasks.map((task: any) => ({
      id: task?._id?.toString?.() || String(task?.id || ''),
      name: String(task?.title || task?.name || 'Task'),
      duration: toMinutes(task),
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

    const analysis = this.cpmService.calculateCriticalPath(taskNodes);
    const metricsById = new Map<string, TaskNode>();
    for (const metric of analysis.tasksByImpact) metricsById.set(metric.id, metric);

    const predecessorCount = new Map<string, number>();
    const predecessorMap = new Map<string, Set<string>>();
    for (const task of tasks as any[]) {
      const id = task?._id?.toString?.() || String(task?.id || '');
      predecessorCount.set(id, 0);
      predecessorMap.set(id, new Set<string>());
    }

    for (const dep of dependencies as any[]) {
      const target = String(dep?.taskId || '').trim();
      const source = String(dep?.dependsOnTaskId || '').trim();
      if (!predecessorMap.has(target) || !predecessorMap.has(source)) continue;
      if (!predecessorMap.get(target)!.has(source)) {
        predecessorMap.get(target)!.add(source);
        predecessorCount.set(target, (predecessorCount.get(target) || 0) + 1);
      }
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

    const criticalSet = new Set(analysis.criticalPath || []);
    const nodes = tasks.map((task: any) => {
      const id = task?._id?.toString?.() || String(task?.id || '');
      const metric = metricsById.get(id);
      const durationHours = round2(toMinutes(task) / 60);
      const earlyStart = round2(metric?.earlyStart ?? 0);
      const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
      const lateStart = round2(metric?.lateStart ?? earlyStart);
      const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
      const slack = round2(metric?.slack ?? 0);
      const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
      const level = computeLevel(id);
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

    const edges = (dependencies as any[])
      .map((dep: any) => {
        const source = String(dep?.dependsOnTaskId || '').trim();
        const target = String(dep?.taskId || '').trim();
        if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) return null;

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
      .filter(Boolean) as PertDiagramDataResponse['edges'];

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

  async getTasksForProject(projectId: string): Promise<TaskDocument[]> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID inválido: ${projectId}`);
    }
    return this.taskModel.find({ project: projectId }).exec();
  }

  async create(dto: CreateProjectDto): Promise<ProjectDocument> {
    const created = new this.projectModel(dto);
    return await created.save();
  }

  async findAll(): Promise<ProjectDocument[]> {
    return await this.projectModel.find().exec();
  }

  async findOne(id: string): Promise<ProjectDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.projectModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.projectModel.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async remove(id: string): Promise<boolean> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  /**
   * Delete a project with options for handling associated tasks
   * @param id - Project ID
   * @param deleteTasks - If true, delete all tasks; if false, just unlink them
   */
  async removeWithOptions(
    id: string,
    deleteTasks: boolean,
  ): Promise<{ deleted: boolean; tasksAffected: number }> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const project = await this.projectModel.findById(id).exec();
    if (!project) {
      return { deleted: false, tasksAffected: 0 };
    }

    const tasks = await this.taskModel.find({ project: id }).exec();
    const tasksAffected = tasks.length;

    if (deleteTasks) {
      // Delete all tasks associated with this project
      await this.taskModel.deleteMany({ project: id }).exec();
    } else {
      // Just unlink tasks from project
      await this.taskModel.updateMany({ project: id }, { $unset: { project: '' } }).exec();
    }

    // Delete the project
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    return { deleted: result !== null, tasksAffected };
  }

  async incrementHoursWorked(id: string, hours: number): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    project.totalHoursWorked = (project.totalHoursWorked || 0) + hours;
    // optionally recompute progress if plannedHours exists
    if (project.plannedHours) {
      const pct = (project.totalHoursWorked / project.plannedHours) * 100;
      project.progressPercentage = Math.min(100, +pct.toFixed(2));
    }
    return await project.save();
  }

  async addTaskToProject(projectId: string, taskId: string): Promise<void> {
    await this.projectModel
      .findByIdAndUpdate(projectId, { $addToSet: { tasks: taskId } }, { new: true })
      .exec();
  }

  async removeTaskFromProject(projectId: string, taskId: string): Promise<void> {
    await this.projectModel
      .findByIdAndUpdate(projectId, { $pull: { tasks: taskId } }, { new: true })
      .exec();
  }

  async moveTaskToProject(taskId: string, oldProjectId: string, newProjectId: string): Promise<void> {
    if (oldProjectId) {
      await this.removeTaskFromProject(oldProjectId, taskId);
      await this.recalculateProjectStats(oldProjectId);
    }
    await this.addTaskToProject(newProjectId, taskId);
    await this.recalculateProjectStats(newProjectId);
  }

  async recalculateProjectStats(projectId: string): Promise<ProjectDocument | null> {
    // Validar ObjectId
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      console.warn(`recalculateProjectStats: ID inválido ignorado: ${projectId}`);
      return null;
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) {
      // Project doesn't exist anymore, skip recalculation
      return null;
    }

    const tasks = await this.taskModel.find({ project: projectId }).exec();

    // Calculate plannedHours: sum of (pomodorosPlanned * 0.5) for each task
    const plannedHours = tasks.reduce((sum, task) => {
      const pomodoros = task.pomodorosPlanned || 0;
      return sum + pomodoros * 0.5;
    }, 0);

    // Calculate experience: sum of experience from all tasks
    const experience = tasks.reduce((sum, task) => {
      return sum + (task.experience || 0);
    }, 0);

    // Calculate reward: sum of prize from all tasks
    const reward = tasks.reduce((sum, task) => {
      return sum + (task.prize || 0);
    }, 0);

    // Update project
    project.plannedHours = plannedHours;
    project.experience = experience;
    project.reward = reward;

    // Recalculate progress percentage
    if (project.plannedHours > 0) {
      const pct = (project.totalHoursWorked / project.plannedHours) * 100;
      project.progressPercentage = Math.min(100, +pct.toFixed(2));
    } else {
      project.progressPercentage = 0;
    }

    return await project.save();
  }
}
