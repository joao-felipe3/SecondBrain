import { Types } from 'mongoose';
import { TasksController } from '@src/tasks/tasks.controller';

describe('TasksController', () => {
  let controller: TasksController;
  let mockTasksService: any;
  let mockCpmService: any;
  let mockDependencyInference: any;

  const validTaskId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockTasksService = {
      create: jest.fn().mockResolvedValue({ _id: validTaskId, name: 'Task 1' }),
      createMicroTask: jest.fn().mockResolvedValue({ _id: validTaskId, name: 'Micro 1' }),
      createRecurringMicroTask: jest.fn().mockResolvedValue({ _id: validTaskId }),
      createMany: jest.fn().mockResolvedValue([{ _id: validTaskId, parentWbsNodeId: 'wbs1' }]),
      findAll: jest.fn().mockResolvedValue([{ _id: validTaskId }]),
      findOne: jest.fn().mockResolvedValue({ _id: validTaskId, name: 'Task 1' }),
      findMicroTask: jest.fn().mockResolvedValue({ _id: validTaskId, name: 'Micro 1' }),
      update: jest.fn().mockResolvedValue({ _id: validTaskId, name: 'Updated' }),
      remove: jest.fn().mockResolvedValue(true),
      markAsConcluded: jest.fn().mockResolvedValue({ _id: validTaskId, isConcluded: true }),
      incrementPomodorosDid: jest.fn().mockResolvedValue({ _id: validTaskId, pomodorosDid: 1 }),
      updateChecklistItem: jest.fn().mockResolvedValue({ _id: validTaskId }),
      updateMicroTaskChecklist: jest.fn().mockResolvedValue({ _id: validTaskId }),
      updateRecurringRule: jest.fn().mockResolvedValue({ _id: validTaskId }),
      handleTaskSkipped: jest.fn().mockResolvedValue({ _id: validTaskId }),
      getStreakData: jest.fn().mockResolvedValue({ currentStreak: 5 }),
      deleteRecurringSeries: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      suggestPertEstimates: jest
        .fn()
        .mockResolvedValue({ optimistic: 30, mostLikely: 60, pessimistic: 120 }),
      updatePert: jest.fn().mockResolvedValue({ _id: validTaskId }),
      savePertEstimate: jest.fn().mockResolvedValue({ taskId: validTaskId }),
      generateAiSuggestions: jest.fn().mockResolvedValue({ suggestions: [] }),
      moveTaskStatus: jest.fn().mockResolvedValue({ _id: validTaskId }),
      checkDeviationAndCreateAlert: jest.fn().mockResolvedValue({ alertCreated: false }),
      getValidationErrors: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      getTaskLineage: jest.fn().mockResolvedValue({ chain: [] }),
      calculateValueContribution: jest.fn().mockResolvedValue({ contributionScore: 100 }),
      generateCompletionFeedback: jest.fn().mockResolvedValue('Feedback AI'),
      getCompletionFeedback: jest.fn().mockResolvedValue({ feedback: 'Feedback AI' }),
    };

    mockCpmService = {
      upsertDependencies: jest.fn().mockResolvedValue(1),
    };

    mockDependencyInference = {
      inferHeuristicPhases: jest.fn().mockReturnValue([]),
      inferWithAi: jest.fn().mockResolvedValue([]),
    };

    controller = new TasksController(mockTasksService, mockCpmService, mockDependencyInference);
  });

  describe('Bulk & CRUD operations', () => {
    it('should create bulk tasks with auto dependencies', async () => {
      const result = await controller.createBulk({
        tasks: [
          { name: 'Task 1', parentWbsNodeId: 'wbs1' },
          { name: 'Task 2', parentWbsNodeId: 'wbs1' },
        ] as any,
        autoDependencies: { mode: 'within-leaf' } as any,
      });

      expect(result.insertedCount).toBe(1);
      expect(mockTasksService.createMany).toHaveBeenCalled();
    });

    it('should create single task and microtask', async () => {
      const task = await controller.create({ name: 'Task' } as any);
      expect(task).toBeDefined();

      const micro = await controller.createMicroTask({ name: 'Micro' } as any);
      expect(micro).toBeDefined();
    });

    it('should list all tasks and find one', async () => {
      const all = await controller.findAll();
      expect(all.length).toBe(1);

      const task = await controller.findOne(validTaskId);
      expect(task).toBeDefined();
    });

    it('should update, mark concluded and delete recurring series with confirmation', async () => {
      const updated = await controller.update(validTaskId, { name: 'New Name' });
      expect(updated).toBeDefined();

      const concluded = await controller.markAsConcluded(validTaskId);
      expect(concluded.isConcluded).toBe(true);

      const deletedSeries = await controller.deleteRecurringSeries('parent1', 'true');
      expect(deletedSeries.deletedCount).toBe(1);
    });

    it('should handle PERT and feedback methods', async () => {
      const suggestions = await controller.suggestPertEstimates({
        taskType: 'code' as any,
        description: 'desc',
      });
      expect(suggestions.optimistic).toBe(30);

      const feedback = await controller.generateCompletionFeedback(validTaskId, {} as any);
      expect(feedback.feedback).toBe('Feedback AI');

      const savedPert = await controller.savePertEstimate(validTaskId, {
        optimisticMinutes: 10,
        mostLikelyMinutes: 20,
        pessimisticMinutes: 40,
      } as any);
      expect(savedPert).toBeDefined();
    });

    it('should handle checklist updates, recurring rules and streak', async () => {
      await controller.updateChecklistItem(validTaskId, '0', { completed: true });
      expect(mockTasksService.updateChecklistItem).toHaveBeenCalled();

      await controller.updateMicroTaskChecklist(validTaskId, { checklist: ['item 1'] } as any);
      expect(mockTasksService.updateMicroTaskChecklist).toHaveBeenCalled();

      await controller.updateRecurringRuleCompat(validTaskId, {
        recurringRule: { frequency: 'daily' } as any,
      });
      expect(mockTasksService.updateRecurringRule).toHaveBeenCalled();

      const streak = await controller.getRecurringStreak('parent1');
      expect(streak.currentStreak).toBe(5);
    });

    it('should handle status move, lineage, value contribution and deviation check', async () => {
      await controller.moveTaskStatus(validTaskId, { status: 'in_progress' } as any);
      expect(mockTasksService.moveTaskStatus).toHaveBeenCalled();

      const lineage = await controller.getTaskLineage(validTaskId);
      expect(lineage).toBeDefined();

      const val = await controller.getValueContribution(validTaskId);
      expect(val).toBeDefined();

      const dev = await controller.checkDeviation(validTaskId);
      expect(dev.alertCreated).toBe(false);
    });

    it('should handle pomodoro increment, skip, and validation errors', async () => {
      await controller.incrementPomodorosDid(validTaskId);
      expect(mockTasksService.incrementPomodorosDid).toHaveBeenCalled();

      await controller.skipTask(validTaskId);
      expect(mockTasksService.handleTaskSkipped).toHaveBeenCalled();

      const errors = await controller.getValidationErrors(validTaskId);
      expect(errors.valid).toBe(true);
    });
  });
});
