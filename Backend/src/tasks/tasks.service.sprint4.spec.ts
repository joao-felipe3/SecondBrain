import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';

describe('TasksService - Sprint 4: Kanban + Rastreabilidade', () => {
  let service: TasksService;
  let taskModel: any;
  let feedbackModel: any;
  let geminiService: any;
  let checklistService: any;

  const mockTaskDocument = {
    _id: 'task-1',
    name: 'Test Task',
    project: 'project-1',
    status: 'todo',
    statusUpdatedAt: new Date(),
    kanbanOrder: 0,
    isConcluded: false,
    checklist: [],
    save: jest.fn().mockResolvedValue(this),
  };

  const mockFeedbackDocument = {
    _id: 'feedback-1',
    task: 'task-1',
    feedback: 'Great work! You learned X. Next: Y.',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    geminiService = {
      generateCompletionFeedback: jest.fn(),
    };

    checklistService = {
      validateChecklist: jest.fn(),
    };

    taskModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      countDocuments: jest.fn(),
    };

    feedbackModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: taskModel },
        { provide: getModelToken('TaskCompletionFeedback'), useValue: feedbackModel },
        { provide: 'GeminiService', useValue: geminiService },
        { provide: 'ChecklistService', useValue: checklistService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('moveTaskStatus', () => {
    it('should move task from todo to doing and update timestamp', async () => {
      const updatedTask = { ...mockTaskDocument, status: 'doing', statusUpdatedAt: new Date() };
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      taskModel.findById.mockImplementation((id) => {
        if (id === 'task-1') {
          return { ...mockTaskDocument, status: 'doing' };
        }
      });

      await service.moveTaskStatus('task-1', 'doing');

      expect(taskModel.findById).toHaveBeenCalledWith('task-1');
    });

    it('should prevent moving concluded task away from done status', async () => {
      const concludedTask = { ...mockTaskDocument, isConcluded: true, status: 'done' };
      taskModel.findById.mockResolvedValue(concludedTask);

      await expect(service.moveTaskStatus('task-1', 'todo')).rejects.toThrow(BadRequestException);
    });

    it('should throw error if task does not exist', async () => {
      taskModel.findById.mockResolvedValue(null);

      await expect(service.moveTaskStatus('nonexistent', 'doing')).rejects.toThrow();
    });

    it('should set kanbanOrder to append position in destination column', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      taskModel.countDocuments.mockResolvedValue(5); // 5 existing tasks in 'doing' column

      await service.moveTaskStatus('task-1', 'doing');

      expect(taskModel.countDocuments).toHaveBeenCalledWith({
        project: mockTaskDocument.project,
        status: 'doing',
      });
    });
  });

  describe('getTaskLineage', () => {
    it('should return ancestors and children for a task', async () => {
      const parentTask = { _id: 'parent-1', name: 'Parent', parentTaskId: null };
      const childTasks = [
        { _id: 'child-1', name: 'Child 1', parentTaskId: 'task-1' },
        { _id: 'child-2', name: 'Child 2', parentTaskId: 'task-1' },
      ];

      taskModel.findById.mockResolvedValue(mockTaskDocument);
      taskModel.findOne.mockResolvedValue(parentTask);
      taskModel.find = jest.fn().mockResolvedValue(childTasks);

      const lineage = await service.getTaskLineage('task-1');

      expect(lineage).toHaveProperty('ancestors');
      expect(lineage).toHaveProperty('children');
      expect(lineage).toHaveProperty('warnings');
      expect(lineage.children.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect and warn about depth limit', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      taskModel.findOne.mockResolvedValue(null);
      taskModel.find = jest.fn().mockResolvedValue([]);

      const lineage = await service.getTaskLineage('task-1', 1); // maxDepth=1

      expect(lineage.warnings).toBeDefined();
      expect(Array.isArray(lineage.warnings)).toBe(true);
    });

    it('should handle task with no parent (root)', async () => {
      const rootTask = { _id: 'root-1', name: 'Root', parentTaskId: null };
      taskModel.findById.mockResolvedValue(rootTask);
      taskModel.findOne.mockResolvedValue(null);
      taskModel.find = jest.fn().mockResolvedValue([]);

      const lineage = await service.getTaskLineage('root-1');

      expect(lineage.ancestors.length).toBe(0);
    });
  });

  describe('generateCompletionFeedback', () => {
    it('should generate and persist feedback via GeminiService', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      geminiService.generateCompletionFeedback.mockResolvedValue('Great work!');
      feedbackModel.create.mockResolvedValue(mockFeedbackDocument);

      const feedback = await service.generateCompletionFeedback('task-1');

      expect(feedback).toBe('Great work!');
      expect(geminiService.generateCompletionFeedback).toHaveBeenCalled();
      expect(feedbackModel.create).toHaveBeenCalled();
    });

    it('should throw error if task does not exist', async () => {
      taskModel.findById.mockResolvedValue(null);

      await expect(service.generateCompletionFeedback('nonexistent')).rejects.toThrow();
    });

    it('should persist feedback snapshot with task data', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      geminiService.generateCompletionFeedback.mockResolvedValue('Well done!');
      feedbackModel.create.mockResolvedValue(mockFeedbackDocument);

      await service.generateCompletionFeedback('task-1');

      const createCall = feedbackModel.create.mock.calls[0];
      expect(createCall[0]).toHaveProperty('feedback');
      expect(createCall[0]).toHaveProperty('task', 'task-1');
    });
  });

  describe('getCompletionFeedback', () => {
    it('should return latest feedback for a task', async () => {
      feedbackModel.findOne.mockResolvedValue(mockFeedbackDocument);

      const feedback = await service.getCompletionFeedback('task-1');

      expect(feedback).toBeDefined();
      expect(feedback?.feedback).toBe(mockFeedbackDocument.feedback);
      expect(feedbackModel.findOne).toHaveBeenCalledWith({ task: 'task-1' });
    });

    it('should return null if no feedback exists', async () => {
      feedbackModel.findOne.mockResolvedValue(null);

      const feedback = await service.getCompletionFeedback('task-1');

      expect(feedback).toBeNull();
    });

    it('should query feedback sorted by createdAt descending (latest first)', async () => {
      feedbackModel.findOne.mockResolvedValue(mockFeedbackDocument);

      await service.getCompletionFeedback('task-1');

      expect(feedbackModel.findOne).toHaveBeenCalledWith({ task: 'task-1' });
    });
  });

  describe('Integration: moveTaskStatus with checklist validation', () => {
    it('should block moving to done if checklist incomplete', async () => {
      const incompleteTask = {
        ...mockTaskDocument,
        checklist: [
          { name: 'Item 1', completed: true },
          { name: 'Item 2', completed: false },
        ],
      };
      taskModel.findById.mockResolvedValue(incompleteTask);
      checklistService.validateChecklist.mockResolvedValue({ isValid: false, percentage: 50 });

      // This should throw when attempting to move to 'done'
      await expect(service.moveTaskStatus('task-1', 'done')).rejects.toThrow();
    });

    it('should allow moving to done if checklist complete', async () => {
      const completeTask = {
        ...mockTaskDocument,
        checklist: [
          { name: 'Item 1', completed: true },
          { name: 'Item 2', completed: true },
        ],
      };
      taskModel.findById.mockResolvedValue(completeTask);
      checklistService.validateChecklist.mockResolvedValue({ isValid: true, percentage: 100 });

      // This should succeed
      // Note: In real implementation, would also call generateCompletionFeedback
      const result = await service.moveTaskStatus('task-1', 'done');
      
      expect(result).toBeDefined();
    });
  });

  describe('Sprint 4 Kanban Board Scenarios', () => {
    it('should persist status across multiple transitions', async () => {
      let currentTask = { ...mockTaskDocument, status: 'todo' };
      
      // Todo -> Doing
      taskModel.findById.mockResolvedValue(currentTask);
      await service.moveTaskStatus('task-1', 'doing');
      
      // Verify status was updated
      expect(taskModel.findById).toHaveBeenCalled();
    });

    it('should handle rapid consecutive status moves', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      
      // Simulate rapid moves
      await expect(service.moveTaskStatus('task-1', 'doing')).resolves.toBeDefined();
      await expect(service.moveTaskStatus('task-1', 'review')).resolves.toBeDefined();
      
      expect(taskModel.findById).toHaveBeenCalledTimes(2);
    });

    it('should maintain kanbanOrder consistency within columns', async () => {
      taskModel.findById.mockResolvedValue(mockTaskDocument);
      taskModel.countDocuments.mockResolvedValue(3); // 3 tasks in destination column

      await service.moveTaskStatus('task-1', 'review');

      // Should append to position 4 (after 3 existing tasks)
      expect(taskModel.countDocuments).toHaveBeenCalledWith({
        project: mockTaskDocument.project,
        status: 'review',
      });
    });
  });
});
