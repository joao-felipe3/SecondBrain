import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksController } from '../../../../src/tasks/tasks.controller';
import { TasksService } from '../../../../src/tasks/tasks.service';
import { CPMService } from '../../../../src/tasks/services/dependencies/cpm.service';
import { DependencyInferenceService } from '../../../../src/tasks/services/dependencies/dependency-inference.service';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: jest.Mocked<TasksService>;
  let cpmService: jest.Mocked<CPMService>;
  let dependencyInference: jest.Mocked<DependencyInferenceService>;

  beforeEach(async () => {
    const mockTasksService = {
      create: jest.fn<any>().mockResolvedValue({ id: 'task-1', name: 'Task 1' }),
      createMany: jest.fn<any>(),
      createMicroTask: jest.fn<any>().mockResolvedValue({ id: 'micro-1' }),
      createRecurringMicroTask: jest.fn<any>().mockResolvedValue({ id: 'rec-1' }),
      suggestPertEstimates: jest
        .fn<any>()
        .mockResolvedValue({ optimistic: 30, mostLikely: 60, pessimistic: 120 }),
      findAll: jest.fn<any>().mockResolvedValue([{ id: 'task-1' }]),
      findMicroTask: jest.fn<any>().mockResolvedValue({ id: 'micro-1' }),
      findOne: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMicroTaskChecklist: jest.fn<any>().mockResolvedValue({ id: 'micro-1', checklist: [] }),
      updateChecklistItem: jest.fn<any>().mockResolvedValue({ id: 'micro-1' }),
      updateRecurringRule: jest.fn<any>().mockResolvedValue({ id: 'rec-1' }),
      remove: jest.fn<any>(),
      markAsConcluded: jest.fn<any>().mockResolvedValue({ id: 'task-1', isConcluded: true }),
      incrementPomodorosDid: jest.fn<any>().mockResolvedValue({ id: 'task-1', pomodorosDid: 1 }),
      handleTaskSkipped: jest.fn<any>().mockResolvedValue({ id: 'task-1', isSkipped: true }),
      getStreakData: jest.fn<any>().mockResolvedValue({ currentStreak: 5, maxStreak: 10 }),
      deleteRecurringSeries: jest.fn<any>().mockResolvedValue({ deletedCount: 3 }),
      updatePert: jest.fn<any>().mockResolvedValue({ id: 'task-1' }),
      moveTaskStatus: jest.fn<any>().mockResolvedValue({ id: 'task-1', status: 'done' }),
      checkDeviationAndCreateAlert: jest.fn<any>().mockResolvedValue({ alert: null }),
      getValidationErrors: jest.fn<any>().mockResolvedValue([]),
      getTaskLineage: jest.fn<any>().mockResolvedValue({ ancestors: [], children: [] }),
      calculateValueContribution: jest.fn<any>().mockResolvedValue({ percentage: 25 }),
      generateCompletionFeedback: jest.fn<any>().mockResolvedValue('Great job!'),
      getCompletionFeedback: jest.fn<any>().mockResolvedValue({ feedback: 'Well done' }),
      savePertEstimate: jest.fn<any>(),
      generateAiSuggestions: jest.fn<any>().mockResolvedValue({ suggestions: [] }),
      generateAiSuggestionsWithProgress: jest.fn<any>(),
    };

    const mockCpmService = {
      upsertDependencies: jest.fn<any>().mockResolvedValue(2),
    };

    const mockDependencyInference = {
      inferHeuristicPhases: jest
        .fn<any>()
        .mockReturnValue([
          { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FS', reason: 'Phase heuristic' },
        ]),
      inferWithAi: jest
        .fn<any>()
        .mockResolvedValue([
          { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FS', reason: 'AI inferred' },
        ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: CPMService, useValue: mockCpmService },
        { provide: DependencyInferenceService, useValue: mockDependencyInference },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    tasksService = module.get(TasksService);
    cpmService = module.get(CPMService);
    dependencyInference = module.get(DependencyInferenceService);
  });

  describe('createBulk', () => {
    it('should throw BadRequestException when tasks is empty or missing', async () => {
      await expect(controller.createBulk({ tasks: [] } as any)).rejects.toThrow(BadRequestException);
      await expect(controller.createBulk({} as any)).rejects.toThrow(BadRequestException);
    });

    it('should create bulk tasks with mode none without dependencies', async () => {
      tasksService.createMany.mockResolvedValueOnce([
        { _id: 't1', name: 'Task 1', parentWbsNodeId: 'wbs-1', project: 'p1' } as any,
        { _id: 't2', name: 'Task 2', parentWbsNodeId: 'wbs-1', project: 'p1' } as any,
      ]);

      const res = await controller.createBulk({
        tasks: [{ name: 'Task 1' }, { name: 'Task 2' }],
        autoDependencies: { mode: 'none' },
      });

      expect(res.insertedCount).toBe(2);
      expect(res.autoDependenciesCreatedOrUpdated).toBe(0);
      expect(cpmService.upsertDependencies).not.toHaveBeenCalled();
    });

    it('should create bulk tasks with mode within-leaf', async () => {
      tasksService.createMany.mockResolvedValueOnce([
        { _id: 't1', name: 'Task 1', parentWbsNodeId: 'wbs-1', project: 'p1' } as any,
        { _id: 't2', name: 'Task 2', parentWbsNodeId: 'wbs-1', project: 'p1' } as any,
        { _id: 't3', name: 'Task 3', parentWbsNodeId: '   ', project: 'p1' } as any, // non-WBS leaf ignored
      ]);

      const res = await controller.createBulk({
        tasks: [{ name: 'Task 1' }, { name: 'Task 2' }, { name: 'Task 3' }],
        autoDependencies: { mode: 'within-leaf', relationship: 'FS', reason: 'Leaf dep' },
      });

      expect(res.insertedCount).toBe(3);
      expect(cpmService.upsertDependencies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ taskId: 't2', dependsOnTaskId: 't1', projectId: 'p1' }),
        ]),
      );
    });

    it('should create bulk tasks with mode within-and-between-leafs', async () => {
      tasksService.createMany.mockResolvedValueOnce([
        { _id: 't1', name: 'Task 1', parentWbsNodeId: 'leaf-1', project: 'p1' } as any,
        { _id: 't2', name: 'Task 2', parentWbsNodeId: 'leaf-2', project: 'p1' } as any,
      ]);

      const res = await controller.createBulk({
        tasks: [{ name: 'Task 1' }, { name: 'Task 2' }],
        autoDependencies: { mode: 'within-and-between-leafs' },
      });

      expect(res.insertedCount).toBe(2);
      expect(cpmService.upsertDependencies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ taskId: 't2', dependsOnTaskId: 't1', projectId: 'p1' }),
        ]),
      );
    });

    it('should create bulk tasks with heuristic-phases inference', async () => {
      tasksService.createMany.mockResolvedValueOnce([
        {
          _id: 't1',
          name: 'Task 1',
          parentWbsNodeId: 'leaf-1',
          project: 'p1',
          checklist: ['Item 1', { item: 'Item 2' }],
          definitionOfDone: 'Done',
          microTaskType: 'execution',
        } as any,
        {
          _id: 't2',
          name: 'Task 2',
          parentWbsNodeId: 'leaf-1',
          project: 'p1',
        } as any,
      ]);

      const res = await controller.createBulk({
        tasks: [{ name: 'Task 1' }, { name: 'Task 2' }],
        autoDependencies: { mode: 'heuristic-phases' },
      });

      expect(res).toBeDefined();
      expect(dependencyInference.inferHeuristicPhases).toHaveBeenCalled();
      expect(cpmService.upsertDependencies).toHaveBeenCalled();
    });

    it('should create bulk tasks with ai-per-leaf inference', async () => {
      tasksService.createMany.mockResolvedValueOnce([
        { _id: 't1', name: 'Task 1', parentWbsNodeId: 'leaf-1', project: 'p1' } as any,
        { _id: 't2', name: 'Task 2', parentWbsNodeId: 'leaf-1', project: 'p1' } as any,
      ]);

      const res = await controller.createBulk({
        tasks: [{ name: 'Task 1' }, { name: 'Task 2' }],
        autoDependencies: { mode: 'ai-per-leaf' },
      });

      expect(res).toBeDefined();
      expect(dependencyInference.inferWithAi).toHaveBeenCalled();
      expect(cpmService.upsertDependencies).toHaveBeenCalled();
    });
  });

  describe('CRUD operations & handlers', () => {
    it('should create a new task', async () => {
      const dto = { name: 'New Task' } as any;
      const res = await controller.create(dto);
      expect(tasksService.create).toHaveBeenCalledWith(dto);
      expect(res).toBeDefined();
    });

    it('should create micro task and recurring micro task', async () => {
      const dto = { name: 'Micro' } as any;
      await controller.createMicroTask(dto);
      expect(tasksService.createMicroTask).toHaveBeenCalledWith(dto);

      await controller.createRecurringMicroTask(dto);
      expect(tasksService.createRecurringMicroTask).toHaveBeenCalledWith(dto);

      await controller.createHabit(dto);
      expect(tasksService.createRecurringMicroTask).toHaveBeenCalledWith(dto);
    });

    it('should suggest PERT estimates', async () => {
      const dto = { taskType: 'dev', description: 'desc', projectContext: 'ctx' };
      const res = await controller.suggestPertEstimates(dto as any);
      expect(tasksService.suggestPertEstimates).toHaveBeenCalledWith('dev', 'desc', 'ctx');
      expect(res).toBeDefined();
    });

    it('should list all tasks', async () => {
      const res = await controller.findAll();
      expect(tasksService.findAll).toHaveBeenCalled();
      expect(res.length).toBe(1);
    });

    it('should generate AI suggestions', async () => {
      const dto = { projectName: 'Test', targetHours: 20 } as any;
      await controller.generateAiSuggestions(dto);
      expect(tasksService.generateAiSuggestions).toHaveBeenCalledWith(dto);
    });

    it('should find a micro task', async () => {
      await controller.findMicroTask('micro-1');
      expect(tasksService.findMicroTask).toHaveBeenCalledWith('micro-1');
    });

    it('should update micro task checklist and checklist item', async () => {
      await controller.updateMicroTaskChecklist('micro-1', { checklist: [] });
      expect(tasksService.updateMicroTaskChecklist).toHaveBeenCalledWith('micro-1', []);

      await controller.updateChecklistItem('task-1', '0', { completed: true });
      expect(tasksService.updateChecklistItem).toHaveBeenCalledWith({
        taskId: 'task-1',
        itemIndex: '0',
        completed: true,
      });
    });

    it('should update recurring rules and streak/skip', async () => {
      const rule = { frequency: 'daily' } as any;
      await controller.updateRecurringRuleCompat('rec-1', { recurringRule: rule });
      await controller.updateRecurringRule('rec-1', { recurringRule: rule });
      expect(tasksService.updateRecurringRule).toHaveBeenCalledTimes(2);

      await controller.skipTask('rec-1');
      expect(tasksService.handleTaskSkipped).toHaveBeenCalledWith('rec-1');

      await controller.getRecurringStreak('parent-1');
      expect(tasksService.getStreakData).toHaveBeenCalledWith('parent-1');
    });

    it('should delete recurring series with confirmation', async () => {
      await expect(controller.deleteRecurringSeries('parent-1', 'false')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.deleteRecurringSeries('parent-1', undefined)).rejects.toThrow(
        BadRequestException,
      );

      const res = await controller.deleteRecurringSeries('parent-1', 'true');
      expect(tasksService.deleteRecurringSeries).toHaveBeenCalledWith('parent-1');
      expect(res).toBeDefined();
    });

    it('should update PERT and move task status', async () => {
      await controller.updatePert('t1', { optimistic: 10, mostLikely: 20, pessimistic: 30 } as any);
      expect(tasksService.updatePert).toHaveBeenCalled();

      await controller.moveTaskStatus('t1', { status: 'done' } as any);
      expect(tasksService.moveTaskStatus).toHaveBeenCalledWith('t1', { status: 'done' });
    });

    it('should check deviation and validation errors and lineage', async () => {
      await controller.checkDeviation('t1');
      expect(tasksService.checkDeviationAndCreateAlert).toHaveBeenCalledWith('t1');

      await controller.getValidationErrors('t1');
      expect(tasksService.getValidationErrors).toHaveBeenCalledWith('t1');

      await controller.getTaskLineage('t1', {});
      expect(tasksService.getTaskLineage).toHaveBeenCalledWith('t1', {});

      await controller.getValueContribution('t1');
      expect(tasksService.calculateValueContribution).toHaveBeenCalledWith('t1');
    });

    it('should handle completion feedback', async () => {
      const res = await controller.generateCompletionFeedback('t1', {});
      expect(res.feedback).toBe('Great job!');

      tasksService.findOne.mockResolvedValueOnce(null);
      await expect(controller.getCompletionFeedback('t1')).rejects.toThrow(NotFoundException);

      tasksService.findOne.mockResolvedValueOnce({ id: 't1' } as any);
      const feedback = await controller.getCompletionFeedback('t1');
      expect(feedback).toBeDefined();
    });

    it('should handle findOne, update and remove with not found exceptions', async () => {
      tasksService.findOne.mockResolvedValueOnce(null);
      await expect(controller.findOne('t1')).rejects.toThrow(NotFoundException);

      tasksService.findOne.mockResolvedValueOnce({ id: 't1' } as any);
      expect(await controller.findOne('t1')).toEqual({ id: 't1' });

      tasksService.update.mockResolvedValueOnce(null);
      await expect(controller.update('t1', {} as any)).rejects.toThrow(NotFoundException);

      tasksService.update.mockResolvedValueOnce({ id: 't1' } as any);
      expect(await controller.update('t1', {} as any)).toEqual({ id: 't1' });

      tasksService.remove.mockResolvedValueOnce(false);
      await expect(controller.remove('t1')).rejects.toThrow(NotFoundException);

      tasksService.remove.mockResolvedValueOnce(true);
      const del = await controller.remove('t1');
      expect(del.message).toBe('Task removed successfully');
    });

    it('should mark as concluded and increment pomodoros', async () => {
      await controller.markAsConcluded('t1');
      expect(tasksService.markAsConcluded).toHaveBeenCalledWith('t1');

      await controller.incrementPomodorosDid('t1');
      expect(tasksService.incrementPomodorosDid).toHaveBeenCalledWith('t1');
    });

    it('should save PERT estimate and handle error branches', async () => {
      tasksService.savePertEstimate.mockResolvedValueOnce({ expectedTime: 10 } as any);
      const res = await controller.savePertEstimate('t1', {
        optimistic: 5,
        mostLikely: 10,
        pessimistic: 15,
      });
      expect(res.expectedTime).toBe(10);

      tasksService.savePertEstimate.mockRejectedValueOnce(new Error('Tarefa não encontrada'));
      await expect(
        controller.savePertEstimate('t1', { optimistic: 5, mostLikely: 10, pessimistic: 15 }),
      ).rejects.toThrow(NotFoundException);

      tasksService.savePertEstimate.mockRejectedValueOnce(new Error('Estimativas inválidas'));
      await expect(
        controller.savePertEstimate('t1', { optimistic: 5, mostLikely: 10, pessimistic: 15 }),
      ).rejects.toThrow(BadRequestException);

      tasksService.savePertEstimate.mockRejectedValueOnce('string error');
      await expect(
        controller.savePertEstimate('t1', { optimistic: 5, mostLikely: 10, pessimistic: 15 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should stream AI suggestions via SSE Observable', (done) => {
      tasksService.generateAiSuggestionsWithProgress.mockImplementationOnce(
        async ({ onProgress, onComplete }) => {
          onProgress({ status: 'in_progress', message: 'starting' } as any);
          onComplete({ suggestions: [] } as any);
        },
      );

      const stream$ = controller.generateAiSuggestionsStream(
        'Proj',
        'p1',
        'Short',
        'Mid',
        'Long',
        'Prompt',
        '40',
      );

      const events: any[] = [];
      stream$.subscribe({
        next: (ev) => events.push(ev.data),
        complete: () => {
          expect(events.length).toBe(2);
          expect(events[0]).toEqual({ status: 'in_progress', message: 'starting' });
          expect(events[1]).toEqual({ type: 'complete', result: { suggestions: [] } });
          done();
        },
      });
    });

    it('should handle error in SSE Observable stream', (done) => {
      tasksService.generateAiSuggestionsWithProgress.mockImplementationOnce(async ({ onError }) => {
        onError(new Error('SSE Error'));
      });

      const stream$ = controller.generateAiSuggestionsStream('', '', '', '', '', '', '');
      stream$.subscribe({
        next: () => {},
        error: (err) => {
          expect(err.message).toBe('SSE Error');
          done();
        },
      });
    });
  });
});
