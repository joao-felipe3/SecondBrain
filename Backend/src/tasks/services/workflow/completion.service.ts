import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { MoveTaskStatusDto } from '../../dto/task/move-task-status.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { TaskAlertDocument } from '../../schemas/task-alert.schema';
import { ProjectsService } from '../../../projects/projects.service';
import { EVMProgressService } from '../../../projects/services/evm';
import { TasksMetricsService } from '../analysis/metrics.service';
import { DeviationDetectionService, AlertsService } from '../monitoring';
import { TasksRecurringService } from './recurring.service';
import { TasksWriteService } from './write.service';
import { resolveTargetOrder } from './utils/kanban.utils';

@Injectable()
export class TasksCompletionService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly evmProgressService: EVMProgressService,
    private readonly metricsService: TasksMetricsService,
    private readonly deviationDetectionService: DeviationDetectionService,
    private readonly alertsService: AlertsService,
    private readonly tasksRecurringService: TasksRecurringService,
    private readonly tasksWriteService: TasksWriteService,
  ) { }

  // ===========================================================================
  // 1. Public API: Lifecycle / Completion
  // ===========================================================================

  async markAsConcluded(id: string): Promise<TaskDocument> {
    this.validateTaskId(id);

    const task = await this.getTaskOrThrow(id);
    if (task.isConcluded) {
      return task;
    }

    const { remainingHours } = this.calculateRemainingPomodorosAndHours(task);

    await this.updateTaskToConcludedStatus(task);
    this.metricsService.applyEvmMetrics(task, task);
    const updatedTask = await task.save();

    if (updatedTask.project && remainingHours > 0) {
      await this.updateProjectMetricsAfterCompletion({
        projectId: String(updatedTask.project),
        taskId: id,
        remainingHours,
      });
    }

    await this.checkDeviationAndCreateAlert(id);

    return updatedTask;
  }

  // ===========================================================================
  // 2. Public API: Pomodoro Management
  // ===========================================================================

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    this.validateTaskId(id);

    const task = await this.getTaskOrThrow(id);

    if (task.pomodorosDid === undefined || task.pomodorosDid === null) {
      task.pomodorosDid = 0;
    }
    task.pomodorosDid += 1;

    this.metricsService.applyEvmMetrics(task, task);
    const updatedTask = await task.save();

    if (task.project) {
      await this.updateProjectMetricsAfterPomodoro(String(task.project), id);
    }

    return updatedTask;
  }

  // ===========================================================================
  // 3. Public API: Recurring / Deferred Workflows
  // ===========================================================================

  async handleTaskCompletion(taskId: string): Promise<TaskDocument | null> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return null;
    }

    if (task.recurringRule) {
      await this.taskModel
        .findByIdAndUpdate(taskId, { recurringState: 'completed' }, { new: true })
        .exec();

      await this.scheduleNextRecurringOccurrence(task);
    }

    return task;
  }

  async handleTaskSkipped(taskId: string): Promise<TaskDocument> {
    const task = await this.getTaskOrThrow(taskId);

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          recurringState: 'skipped',
          isConcluded: true,
          status: 'done',
          statusUpdatedAt: new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    await this.scheduleNextRecurringOccurrence(updatedTask);

    return updatedTask;
  }

  async handleTaskDeferred(taskId: string, newDeadline: Date): Promise<TaskDocument> {
    this.validateTaskId(taskId);

    const parsedDeadline = new Date(newDeadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      throw new BadRequestException('newDeadline inválido');
    }

    // Check if task exists first
    await this.getTaskOrThrow(taskId);

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          deadline: parsedDeadline,
          statusUpdatedAt: new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    return updatedTask;
  }

  // ===========================================================================
  // 4. Public API: Monitoring & Alerts
  // ===========================================================================

  async createDeviationAlertForTask(taskId: string): Promise<{
    alertCreated: boolean;
    alert?: TaskAlertDocument;
  }> {
    const deviation = await this.deviationDetectionService.generateDeviationAlert(taskId);
    if (!deviation) {
      return { alertCreated: false };
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return { alertCreated: false };
    }

    const created = await this.alertsService.createAlert({
      taskId: task._id as any,
      projectId: task.project as any,
      type: 'warning',
      message: deviation.message || 'Time deviation detected',
      recommendation: deviation.recommendation,
    });

    return { alertCreated: true, alert: created };
  }

  // ===========================================================================
  // 5. Public API: Kanban Status Movement
  // ===========================================================================

  public async moveTaskStatus(id: string, move: MoveTaskStatusDto): Promise<TaskDocument> {
    this.validateTaskId(id);

    const task = await this.getTaskOrThrow(id);
    const toStatus = move.status;

    if (task.isConcluded && toStatus !== 'done') {
      throw new BadRequestException('Tarefa concluída não pode ser movida para fora de "done"');
    }

    if (toStatus === 'done') {
      return this.markAsConcluded(id);
    }

    const projectId = task.project?.toString();
    const targetOrder = await resolveTargetOrder(this.taskModel, projectId, toStatus, move);

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        id,
        {
          status: toStatus,
          statusUpdatedAt: new Date(),
          kanbanOrder: targetOrder,
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
  }

  // ===========================================================================
  // 6. Private Helpers: Validations & Streaks
  // ===========================================================================

  private validateTaskId(id: string): void {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
  }

  private async getTaskOrThrow(id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  private calculateRemainingPomodorosAndHours(task: TaskDocument): {
    remainingPomodoros: number;
    remainingHours: number;
  } {
    const currentPomodorosDid = Math.max(0, task.pomodorosDid || 0);
    const plannedPomodoros = Math.max(0, task.pomodorosPlanned || 0);
    const remainingPomodoros = Math.max(0, plannedPomodoros - currentPomodorosDid);
    const remainingHours = remainingPomodoros * 0.5;

    return { remainingPomodoros, remainingHours };
  }

  private async updateTaskToConcludedStatus(task: TaskDocument): Promise<void> {
    const currentPomodorosDid = Math.max(0, task.pomodorosDid || 0);
    const plannedPomodoros = Math.max(0, task.pomodorosPlanned || 0);
    const remainingPomodoros = Math.max(0, plannedPomodoros - currentPomodorosDid);

    task.isConcluded = true;
    if (remainingPomodoros > 0) {
      task.pomodorosDid = plannedPomodoros;
    }

    const projectId = task.project?.toString();
    if (projectId) {
      const maxOrder = await this.taskModel
        .findOne({ project: projectId, status: 'done' })
        .sort({ kanbanOrder: -1 })
        .select('kanbanOrder')
        .exec();
      task.status = 'done';
      task.kanbanOrder = (maxOrder?.kanbanOrder || 0) + 1;
      task.statusUpdatedAt = new Date();
    }
  }

  // ===========================================================================
  // 7. Private Helpers: Metrics Integration
  // ===========================================================================

  private async updateProjectMetricsAfterCompletion(params: {
    projectId: string;
    taskId: string;
    remainingHours: number;
  }): Promise<void> {
    const { projectId, taskId, remainingHours } = params;
    await this.projectsService.incrementHoursWorked(projectId, remainingHours);
    await this.registerAutoEvmProgress({
      projectId,
      taskId,
      hoursDelta: remainingHours,
      source: 'completion',
    });
  }

  private async updateProjectMetricsAfterPomodoro(projectId: string, taskId: string): Promise<void> {
    await this.projectsService.incrementHoursWorked(projectId, 0.5);
    await this.registerAutoEvmProgress({
      projectId,
      taskId,
      hoursDelta: 0.5,
      source: 'pomodoro',
    });
  }

  private async registerAutoEvmProgress(params: {
    projectId: string;
    taskId: string;
    hoursDelta: number;
    source: 'pomodoro' | 'completion';
  }): Promise<void> {
    const { projectId, taskId, hoursDelta, source } = params;
    if (!projectId || !taskId || hoursDelta <= 0) {
      return;
    }

    try {
      await this.evmProgressService.recordProgress(projectId, hoursDelta, hoursDelta, undefined, {
        source,
        taskId,
      });
    } catch (error: any) {
      console.warn('[TasksCompletionService] Falha ao registrar progresso EVM automatico', {
        projectId,
        taskId,
        source,
        message: error?.message,
      });
    }
  }

  // ===========================================================================
  // 8. Private Helpers: Monitoring & Scheduling
  // ===========================================================================

  private async checkDeviationAndCreateAlert(taskId: string): Promise<void> {
    const deviation = await this.deviationDetectionService.generateDeviationAlert(taskId);
    if (!deviation) return;

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) return;

    await this.alertsService.createAlert({
      taskId: task._id as any,
      projectId: task.project as any,
      type: 'warning',
      message: deviation.message || 'Time deviation detected',
      recommendation: deviation.recommendation,
    });
  }

  private async scheduleNextRecurringOccurrence(task: TaskDocument): Promise<void> {
    if (!task.recurringRule) return;

    const recurringRule = this.tasksRecurringService.normalizeRecurringRule(task.recurringRule);
    if (!recurringRule) return;

    const baseDate = task.deadline || task.createdAt || new Date();
    const nextDeadline = this.tasksRecurringService.calculateNextRecurringDate(baseDate, recurringRule);
    if (!nextDeadline) return;

    const payload = this.tasksRecurringService.buildOccurrencePayload(task, nextDeadline);
    await this.tasksWriteService.createTaskCore(payload as any);
  }
}
