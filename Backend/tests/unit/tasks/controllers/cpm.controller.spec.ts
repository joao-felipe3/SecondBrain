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
  const validTaskId4 = new Types.ObjectId().toHexString();
  const validTaskId5 = new Types.ObjectId().toHexString();
  const validTaskId6 = new Types.ObjectId().toHexString();

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
          {
            id: validTaskId2,
            name: 'Task 2',
            earlyStart: 60,
            earlyFinish: 120,
            lateStart: 60,
            lateFinish: 120,
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
          microTaskType: 'prepare',
        },
        {
          _id: validTaskId2,
          name: 'Task 2',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs1',
          wbsPath: '1.1',
          microTaskType: 'test',
        },
        {
          _id: validTaskId3,
          name: 'Task 3',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs2',
          wbsPath: '1.2',
          microTaskType: 'produce',
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

    it('should supplement sparse multi-leaf interleaf graph when >= 6 leaves exist', async () => {
      mockTasksService.findByProjectId.mockResolvedValueOnce([
        { _id: validTaskId1, parentWbsNodeId: 'leaf1', wbsPath: '1.1', microTaskType: 'prepare' },
        { _id: validTaskId2, parentWbsNodeId: 'leaf2', wbsPath: '1.2', microTaskType: 'produce' },
        { _id: validTaskId3, parentWbsNodeId: 'leaf3', wbsPath: '1.3', microTaskType: 'test' },
        { _id: validTaskId4, parentWbsNodeId: 'leaf4', wbsPath: '1.4', microTaskType: 'consolidate' },
        { _id: validTaskId5, parentWbsNodeId: 'leaf5', wbsPath: '1.5', microTaskType: 'practice' },
        { _id: validTaskId6, parentWbsNodeId: 'leaf6', wbsPath: '1.6', microTaskType: 'produce' },
      ]);

      mockDependencyInference.inferInterLeafWithAi.mockResolvedValueOnce([]); // sparse AI output

      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: true,
        includeInterLeafGates: true,
        interLeafStrategy: 'ai',
      } as any);

      expect(res.dependenciesSuggested).toBeGreaterThan(0);
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

    it('should calculate critical path and project buffer with title and estimatedMinutes', async () => {
      mockTasksService.findByProjectId.mockResolvedValueOnce([
        {
          id: validTaskId1,
          title: 'Task Title',
          estimatedMinutes: 45,
          variance: 10,
        },
      ]);

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

    it('should throw error when getTaskMetrics cannot find task in database', async () => {
      mockTasksService.findOne.mockResolvedValueOnce(null);
      await expect(controller.getTaskMetrics('invalid-id', validProjId)).rejects.toThrow(
        'Tarefa não encontrada',
      );
    });

    it('should throw error when getTaskMetrics cannot find task in CPM analysis', async () => {
      mockCpmService.calculateCriticalPath.mockReturnValueOnce({
        criticalPath: [],
        projectDuration: 0,
        tasksByImpact: [],
      });

      await expect(controller.getTaskMetrics(validTaskId1, validProjId)).rejects.toThrow(
        'Não foi possível calcular métricas para a tarefa',
      );
    });

    it('should list dependencies with mapped fields', async () => {
      const deps = await controller.getDependencies(validProjId);
      expect(deps.count).toBe(1);
      expect(deps.dependencies[0].id).toBe('dep1');
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

    it('should handle cycle clear when edge id is missing (fallback remove by key)', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([
        { taskId: validTaskId1, dependsOnTaskId: validTaskId2, isAutoIdentified: true },
        { taskId: validTaskId2, dependsOnTaskId: validTaskId1, isAutoIdentified: true },
      ]);

      const clear = await controller.clearDependencyCycle(validProjId, { mode: 'auto-only' } as any);
      expect(clear).toBeDefined();
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

    it('should return immediately when project has zero tasks in autoInferDependencies', async () => {
      mockTasksService.findByProjectId.mockResolvedValueOnce([]);
      const res = await controller.autoInferDependencies(validProjId, { strategy: 'none' } as any);
      expect(res.strategy).toBe('none');
      expect(res.dependenciesSuggested).toBe(0);
      expect(res.leafGroups).toBe(0);
    });

    it('should handle autoInferDependencies with within-leaf and interLeafStrategy none', async () => {
      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'within-leaf',
        includeInterLeafGates: false,
        interLeafStrategy: 'none',
        apply: false,
      } as any);

      expect(res.interLeafMode).toBe('none');
      expect(res.dependenciesSuggested).toBeGreaterThanOrEqual(0);
    });

    it('should handle autoInferDependencies with within-and-between-leafs', async () => {
      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'within-and-between-leafs',
        includeInterLeafGates: true,
        interLeafStrategy: 'heuristic',
        apply: true,
      } as any);

      expect(res.apply).toBe(true);
      expect(res.strategy).toBe('within-and-between-leafs');
    });

    it('should handle tasks with non-standard fields and no leaf group', async () => {
      mockTasksService.findByProjectId.mockResolvedValueOnce([
        {
          id: validTaskId1,
          title: 'Custom Title',
          estimatedMinutes: 30,
          checklist: ['step 1'],
          definitionOfDone: 'done',
        },
        {
          id: validTaskId2,
          name: '',
          pertExpectedMinutes: 45,
        },
      ]);

      mockDependencyInference.inferWithAi.mockResolvedValueOnce([
        { taskId: validTaskId1, dependsOnTaskId: validTaskId2 },
      ]);

      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: false,
      } as any);

      expect(res.leafGroups).toBe(1);
    });

    it('should handle non-Error rejection in leaf inference gracefully', async () => {
      mockDependencyInference.inferWithAi.mockRejectedValueOnce('String leaf failure');

      const res = await controller.autoInferDependencies(validProjId, {
        strategy: 'ai-per-leaf',
        apply: false,
      } as any);

      expect(res).toBeDefined();
    });

    it('should detect cycles in getDependencyCycle when cycles exist', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([
        { taskId: validTaskId1, dependsOnTaskId: validTaskId2 },
        { taskId: validTaskId2, dependsOnTaskId: validTaskId1 },
      ]);

      const cycle = await controller.getDependencyCycle(validProjId);
      expect(cycle.hasCycle).toBe(true);
      expect(cycle.cycleTaskIds.length).toBeGreaterThan(0);
    });

    it('should add dependency with explicit relationship and reason', async () => {
      const added = await controller.addDependency(validProjId, {
        taskId: validTaskId2,
        dependsOnTaskId: validTaskId1,
        relationship: 'FINISH_TO_FINISH' as any,
        reason: 'Sync finishes',
      });

      expect(added.id).toBe('dep1');
      expect(mockCpmService.addDependency).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship: 'FINISH_TO_FINISH',
          reason: 'Sync finishes',
        }),
      );
    });

    it('should handle critical path calculation with dependencies having unknown taskId or string error in buffer', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([
        { taskId: 'unknown-task-id', dependsOnTaskId: validTaskId1 },
        { taskId: '', dependsOnTaskId: validTaskId2 },
      ]);
      mockBufferService.calculateProjectBuffer.mockRejectedValueOnce('Non-error string rejection');

      const res = await controller.calculateCriticalPath(validProjId);
      expect(res.analysis).toBeDefined();
    });

    it('should return empty dependency list when getDependencies has no rows', async () => {
      mockCpmService.getDependencies.mockResolvedValueOnce([]);
      const deps = await controller.getDependencies(validProjId);
      expect(deps.count).toBe(0);
      expect(deps.dependencies).toEqual([]);
    });
  });
});
