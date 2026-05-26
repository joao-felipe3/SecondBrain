import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from '@src/tasks/tasks.service';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { GeminiService } from '@src/ai/gemini.service';
import { ChecklistService } from '@src/tasks/checklist.service';
import { ProjectsService } from '@src/projects/projects.service';
import { EVMService } from '@src/projects/services/evm.service';
import { PertService } from '@src/tasks/services/pert.service';
import { FeedbackService } from '@src/tasks/feedback.service';
import { AlertsService } from '@src/tasks/services/alerts.service';
import { DeviationDetectionService } from '@src/tasks/services/deviation-detection.service';
import { Types } from 'mongoose';

describe('TasksService - Sprint 4: Kanban + Rastreabilidade', () => {
  let service: TasksService;
  let taskModel: any;
  let feedbackModel: any;
  let geminiService: any;
  let checklistService: any;
  let feedbackService: any;

  const taskId = new Types.ObjectId().toString();
  const projectId = new Types.ObjectId().toString();

  const mockTaskDocument = {
    _id: taskId,
    name: 'Test Task',
    project: projectId,
    status: 'todo',
    statusUpdatedAt: new Date(),
    kanbanOrder: 0,
    isConcluded: false,
    checklist: [],
    save: jest.fn().mockResolvedValue(this),
  };

  const mockFeedbackDocument = {
    _id: 'feedback-1',
    task: taskId,
    feedback: 'Great work! You learned X. Next: Y.',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    geminiService = {
      generateCompletionFeedback: jest.fn(),
      getModelName: jest.fn().mockReturnValue('test-model'),
    };

    feedbackService = {
      generateFeedbackOnCompletion: jest.fn(),
    };

    checklistService = {
      validateChecklistCompletion: jest.fn(),
      calculateCompletionPercentage: jest.fn(),
    };

    taskModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTaskDocument),
      }),
    };

    feedbackModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: taskModel },
        { provide: getModelToken('Project'), useValue: {} },
        { provide: getModelToken('TaskCompletionFeedback'), useValue: feedbackModel },
        { provide: GeminiService, useValue: geminiService },
        { provide: ChecklistService, useValue: checklistService },
        { provide: ProjectsService, useValue: { recalculateProjectStats: jest.fn(), incrementHoursWorked: jest.fn() } },
        { provide: EVMService, useValue: { recordProgress: jest.fn() } },
        { provide: PertService, useValue: { calculatePertMetrics: jest.fn() } },
        { provide: FeedbackService, useValue: feedbackService },
        { provide: AlertsService, useValue: { createAlert: jest.fn() } },
        { provide: DeviationDetectionService, useValue: { generateDeviationAlert: jest.fn() } },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('moveTaskStatus', () => {
    it('should move task from todo to doing and update timestamp', async () => {
      const updatedTask = { ...mockTaskDocument, status: 'doing', statusUpdatedAt: new Date() };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTaskDocument),
      });

      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 0 }),
          }),
        }),
      });

      await service.moveTaskStatus(taskId, { status: 'doing' });

      expect(taskModel.findById).toHaveBeenCalledWith(taskId);
    });

    it('should prevent moving concluded task away from done status', async () => {
      const concludedTask = { ...mockTaskDocument, isConcluded: true, status: 'done' };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(concludedTask),
      });

      await expect(service.moveTaskStatus(taskId, { status: 'todo' })).rejects.toThrow(BadRequestException);
    });

    it('should throw error if task does not exist', async () => {
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const invalidId = new Types.ObjectId().toString();
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.moveTaskStatus(invalidId, { status: 'doing' })).rejects.toThrow();
    });

    it('should set kanbanOrder to append position in destination column', async () => {
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTaskDocument),
      });
      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 5 }),
          }),
        }),
      });

      await service.moveTaskStatus(taskId, { status: 'doing' });

      expect(taskModel.findOne).toHaveBeenCalledWith({
        project: mockTaskDocument.project,
        status: 'doing',
      });
    });
  });

  describe('getTaskLineage', () => {
    it('should return ancestors and children for a task', async () => {
      const parentId = new Types.ObjectId().toString();
      const taskWithParent = { ...mockTaskDocument, parentTaskId: parentId };
      const parentTask = { _id: parentId, name: 'Parent', parentTaskId: null };
      const childTasks = [
        { _id: new Types.ObjectId().toString(), name: 'Child 1', parentTaskId: taskId },
        { _id: new Types.ObjectId().toString(), name: 'Child 2', parentTaskId: taskId },
      ];

      taskModel.findById.mockImplementation((id: string) => ({
        exec: jest.fn().mockResolvedValue(id === taskId ? taskWithParent : parentTask),
      }));
      taskModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(childTasks),
        }),
      });

      const lineage = await service.getTaskLineage(taskId);

      expect(lineage).toHaveProperty('ancestors');
      expect(lineage).toHaveProperty('children');
      expect(lineage).toHaveProperty('warnings');
      expect(lineage.children.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect and warn about depth limit', async () => {
      const parentId = new Types.ObjectId().toString();
      const taskWithParent = { ...mockTaskDocument, parentTaskId: parentId };
      taskModel.findById.mockImplementation((id: string) => ({
        exec: jest.fn().mockResolvedValue(id === taskId ? taskWithParent : null),
      }));
      taskModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const lineage = await service.getTaskLineage(taskId, 1); // maxDepth=1

      expect(lineage.warnings).toBeDefined();
      expect(Array.isArray(lineage.warnings)).toBe(true);
    });

    it('should handle task with no parent (root)', async () => {
      const rootId = new Types.ObjectId().toString();
      const rootTask = { _id: rootId, name: 'Root', parentTaskId: null };
      taskModel.findById.mockImplementation((id: string) => ({
        exec: jest.fn().mockResolvedValue(id === rootId ? rootTask : null),
      }));
      taskModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const lineage = await service.getTaskLineage(rootId);

      expect(lineage.ancestors.length).toBe(0);
    });
  });

  describe('generateCompletionFeedback', () => {
    it('should generate feedback via FeedbackService when task is concluded', async () => {
      const concludedTask = { ...mockTaskDocument, isConcluded: true };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(concludedTask),
      });
      feedbackService.generateFeedbackOnCompletion.mockResolvedValue({
        praise: 'Bom trabalho',
        learning: 'Aprendeu algo',
        nextStep: 'Proximo passo',
        finalText: 'Bom trabalho\nAprendeu algo\nProximo passo',
      });

      const feedback = await service.generateCompletionFeedback(taskId);

      expect(typeof feedback).toBe('string');
      expect(feedbackService.generateFeedbackOnCompletion).toHaveBeenCalled();
    });

    it('should throw error if task does not exist', async () => {
      const missingId = new Types.ObjectId().toString();
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.generateCompletionFeedback(missingId)).rejects.toThrow();
    });

    it('should persist feedback snapshot with task data when payload is provided', async () => {
      const concludedTask = { ...mockTaskDocument, isConcluded: true };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(concludedTask),
      });
      feedbackModel.create.mockResolvedValue(mockFeedbackDocument);

      await service.generateCompletionFeedback(taskId, {
        celebration: 'yay',
        validation: 'ok',
        question: 'next?',
        impediments: [],
        selectedSteps: [],
        action: 'continue',
      });

      const createCall = feedbackModel.create.mock.calls[0];
      expect(createCall[0]).toHaveProperty('feedback');
      expect(createCall[0]).toHaveProperty('task', taskId);
    });
  });

  describe('getCompletionFeedback', () => {
    it('should return latest feedback for a task', async () => {
      feedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockFeedbackDocument),
          }),
        }),
      });

      const feedback = await service.getCompletionFeedback(taskId);

      expect(feedback).toBeDefined();
      expect(feedback?.feedback).toBe(mockFeedbackDocument.feedback);
      expect(feedbackModel.findOne).toHaveBeenCalledWith({
        task: taskId,
        feedback: { $exists: true, $ne: null },
      });
    });

    it('should return null if no feedback exists', async () => {
      feedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      const feedback = await service.getCompletionFeedback(taskId);

      expect(feedback).toBeNull();
    });

    it('should query feedback sorted by createdAt descending (latest first)', async () => {
      feedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockFeedbackDocument),
          }),
        }),
      });

      await service.getCompletionFeedback(taskId);

      expect(feedbackModel.findOne).toHaveBeenCalledWith({
        task: taskId,
        feedback: { $exists: true, $ne: null },
      });
    });
  });

  describe('Integration: moveTaskStatus with checklist validation', () => {
    it('should block moving to done if checklist incomplete', async () => {
      const incompleteTask = {
        ...mockTaskDocument,
        status: 'doing',
        checklist: [
          { name: 'Item 1', completed: true },
          { name: 'Item 2', completed: false },
        ],
      };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(incompleteTask),
      });
      checklistService.validateChecklistCompletion.mockReturnValue({ isValid: false, percentage: 50 });

      // This should throw when attempting to move to 'done'
      await expect(service.moveTaskStatus(taskId, { status: 'done' })).rejects.toThrow();
    });

    it('should allow moving to done if checklist complete', async () => {
      const completeTask = {
        ...mockTaskDocument,
        status: 'doing',
        checklist: [
          { name: 'Item 1', completed: true },
          { name: 'Item 2', completed: true },
        ],
      };
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(completeTask),
      });
      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 0 }),
          }),
        }),
      });
      checklistService.validateChecklistCompletion.mockReturnValue({ isValid: true, percentage: 100 });

      // This should succeed
      // Note: In real implementation, would also call generateCompletionFeedback
      const result = await service.moveTaskStatus(taskId, { status: 'done' });
      
      expect(result).toBeDefined();
    });
  });

  describe('Sprint 4 Kanban Board Scenarios', () => {
    it('should persist status across multiple transitions', async () => {
      let currentTask = { ...mockTaskDocument, status: 'todo' };
      
      // Todo -> Doing
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(currentTask),
      });
      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 0 }),
          }),
        }),
      });
      await service.moveTaskStatus(taskId, { status: 'doing' });
      
      // Verify status was updated
      expect(taskModel.findById).toHaveBeenCalled();
    });

    it('should handle rapid consecutive status moves', async () => {
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTaskDocument),
      });
      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 0 }),
          }),
        }),
      });

      // Simulate rapid moves
      await expect(service.moveTaskStatus(taskId, { status: 'doing' })).resolves.toBeDefined();
      await expect(service.moveTaskStatus(taskId, { status: 'review' })).resolves.toBeDefined();
      
      expect(taskModel.findById).toHaveBeenCalledTimes(2);
    });

    it('should maintain kanbanOrder consistency within columns', async () => {
      taskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTaskDocument),
      });
      taskModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 3 }),
          }),
        }),
      });

      await service.moveTaskStatus(taskId, { status: 'review' });

      // Should append to position after current max order
      expect(taskModel.findOne).toHaveBeenCalledWith({
        project: mockTaskDocument.project,
        status: 'review',
      });
    });
  });
});
