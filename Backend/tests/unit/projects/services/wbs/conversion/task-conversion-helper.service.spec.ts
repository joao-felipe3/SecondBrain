import { TaskConversionHelperService } from '@src/projects/services/wbs/conversion/task-conversion-helper.service';

describe('TaskConversionHelperService', () => {
  let service: TaskConversionHelperService;
  let mockAuditService: any;
  let mockDraftGenerationService: any;
  let mockCacheService: any;

  beforeEach(() => {
    mockAuditService = {
      auditLeafDiscrepancy: jest.fn().mockResolvedValue({
        suggestedAction: 'simplify',
        diagnosis: 'overestimated',
        suggestedEstimatedHours: 4,
      }),
    };

    mockDraftGenerationService = {
      generateMicroTasksDraftsForLeafWithPlan: jest.fn().mockResolvedValue([
        {
          name: 'Task 1',
          pomodorosPlanned: 2,
          priority: 2,
          difficult: 2,
          microTaskType: 'code',
          themeTag: 'tech',
          contextTag: 'dev',
          cognitiveMode: 'deep',
          checklist: ['step 1', 'step 2'],
          definitionOfDone: 'done',
        },
      ]),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new TaskConversionHelperService(
      mockAuditService,
      mockDraftGenerationService,
      mockCacheService,
    );
  });

  describe('generateTasksForLeafNode', () => {
    it('should return empty array if node has children (is not leaf)', async () => {
      const result = await service.generateTasksForLeafNode({
        node: { name: 'Parent', children: [{ name: 'Child' }] } as any,
        nodePath: 'Parent',
        projectId: 'p1',
      });

      expect(result).toEqual([]);
    });

    it('should generate tasks for leaf node', async () => {
      const result = await service.generateTasksForLeafNode({
        node: { name: 'Leaf 1', estimatedHours: 2 } as any,
        nodePath: 'Parent > Leaf 1',
        projectId: 'p1',
      });

      expect(result.length).toBe(1);
      expect(result[0].name).toContain('Task 1');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should use fallback tasks when draft generation throws error', async () => {
      mockDraftGenerationService.generateMicroTasksDraftsForLeafWithPlan.mockRejectedValueOnce(
        new Error('AI Failed'),
      );

      const result = await service.generateTasksForLeafNode({
        node: { name: 'Leaf Fallback', estimatedHours: 2 } as any,
        nodePath: 'Parent > Leaf Fallback',
        projectId: 'p1',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toContain('Leaf Fallback');
    });
  });

  describe('auditAndResolveLeafDiscrepancy', () => {
    it('should apply simplify fix when recommended by audit', async () => {
      const node: any = { _id: 'n1', name: 'Leaf Node', estimatedHours: 6 };
      const result: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node,
        nodePath: 'path',
        leafTaskDtos: [{ name: 'T1', pomodorosPlanned: 4 }] as any,
        budgetHours: 6,
        generatedHoursBefore: 2,
        result,
      });

      expect(result.auditsApplied.length).toBe(1);
      expect(result.auditsApplied[0].appliedAction).toBe('simplify');
    });

    it('should apply rebaseline fix when recommended by audit', async () => {
      mockAuditService.auditLeafDiscrepancy.mockResolvedValueOnce({
        suggestedAction: 'rebaseline',
        diagnosis: 'underestimated',
        suggestedEstimatedHours: 10,
      });

      const node: any = { _id: 'n1', name: 'Leaf Node', estimatedHours: 4 };
      const result: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node,
        nodePath: 'path',
        leafTaskDtos: [{ name: 'T1', pomodorosPlanned: 8 }] as any,
        budgetHours: 4,
        generatedHoursBefore: 8,
        result,
      });

      expect(result.auditsApplied[0].appliedAction).toBe('rebaseline');
      expect(node.estimatedHours).toBe(10);
    });
  });

  describe('createAndSaveLeaveTasks', () => {
    it('should batch create tasks when createMany is available', async () => {
      const mockTasksService: any = {
        createMany: jest.fn().mockResolvedValue([{ _id: 't1' }, { _id: 't2' }]),
      };
      const result: any = { createdTasks: [] };

      await service.createAndSaveLeaveTasks({
        leafTaskDtos: [{ name: 'T1' }, { name: 'T2' }] as any,
        tasksService: mockTasksService,
        nodePath: 'path',
        result,
      });

      expect(result.createdTasks.length).toBe(2);
      expect(mockTasksService.createMany).toHaveBeenCalled();
    });
  });
});
