import { Types } from 'mongoose';
import { CPMController } from '@src/tasks/controllers/cpm.controller';

describe('CPMController', () => {
  let controller: CPMController;
  let mockCpmService: any;
  let mockTasksService: any;
  let mockDependencyInference: any;
  let mockBufferService: any;

  const validProjId = new Types.ObjectId().toHexString();
  const validTaskId1 = new Types.ObjectId().toHexString();
  const validTaskId2 = new Types.ObjectId().toHexString();
  const validTaskId3 = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockCpmService = {
      getDependencies: jest.fn().mockResolvedValue([
        {
          id: 'dep1',
          taskId: validTaskId2,
          dependsOnTaskId: validTaskId1,
          relationship: 'FINISH_TO_START',
          reason: 'Sequential',
          isAutoIdentified: true,
        },
      ]),
      addDependency: jest.fn().mockResolvedValue({
        id: 'dep1',
        taskId: validTaskId2,
        dependsOnTaskId: validTaskId1,
        relationship: 'FINISH_TO_START',
        createdAt: new Date(),
      }),
      removeDependency: jest.fn().mockResolvedValue(undefined),
      removeDependenciesByIds: jest.fn().mockResolvedValue(1),
      upsertDependencies: jest.fn().mockResolvedValue(1),
      calculateCriticalPath: jest.fn().mockReturnValue({
        criticalPath: [validTaskId1, validTaskId2],
        projectDuration: 120,
        tasksByImpact: [
          {
            id: validTaskId1,
            name: 'Task 1',
            earlyStart: 0,
            earlyFinish: 60,
            lateStart: 0,
            lateFinish: 60,
            slack: 0,
            isCritical: true,
          },
        ],
      }),
      normalizeRelationship: jest.fn().mockReturnValue('FINISH_TO_START'),
    };

    mockTasksService = {
      findByProjectId: jest.fn().mockResolvedValue([
        {
          _id: validTaskId1,
          name: 'Task 1',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs1',
          wbsPath: '1.1',
        },
        {
          _id: validTaskId2,
          name: 'Task 2',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs1',
          wbsPath: '1.1',
        },
        {
          _id: validTaskId3,
          name: 'Task 3',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs2',
          wbsPath: '1.2',
        },
      ]),
      findOne: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve({ _id: id, name: id === validTaskId1 ? 'Task 1' : 'Task 2' }),
        ),
    };

    mockDependencyInference = {
      inferHeuristicPhases: jest
        .fn()
        .mockReturnValue([
          { taskId: validTaskId2, dependsOnTaskId: validTaskId1, relationship: 'FINISH_TO_START' },
        ]),
      inferWithAi: jest
        .fn()
        .mockResolvedValue([
          { taskId: validTaskId2, dependsOnTaskId: validTaskId1, relationship: 'FINISH_TO_START' },
        ]),
      inferInterLeafWithAi: jest
        .fn()
        .mockResolvedValue([
          { taskId: validTaskId3, dependsOnTaskId: validTaskId2, relationship: 'FINISH_TO_START' },
        ]),
    };

    mockBufferService = {
      calculateProjectBuffer: jest.fn().mockResolvedValue({ bufferMinutes: 30 }),
    };

    controller = new CPMController(
      mockCpmService,
      mockTasksService,
      mockDependencyInference,
      mockBufferService,
    );
  });

  describe('Dependencies & Critical Path endpoints', () => {
    it('should auto-infer dependencies with heuristic strategy', async () => {
      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'heuristic-phases',
        apply: false,
      } as any);

      expect(res.strategy).toBe('heuristic-phases');
      expect(res.dependenciesSuggested).toBeGreaterThan(0);
    });

    it('should auto-infer dependencies with ai-per-leaf strategy and apply=true', async () => {
      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: true,
        includeInterLeafGates: true,
        interLeafStrategy: 'ai',
      } as any);

      expect(res.apply).toBe(true);
      expect(res.applySummary).toBeDefined();
    });

    it('should auto-infer dependencies with interLeafStrategy heuristic', async () => {
      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: false,
        includeInterLeafGates: true,
        interLeafStrategy: 'heuristic',
      } as any);

      expect(res.interLeafMode).toBe('heuristic');
    });

    it('should handle interLeafWithAi errors gracefully and fallback to heuristic', async () => {
      mockDependencyInference.inferInterLeafWithAi.mockRejectedValueOnce(
        new Error('AI interleaf error'),
      );

      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: false,
        includeInterLeafGates: true,
        interLeafStrategy: 'ai',
      } as any);

      expect(res.interLeafMode).toBe('heuristic');
    });

    it('should handle leaf inference error gracefully', async () => {
      mockDependencyInference.inferWithAi.mockRejectedValueOnce(new Error('Leaf AI error'));

      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: false,
      } as any);

      expect(res).toBeDefined();
    });

    it('should calculate critical path and project buffer', async () => {
      const res = await controller.calculateCriticalPath(validProjId);
      expect(res.analysis.criticalPath.length).toBe(2);
      expect(mockBufferService.calculateProjectBuffer).toHaveBeenCalled();
    });

    it('should handle buffer calculation error gracefully', async () => {
      mockBufferService.calculateProjectBuffer.mockRejectedValueOnce(new Error('Buffer err'));
      const res = await controller.calculateCriticalPath(validProjId);
      expect(res.analysis).toBeDefined();
    });

    it('should get task metrics for specific task', async () => {
      const metrics = await controller.getTaskMetrics(validTaskId1, validProjId);
      expect(metrics.taskId).toBe(validTaskId1);
      expect(metrics.isCritical).toBe(true);
    });

    it('should throw error when getTaskMetrics cannot find task', async () => {
      mockTasksService.findOne.mockResolvedValueOnce(null);
      await expect(controller.getTaskMetrics('invalid-id', validProjId)).rejects.toThrow(
        'Tarefa não encontrada',
      );
    });

    it('should list dependencies', async () => {
      const deps = await controller.getDependencies(validProjId);
      expect(deps.count).toBe(1);
    });

    it('should add and remove dependency between tasks', async () => {
      const added = await controller.addDependency(validProjId, {
        taskId: validTaskId2,
        dependsOnTaskId: validTaskId1,
      });

      expect(added.id).toBe('dep1');

      const removed = await controller.removeDependency(validTaskId2, validTaskId1);
      expect(removed.message).toBeDefined();
    });

    it('should throw error when addDependency task is not found', async () => {
      mockTasksService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.addDependency(validProjId, {
          taskId: 'invalid-id',
          dependsOnTaskId: validTaskId1,
        }),
      ).rejects.toThrow('Uma ou ambas as tarefas não foram encontradas');
    });

    it('should check and clear dependency cycles', async () => {
      const cycle = await controller.getDependencyCycle(validProjId);
      expect(cycle.hasCycle).toBe(false);

      const clear = await controller.clearDependencyCycle(validProjId, { mode: 'all' } as any);
      expect(clear.cleared).toBe(false);
    });

    it('should handle cycle clear when cycle exists', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([
        { id: 'dep1', taskId: validTaskId1, dependsOnTaskId: validTaskId2, isAutoIdentified: true },
        { id: 'dep2', taskId: validTaskId2, dependsOnTaskId: validTaskId1, isAutoIdentified: true },
      ]);

      const clear = await controller.clearDependencyCycle(validProjId, { mode: 'auto-only' } as any);
      expect(clear.cleared).toBe(true);
    });

    it('should handle cycle clear when mode is auto-only but edges are not auto-identified', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([
        { id: 'dep1', taskId: validTaskId1, dependsOnTaskId: validTaskId2, isAutoIdentified: false },
        { id: 'dep2', taskId: validTaskId2, dependsOnTaskId: validTaskId1, isAutoIdentified: false },
      ]);

      const clear = await controller.clearDependencyCycle(validProjId, { mode: 'auto-only' } as any);
      expect(clear.cleared).toBe(false);
      expect(clear.hasCycleAfter).toBe(true);
    });
  });
});
