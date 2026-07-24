import { DependencyInferenceService } from '@src/tasks/services/dependencies/dependency-inference.service';

describe('DependencyInferenceService', () => {
  let service: DependencyInferenceService;
  let mockGeminiService: any;

  beforeEach(() => {
    mockGeminiService = {
      inferDependencies: jest
        .fn()
        .mockResolvedValue([{ taskId: 't2', dependsOnTaskId: 't1', relationship: 'FINISH_TO_START' }]),
    };

    service = new DependencyInferenceService(mockGeminiService);
  });

  it('should infer heuristic phases for task sequence', () => {
    const tasks = [
      { id: 't1', name: 'Task 1', order: 1 },
      { id: 't2', name: 'Task 2', order: 2 },
    ];

    const deps = service.inferHeuristicPhases(tasks as any);
    expect(deps.length).toBe(1);
    expect(deps[0].taskId).toBe('t2');
    expect(deps[0].dependsOnTaskId).toBe('t1');
  });

  it('should infer dependencies with AI for tasks', async () => {
    const tasks = [
      { id: 't1', name: 'Design' },
      { id: 't2', name: 'Implementation' },
    ];

    const deps = await service.inferWithAi({ tasks } as any);
    expect(deps.length).toBe(1);
    expect(mockGeminiService.inferDependencies).toHaveBeenCalled();
  });

  it('should return empty array if less than 2 tasks provided to inferWithAi', async () => {
    const deps = await service.inferWithAi({ tasks: [{ id: 't1', name: 'Task 1' }] } as any);
    expect(deps).toEqual([]);
  });

  it('should infer inter-leaf dependencies with AI', async () => {
    mockGeminiService.inferDependencies.mockResolvedValueOnce([
      { taskId: 'g1_start', dependsOnTaskId: 'g2_end', relationship: 'FINISH_TO_START' },
    ]);

    const leaves = [
      { leafId: 'l1', leafName: 'L1', startGateId: 'g1_start', endGateId: 'g1_end' },
      { leafId: 'l2', leafName: 'L2', startGateId: 'g2_start', endGateId: 'g2_end' },
    ];

    const deps = await service.inferInterLeafWithAi({ projectId: 'p1', leaves } as any);
    expect(deps.length).toBe(1);
    expect(deps[0].taskId).toBe('g1_start');
    expect(deps[0].dependsOnTaskId).toBe('g2_end');
  });
});
