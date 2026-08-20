import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskDeletedEvent,
  TaskStatusMovedEvent,
  TaskProgressUpdatedEvent,
} from '../events/task.events';
import { ProjectStatsService } from '../../projects/services/execution/project-stats.service';
import { EVMProgressService } from '../../projects/services/evm/evm-progress.service';

@Injectable()
export class TaskEventsListener {
  private readonly logger = new Logger(TaskEventsListener.name);

  constructor(
    private readonly projectStatsService: ProjectStatsService,
    private readonly evmProgressService: EVMProgressService,
  ) {}

  @OnEvent('task.created', { async: true })
  async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    const projectId = event.projectId || (event.task.project ? String(event.task.project) : undefined);
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
    const projectId = event.projectId || (event.task.project ? String(event.task.project) : undefined);
    if (!projectId) return;

    try {
      this.logger.debug(`Recalculating project stats and EVM after task completion: ${projectId}`);
      await this.projectStatsService.recalculateProjectStats(projectId);
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

  @OnEvent('task.statusMoved', { async: true })
  async handleTaskStatusMoved(event: TaskStatusMovedEvent): Promise<void> {
    const projectId = event.projectId || (event.task.project ? String(event.task.project) : undefined);
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
  async handleTaskProgressUpdated(event: TaskProgressUpdatedEvent): Promise<void> {
    if (!event.projectId) return;

    try {
      await this.projectStatsService.recalculateProjectStats(event.projectId);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate stats on task.progressUpdated for project ${event.projectId}`,
        error,
      );
    }
  }
}
