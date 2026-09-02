import { TaskEventsListener } from '@src/projects/listeners/task-events.listener';
import { ProjectStatsService } from '@src/projects/services/execution/project-stats.service';
import { EVMProgressService } from '@src/projects/services/evm/evm-progress.service';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskDeletedEvent,
  TaskUpdatedEvent,
  TaskStatusMovedEvent,
  TaskProgressUpdatedEvent,
  BulkTasksCreatedEvent,
} from '@src/tasks/events/task.events';

describe('TaskEventsListener', () => {
  let listener: TaskEventsListener;
  let projectStatsService: jest.Mocked<ProjectStatsService>;
  let evmProgressService: jest.Mocked<EVMProgressService>;

  beforeEach(() => {
    projectStatsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue(null),
      incrementHoursWorked: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<ProjectStatsService>;

    evmProgressService = {
      recordProgress: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<EVMProgressService>;

    listener = new TaskEventsListener(projectStatsService, evmProgressService);
  });

  describe('handleTaskCreated', () => {
    it('should do nothing if no projectId or task.project', async () => {
      await listener.handleTaskCreated({} as TaskCreatedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate stats when projectId is directly on event', async () => {
      await listener.handleTaskCreated({ projectId: 'proj-1' } as TaskCreatedEvent);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
    });

    it('should recalculate stats using task.project if event.projectId is missing', async () => {
      await listener.handleTaskCreated({
        task: { project: 'proj-2' } as any,
      });
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-2');
    });

    it('should catch and log error if recalculateProjectStats fails', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        listener.handleTaskCreated({ projectId: 'proj-error' } as TaskCreatedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTaskCompleted', () => {
    it('should do nothing if no projectId or task.project', async () => {
      await listener.handleTaskCompleted({} as TaskCompletedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate stats and record EVM if remainingHours > 0 with task._id', async () => {
      await listener.handleTaskCompleted({
        projectId: 'proj-1',
        remainingHours: 4,
        task: { _id: 'task-123' } as any,
      } as TaskCompletedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
      expect(projectStatsService.incrementHoursWorked).toHaveBeenCalledWith('proj-1', 4);
      expect(evmProgressService.recordProgress).toHaveBeenCalledWith({
        projectId: 'proj-1',
        completedHours: 4,
        plannedValue: 4,
        source: 'completion',
        taskId: 'task-123',
      });
    });

    it('should recalculate stats without recording EVM if remainingHours <= 0 or missing', async () => {
      await listener.handleTaskCompleted({
        task: { project: 'proj-2' } as any,
        remainingHours: 0,
      } as TaskCompletedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-2');
      expect(projectStatsService.incrementHoursWorked).not.toHaveBeenCalled();
      expect(evmProgressService.recordProgress).not.toHaveBeenCalled();
    });

    it('should handle missing task._id when recording EVM progress', async () => {
      await listener.handleTaskCompleted({
        projectId: 'proj-1',
        remainingHours: 2,
        task: {} as any,
      } as TaskCompletedEvent);

      expect(evmProgressService.recordProgress).toHaveBeenCalledWith({
        projectId: 'proj-1',
        completedHours: 2,
        plannedValue: 2,
        source: 'completion',
        taskId: undefined,
      });
    });

    it('should catch and log error if recalculation fails', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('EVM error'));
      await expect(
        listener.handleTaskCompleted({ projectId: 'proj-1' } as TaskCompletedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTaskDeleted', () => {
    it('should do nothing if projectId is missing', async () => {
      await listener.handleTaskDeleted({} as TaskDeletedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate stats when projectId is present', async () => {
      await listener.handleTaskDeleted({ projectId: 'proj-1' } as TaskDeletedEvent);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
    });

    it('should catch and log errors gracefully', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('Delete error'));
      await expect(
        listener.handleTaskDeleted({ projectId: 'proj-1' } as TaskDeletedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTaskUpdated', () => {
    it('should recalculate both old and new project when oldProjectId is different', async () => {
      await listener.handleTaskUpdated({
        oldProjectId: 'proj-old',
        projectId: 'proj-new',
      } as TaskUpdatedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-old');
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-new');
    });

    it('should only recalculate once if oldProjectId is same as projectId', async () => {
      await listener.handleTaskUpdated({
        oldProjectId: 'proj-same',
        projectId: 'proj-same',
      } as TaskUpdatedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledTimes(1);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-same');
    });

    it('should only recalculate new project when oldProjectId is undefined', async () => {
      await listener.handleTaskUpdated({
        projectId: 'proj-new',
      } as TaskUpdatedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledTimes(1);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-new');
    });

    it('should do nothing if both oldProjectId and projectId are undefined', async () => {
      await listener.handleTaskUpdated({} as TaskUpdatedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should catch and log error if recalculation fails', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('Update error'));
      await expect(
        listener.handleTaskUpdated({ projectId: 'proj-1' } as TaskUpdatedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTaskStatusMoved', () => {
    it('should do nothing if projectId is missing', async () => {
      await listener.handleTaskStatusMoved({} as TaskStatusMovedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate stats using event.projectId', async () => {
      await listener.handleTaskStatusMoved({ projectId: 'proj-1' } as TaskStatusMovedEvent);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
    });

    it('should recalculate stats using task.project if projectId is missing', async () => {
      await listener.handleTaskStatusMoved({
        task: { project: 'proj-2' } as any,
      } as TaskStatusMovedEvent);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-2');
    });

    it('should catch error and log when recalculation fails', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('Move error'));
      await expect(
        listener.handleTaskStatusMoved({ projectId: 'proj-1' } as TaskStatusMovedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleTaskProgressUpdated', () => {
    it('should do nothing if projectId is missing', async () => {
      await listener.handleTaskProgressUpdated({} as TaskProgressUpdatedEvent);
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate and record EVM progress with custom source', async () => {
      await listener.handleTaskProgressUpdated({
        projectId: 'proj-1',
        hoursDelta: 1.5,
        source: 'manual',
        taskId: 'task-1',
      });

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
      expect(projectStatsService.incrementHoursWorked).toHaveBeenCalledWith('proj-1', 1.5);
      expect(evmProgressService.recordProgress).toHaveBeenCalledWith({
        projectId: 'proj-1',
        completedHours: 1.5,
        plannedValue: 1.5,
        source: 'manual',
        taskId: 'task-1',
      });
    });

    it('should fallback to pomodoro source when source is missing', async () => {
      await listener.handleTaskProgressUpdated({
        projectId: 'proj-1',
        hoursDelta: 0.5,
      } as TaskProgressUpdatedEvent);

      expect(evmProgressService.recordProgress).toHaveBeenCalledWith({
        projectId: 'proj-1',
        completedHours: 0.5,
        plannedValue: 0.5,
        source: 'pomodoro',
        taskId: undefined,
      });
    });

    it('should not increment hours or record EVM if hoursDelta <= 0', async () => {
      await listener.handleTaskProgressUpdated({
        projectId: 'proj-1',
        hoursDelta: 0,
      } as TaskProgressUpdatedEvent);

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('proj-1');
      expect(projectStatsService.incrementHoursWorked).not.toHaveBeenCalled();
      expect(evmProgressService.recordProgress).not.toHaveBeenCalled();
    });

    it('should catch error and log when progress update fails', async () => {
      projectStatsService.recalculateProjectStats.mockRejectedValueOnce(new Error('Progress error'));
      await expect(
        listener.handleTaskProgressUpdated({ projectId: 'proj-1' } as TaskProgressUpdatedEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleBulkTasksCreated', () => {
    it('should do nothing if projectIds is missing or empty', async () => {
      await listener.handleBulkTasksCreated({} as BulkTasksCreatedEvent);
      await listener.handleBulkTasksCreated({
        projectIds: [],
        tasks: [],
      });
      expect(projectStatsService.recalculateProjectStats).not.toHaveBeenCalled();
    });

    it('should recalculate stats for each project in projectIds', async () => {
      await listener.handleBulkTasksCreated({
        projectIds: ['p1', 'p2', 'p3'],
        tasks: [],
      });

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledTimes(3);
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('p1');
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('p2');
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('p3');
    });

    it('should continue processing remaining projects even if one fails', async () => {
      projectStatsService.recalculateProjectStats
        .mockRejectedValueOnce(new Error('p1 error'))
        .mockResolvedValueOnce(null);

      await listener.handleBulkTasksCreated({
        projectIds: ['p1', 'p2'],
        tasks: [],
      });

      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('p1');
      expect(projectStatsService.recalculateProjectStats).toHaveBeenCalledWith('p2');
    });
  });
});
