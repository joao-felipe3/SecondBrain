import { TasksService } from '@src/tasks/tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let mockTaskRepo: any;
  let mockProjectsService: any;
  let mockGeminiService: any;
  let mockFeedbackService: any;
  let mockPertService: any;
  let mockWriteService: any;
  let mockRecurringService: any;
  let mockAiSuggestionsService: any;
  let mockHabitsService: any;
  let mockHierarchyService: any;
  let mockChecklistOpsService: any;
  let mockCompletionService: any;

  beforeEach(() => {
    mockTaskRepo = {
      findAll: jest.fn().mockResolvedValue([{ id: 't1' }]),
      findByProjectId: jest.fn().mockResolvedValue([{ id: 't1' }]),
      findById: jest.fn().mockResolvedValue({ id: 't1' }),
    };

    mockProjectsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue(undefined),
    };

    mockGeminiService = {
      suggestPertEstimates: jest
        .fn()
        .mockResolvedValue({ optimistic: 30, mostLikely: 60, pessimistic: 120 }),
    };

    mockFeedbackService = {
      generateCompletionFeedback: jest.fn().mockResolvedValue('Feedback AI'),
      getCompletionFeedback: jest.fn().mockResolvedValue(null),
    };

    mockPertService = {
      updatePert: jest.fn().mockResolvedValue({ id: 't1' }),
      savePertEstimate: jest.fn().mockResolvedValue({ taskId: 't1' }),
    };

    mockWriteService = {
      createMany: jest.fn().mockResolvedValue([{ id: 't1' }]),
      createMicroTask: jest.fn().mockResolvedValue({ id: 't1' }),
      createTaskCore: jest.fn().mockResolvedValue({ id: 't1' }),
      update: jest.fn().mockResolvedValue({ id: 't1' }),
      remove: jest.fn().mockResolvedValue(true),
    };

    mockRecurringService = {
      createRecurringTemplate: jest.fn().mockResolvedValue({ id: 't1' }),
      createRecurringMicroTask: jest.fn().mockResolvedValue({ id: 't1' }),
      updateRecurringRule: jest.fn().mockResolvedValue({ id: 't1' }),
      generateNextOccurrence: jest.fn().mockResolvedValue({ id: 't2' }),
      findRecurringSeries: jest.fn().mockResolvedValue([{ id: 't1' }]),
      deleteRecurringSeries: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    mockAiSuggestionsService = {
      generateAiSuggestionsWithProgress: jest.fn().mockResolvedValue(undefined),
      generateAiSuggestions: jest.fn().mockResolvedValue({ suggestions: [] }),
    };

    mockHabitsService = {
      getStreakData: jest.fn().mockResolvedValue({ currentStreak: 5 }),
      getHabitsDashboard: jest.fn().mockResolvedValue({ summary: {} }),
    };

    mockHierarchyService = {
      getTaskLineage: jest.fn().mockResolvedValue({ chain: [] }),
      getDescendants: jest.fn().mockResolvedValue([]),
      calculateValueContribution: jest.fn().mockResolvedValue({ contributionScore: 100 }),
    };

    mockChecklistOpsService = {
      generateChecklistForTask: jest.fn().mockResolvedValue(['step 1']),
      generateChecklistWithHistory: jest.fn().mockResolvedValue(['step 1']),
      updateChecklistItem: jest.fn().mockResolvedValue({ id: 't1' }),
      updateMicroTaskChecklist: jest.fn().mockResolvedValue({ id: 't1' }),
      validateCompletionRequirements: jest.fn().mockResolvedValue({ isValid: true }),
      getValidationErrors: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    };

    mockCompletionService = {
      moveTaskStatus: jest.fn().mockResolvedValue({ id: 't1' }),
      markAsConcluded: jest.fn().mockResolvedValue({ id: 't1', recurringRule: 'FREQ=DAILY' }),
      incrementPomodorosDid: jest.fn().mockResolvedValue({ id: 't1' }),
      handleTaskCompletion: jest.fn().mockResolvedValue({ id: 't1' }),
      handleTaskSkipped: jest.fn().mockResolvedValue({ id: 't1' }),
      handleTaskDeferred: jest.fn().mockResolvedValue({ id: 't1' }),
      createDeviationAlertForTask: jest.fn().mockResolvedValue({ alertCreated: false }),
    };

    service = new TasksService(
      mockTaskRepo,
      mockProjectsService,
      mockGeminiService,
      mockFeedbackService,
      mockPertService,
      mockWriteService,
      mockRecurringService,
      mockAiSuggestionsService,
      mockHabitsService,
      mockHierarchyService,
      mockChecklistOpsService,
      mockCompletionService,
    );
  });

  describe('CRUD & delegate calls', () => {
    it('should delegate create calls properly', async () => {
      await service.create({ name: 'Task' } as any);
      expect(mockWriteService.createTaskCore).toHaveBeenCalled();

      await service.create({ name: 'MicroTask', microTaskType: 'code' } as any);
      expect(mockWriteService.createMicroTask).toHaveBeenCalled();

      await service.createMany([{ name: 'Task' }] as any);
      expect(mockWriteService.createMany).toHaveBeenCalled();

      await service.createRecurringTemplate({ name: 'Rec' } as any);
      expect(mockRecurringService.createRecurringTemplate).toHaveBeenCalled();

      await service.createRecurringMicroTask({ name: 'RecMicro' } as any);
      expect(mockRecurringService.createRecurringMicroTask).toHaveBeenCalled();
    });

    it('should delegate read & project stats calls', async () => {
      await service.recalculateProjectStats('p1');
      expect(mockProjectsService.recalculateProjectStats).toHaveBeenCalledWith('p1');

      const all = await service.findAll();
      expect(all.length).toBe(1);

      const projTasks = await service.findByProjectId('p1');
      expect(projTasks.length).toBe(1);

      const task = await service.findOne('t1');
      expect(task).toBeDefined();

      const micro = await service.findMicroTask('t1');
      expect(micro).toBeDefined();
    });

    it('should delegate checklist & copilot calls', async () => {
      await service.generateChecklistViaCopilot({ taskName: 'T1' });
      expect(mockChecklistOpsService.generateChecklistForTask).toHaveBeenCalled();

      await service.generateChecklistViaCopilotWithHistory({ taskName: 'T1' });
      expect(mockChecklistOpsService.generateChecklistWithHistory).toHaveBeenCalled();

      await service.updateChecklistItem({ taskId: 't1', itemIndex: '0', completed: true });
      expect(mockChecklistOpsService.updateChecklistItem).toHaveBeenCalled();

      await service.updateMicroTaskChecklist('t1', ['item 1']);
      expect(mockChecklistOpsService.updateMicroTaskChecklist).toHaveBeenCalled();

      await service.validateCompletionRequirements('t1');
      expect(mockChecklistOpsService.validateCompletionRequirements).toHaveBeenCalled();

      await service.getValidationErrors('t1');
      expect(mockChecklistOpsService.getValidationErrors).toHaveBeenCalled();
    });

    it('should delegate completion, feedback & deviation calls', async () => {
      const concluded = await service.markAsConcluded('t1');
      expect(concluded).toBeDefined();
      expect(mockCompletionService.handleTaskCompletion).toHaveBeenCalledWith('t1');

      await service.incrementPomodorosDid('t1');
      expect(mockCompletionService.incrementPomodorosDid).toHaveBeenCalled();

      await service.handleTaskSkipped('t1');
      expect(mockCompletionService.handleTaskSkipped).toHaveBeenCalled();

      await service.handleTaskDeferred('t1', new Date());
      expect(mockCompletionService.handleTaskDeferred).toHaveBeenCalled();

      await service.checkDeviationAndCreateAlert('t1');
      expect(mockCompletionService.createDeviationAlertForTask).toHaveBeenCalled();

      await service.generateCompletionFeedback('t1');
      expect(mockFeedbackService.generateCompletionFeedback).toHaveBeenCalled();

      await service.getCompletionFeedback('t1');
      expect(mockFeedbackService.getCompletionFeedback).toHaveBeenCalled();
    });

    it('should delegate recurring, habits, and AI suggestions calls', async () => {
      await service.updateRecurringRule('t1', {} as any);
      expect(mockRecurringService.updateRecurringRule).toHaveBeenCalled();

      await service.generateNextOccurrence('t1');
      expect(mockRecurringService.generateNextOccurrence).toHaveBeenCalled();

      await service.findRecurringSeries('p1');
      expect(mockRecurringService.findRecurringSeries).toHaveBeenCalled();

      await service.deleteRecurringSeries('p1');
      expect(mockRecurringService.deleteRecurringSeries).toHaveBeenCalled();

      await service.getStreakData('p1');
      expect(mockHabitsService.getStreakData).toHaveBeenCalled();

      await service.getHabitsDashboard();
      expect(mockHabitsService.getHabitsDashboard).toHaveBeenCalled();

      await service.generateAiSuggestions({ projectName: 'P1' });
      expect(mockAiSuggestionsService.generateAiSuggestions).toHaveBeenCalled();

      await service.generateAiSuggestionsWithProgress({} as any);
      expect(mockAiSuggestionsService.generateAiSuggestionsWithProgress).toHaveBeenCalled();
    });
  });
});
