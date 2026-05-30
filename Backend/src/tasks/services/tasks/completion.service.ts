import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { ProjectsService } from '../../../projects/projects.service';
import { EVMService } from '../../../projects/services/evm.service';
import { TasksMetricsService } from './metrics.service';
import { DeviationDetectionService } from '../deviation-detection.service';
import { AlertsService } from '../alerts.service';

@Injectable()
export class TasksCompletionService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly evmService: EVMService,
    private readonly metricsService: TasksMetricsService,
    private readonly deviationDetectionService: DeviationDetectionService,
    private readonly alertsService: AlertsService,
  ) {}

  async markAsConcluded(id: string): Promise<TaskDocument> {
    if (
      !id ||
      id === 'null' ||
      id === 'undefined' ||
      !Types.ObjectId.isValid(id)
    ) {
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
      task.microTaskType === 'habit' ||
      Boolean(task.parentRecurringId) ||
      Boolean(task.recurringRule);

    if (!isHabit) {
      // Validation is delegated to caller (TasksService) which may call checklist validators
    }

    const currentPomodorosDid = Math.max(0, task.pomodorosDid || 0);
    const plannedPomodoros = Math.max(0, task.pomodorosPlanned || 0);
    const remainingPomodoros = Math.max(
      0,
      plannedPomodoros - currentPomodorosDid,
    );
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
    if (
      !id ||
      id === 'null' ||
      id === 'undefined' ||
      !Types.ObjectId.isValid(id)
    ) {
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
      await this.evmService.recordProgress(
        projectId,
        hoursDelta,
        hoursDelta,
        undefined,
        { source, taskId },
      );
    } catch (error: any) {
      console.warn(
        '[TasksCompletionService] Falha ao registrar progresso EVM automatico',
        {
          projectId,
          taskId,
          source,
          message: error?.message,
        },
      );
    }
  }

  private async checkDeviationAndCreateAlert(taskId: string): Promise<void> {
    const deviation =
      await this.deviationDetectionService.generateDeviationAlert(taskId);
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

  /**
   * Public wrapper to generate deviation alert and return created alert info.
   */
  async createDeviationAlertForTask(
    taskId: string,
  ): Promise<{ alertCreated: boolean; alert?: any }> {
    const deviation =
      await this.deviationDetectionService.generateDeviationAlert(taskId);
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
}
