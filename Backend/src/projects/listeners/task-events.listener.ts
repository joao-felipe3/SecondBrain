import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskDeletedEvent,
  TaskStatusMovedEvent,
  TaskProgressUpdatedEvent,
  TaskUpdatedEvent,
  BulkTasksCreatedEvent,
} from '../../tasks/events/task.events';
import { ProjectStatsService } from '../services/execution/project-stats.service';
import { EVMProgressService } from '../services/evm/evm-progress.service';

@Injectable()
export class TaskEventsListener {
  private readonly logger = new Logger(TaskEventsListener.name);

  constructor(
    private readonly projectStatsService: ProjectStatsService,
    private readonly evmProgressService: EVMProgressService,
  ) {}

  @OnEvent('task.created', { async: true })
  async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    const projectId = event.projectId || (event.task?.project ? String(event.task.project) : undefined);
    if (!projectId) return;

    try {
      this.logger.debug(`Recalculating project stats after task creation: ${projectId}`);
      await this.projectStatsService.recalculateProjectStats(projectId);
    } catch (error) {
      this.logger.error(`Failed to recalculate stats on task.created for project ${projectId}`, error);
    }
  }

  @OnEvent('task.completed', { async: true })
  async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const projectId = event.projectId || (event.task?.project ? String(event.task.project) : undefined);
    if (!projectId) return;

    try {
      this.logger.debug(`Recalculating project stats and EVM after task completion: ${projectId}`);
      await this.projectStatsService.recalculateProjectStats(projectId);

      if (event.remainingHours && event.remainingHours > 0) {
        await this.projectStatsService.incrementHoursWorked(projectId, event.remainingHours);
        await this.evmProgressService.recordProgress({
          projectId,
          completedHours: event.remainingHours,
          plannedValue: event.remainingHours,
          source: 'completion',
          taskId: event.task?._id ? String(event.task._id) : undefined,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to recalculate stats on task.completed for project ${projectId}`, error);
    }
  }

  @OnEvent('task.deleted', { async: true })
  async handleTaskDeleted(event: TaskDeletedEvent): Promise<void> {
    if (!event.projectId) return;

    try {
      this.logger.debug(`Recalculating project stats after task deletion: ${event.projectId}`);
      await this.projectStatsService.recalculateProjectStats(event.projectId);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate stats on task.deleted for project ${event.projectId}`,
        error,
      );
    }
  }

  @OnEvent('task.updated', { async: true })
  async handleTaskUpdated(event: TaskUpdatedEvent): Promise<void> {
    try {
      if (event.oldProjectId && event.oldProjectId !== event.projectId) {
        this.logger.debug(`Recalculating old project stats after task move: ${event.oldProjectId}`);
        await this.projectStatsService.recalculateProjectStats(event.oldProjectId);
      }
      if (event.projectId) {
        this.logger.debug(`Recalculating project stats after task update: ${event.projectId}`);
        await this.projectStatsService.recalculateProjectStats(event.projectId);
      }
    } catch (error) {
      this.logger.error(`Failed to recalculate stats on task.updated`, error);
    }
  }

  @OnEvent('task.statusMoved', { async: true })
  @OnEvent('task.status_moved', { async: true })
  async handleTaskStatusMoved(event: TaskStatusMovedEvent): Promise<void> {
    const projectId = event.projectId || (event.task?.project ? String(event.task.project) : undefined);
    if (!projectId) return;

    try {
      await this.projectStatsService.recalculateProjectStats(projectId);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate stats on task.statusMoved for project ${projectId}`,
        error,
      );
    }
  }

  @OnEvent('task.progressUpdated', { async: true })
  @OnEvent('task.progress_updated', { async: true })
  async handleTaskProgressUpdated(event: TaskProgressUpdatedEvent): Promise<void> {
    if (!event.projectId) return;

    try {
      await this.projectStatsService.recalculateProjectStats(event.projectId);

      if (event.hoursDelta && event.hoursDelta > 0) {
        await this.projectStatsService.incrementHoursWorked(event.projectId, event.hoursDelta);
        await this.evmProgressService.recordProgress({
          projectId: event.projectId,
          completedHours: event.hoursDelta,
          plannedValue: event.hoursDelta,
          source: event.source || 'pomodoro',
          taskId: event.taskId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to recalculate stats on task.progressUpdated for project ${event.projectId}`,
        error,
      );
    }
  }

  @OnEvent('task.bulk_created', { async: true })
  async handleBulkTasksCreated(event: BulkTasksCreatedEvent): Promise<void> {
    if (!event.projectIds || event.projectIds.length === 0) return;

    for (const projectId of event.projectIds) {
      try {
        this.logger.debug(`Recalculating project stats after bulk task creation: ${projectId}`);
        await this.projectStatsService.recalculateProjectStats(projectId);
      } catch (error) {
        this.logger.error(`Failed to recalculate stats on bulk tasks created for ${projectId}`, error);
      }
    }
  }
}
