import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { TaskAlertDocument } from '../../schemas/task-alert.schema';
import { ProjectsService } from '../../../projects/projects.service';
import { EVMService } from '../../../projects/services/evm.service';
import { TasksMetricsService } from '../analysis/metrics.service';
import { DeviationDetectionService, AlertsService } from '../monitoring';
import { TasksRecurringService } from './recurring.service';
import { TasksWriteService } from './write.service';

@Injectable()
export class TasksCompletionService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly evmService: EVMService,
    private readonly metricsService: TasksMetricsService,
    private readonly deviationDetectionService: DeviationDetectionService,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => TasksRecurringService))
    private readonly tasksRecurringService: TasksRecurringService,
    @Inject(forwardRef(() => TasksWriteService))
    private readonly tasksWriteService: TasksWriteService,
  ) {}

  async handleTaskCompletion(taskId: string): Promise<TaskDocument | null> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) return null;

    if (task.recurringRule) {
      await this.taskModel
        .findByIdAndUpdate(taskId, { recurringState: 'completed' }, { new: true })
        .exec();

      const recurringRule = this.tasksRecurringService.normalizeRecurringRule(task.recurringRule);
      if (recurringRule) {
        const nextDeadline = this.tasksRecurringService.calculateNextRecurringDate(
          task.deadline || task.createdAt || new Date(),
          recurringRule,
        );
        if (nextDeadline) {
          const payload = this.tasksRecurringService.buildOccurrencePayload(task, nextDeadline);
          await this.tasksWriteService.createTaskCore(payload as any);
        }
      }
    }

    return task;
  }

  async handleTaskSkipped(taskId: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

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

    if (updatedTask.recurringRule) {
      const recurringRule = this.tasksRecurringService.normalizeRecurringRule(updatedTask.recurringRule);
      if (recurringRule) {
        const nextDeadline = this.tasksRecurringService.calculateNextRecurringDate(
          updatedTask.deadline || updatedTask.createdAt || new Date(),
          recurringRule,
        );
        if (nextDeadline) {
          const payload = this.tasksRecurringService.buildOccurrencePayload(updatedTask, nextDeadline);
          await this.tasksWriteService.createTaskCore(payload as any);
        }
      }
    }

    return updatedTask;
  }

  async handleTaskDeferred(taskId: string, newDeadline: Date): Promise<TaskDocument> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }

    const parsedDeadline = new Date(newDeadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      throw new BadRequestException('newDeadline inválido');
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

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

  async markAsConcluded(id: string): Promise<TaskDocument> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.isConcluded) {
      return task;
    }

    const isHabit =
      task.microTaskType === 'habit' || Boolean(task.parentRecurringId) || Boolean(task.recurringRule);

    if (!isHabit) {
      // Validation is delegated to caller (TasksService) which may call checklist validators
    }

    const currentPomodorosDid = Math.max(0, task.pomodorosDid || 0);
    const plannedPomodoros = Math.max(0, task.pomodorosPlanned || 0);
    const remainingPomodoros = Math.max(0, plannedPomodoros - currentPomodorosDid);
    const remainingHours = remainingPomodoros * 0.5;

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

    this.metricsService.applyEvmMetrics(task, task);
    const updatedTask = await task.save();

    if (updatedTask.project && remainingHours > 0) {
      const pid = updatedTask.project.toString();
      await this.projectsService.incrementHoursWorked(pid, remainingHours);
      await this.registerAutoEvmProgress(pid, id, remainingHours, 'completion');
    }

    await this.checkDeviationAndCreateAlert(id);

    return updatedTask;
  }

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.pomodorosDid === undefined || task.pomodorosDid === null) {
      task.pomodorosDid = 0;
    }

    task.pomodorosDid += 1;
    this.metricsService.applyEvmMetrics(task, task);
    const updatedTask = await task.save();

    if (task.project) {
      const projectId = task.project.toString();
      await this.projectsService.incrementHoursWorked(projectId, 0.5);
      await this.registerAutoEvmProgress(projectId, id, 0.5, 'pomodoro');
    }

    return updatedTask;
  }

  private async registerAutoEvmProgress(
    projectId: string,
    taskId: string,
    hoursDelta: number,
    source: 'pomodoro' | 'completion',
  ): Promise<void> {
    if (!projectId || !taskId || hoursDelta <= 0) return;

    try {
      await this.evmService.recordProgress(projectId, hoursDelta, hoursDelta, undefined, {
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

    const created: TaskAlertDocument = await this.alertsService.createAlert({
      taskId: task._id as any,
      projectId: task.project as any,
      type: 'warning',
      message: deviation.message || 'Time deviation detected',
      recommendation: deviation.recommendation,
    });

    return { alertCreated: true, alert: created };
  }
}