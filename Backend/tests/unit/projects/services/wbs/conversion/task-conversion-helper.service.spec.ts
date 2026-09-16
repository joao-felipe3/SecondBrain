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

    it('should fallback to individual create when createMany is not available', async () => {
      const mockTasksService: any = {
        create: jest
          .fn()
          .mockResolvedValueOnce({ _id: 't1', name: 'T1' })
          .mockRejectedValueOnce(new Error('Insert error')),
      };
      const result: any = { createdTasks: [] };

      await service.createAndSaveLeaveTasks({
        leafTaskDtos: [{ name: 'T1' }, { name: 'T2' }] as any,
        tasksService: mockTasksService,
        nodePath: 'path',
        result,
      });

      expect(result.createdTasks.length).toBe(1);
      expect(mockTasksService.create).toHaveBeenCalledTimes(2);
    });

    it('should handle outer catch when createMany throws an exception', async () => {
      const mockTasksService: any = {
        createMany: jest.fn().mockRejectedValueOnce(new Error('Bulk insert failed')),
      };
      const result: any = { createdTasks: [] };

      await service.createAndSaveLeaveTasks({
        leafTaskDtos: [{ name: 'T1' }] as any,
        tasksService: mockTasksService,
        nodePath: 'path',
        result,
      });

      expect(result.createdTasks.length).toBe(0);
    });
  });

  describe('additional branch coverage for edge cases', () => {
    it('should use cached drafts when cache returns valid array', async () => {
      const cachedDrafts = [
        {
          name: 'Cached Task',
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
      ];
      mockCacheService.get.mockResolvedValueOnce(cachedDrafts);

      const result = await service.generateTasksForLeafNode({
        node: { name: 'Leaf Cached', estimatedHours: 2 } as any,
        nodePath: 'Parent > Leaf Cached',
        projectId: 'p1',
      });

      expect(result.length).toBe(1);
      expect(result[0].name).toContain('Cached Task');
      expect(mockDraftGenerationService.generateMicroTasksDraftsForLeafWithPlan).not.toHaveBeenCalled();
    });

    it('should handle string error in generateTasksForLeafNode fallback', async () => {
      mockDraftGenerationService.generateMicroTasksDraftsForLeafWithPlan.mockRejectedValueOnce(
        'AI String Error',
      );

      const result = await service.generateTasksForLeafNode({
        node: { name: 'Leaf String Err', estimatedHours: 2 } as any,
        nodePath: 'Parent > Leaf String Err',
        projectId: 'p1',
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle audit action none when audit suggests no changes', async () => {
      mockAuditService.auditLeafDiscrepancy.mockResolvedValueOnce({
        suggestedAction: 'none',
        diagnosis: 'balanced',
        suggestedEstimatedHours: 0,
      });

      const node: any = { name: 'Balanced Node', estimatedHours: 4 }; // no _id to test nodeId = undefined
      const result: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node,
        nodePath: 'path',
        leafTaskDtos: [
          { name: 'T1', pomodorosPlanned: 4, themeTag: ['frontend'] }, // array themeTag and missing priority
        ] as any,
        budgetHours: 4,
        generatedHoursBefore: 4,
        result,
      });

      expect(result.auditsApplied.length).toBe(1);
      expect(result.auditsApplied[0].appliedAction).toBe('none');
    });

    it('should handle simplify and rebaseline fixes without suggested hours or without nodeId', async () => {
      // Simplify without suggested hours
      mockAuditService.auditLeafDiscrepancy.mockResolvedValueOnce({
        suggestedAction: 'simplify',
        diagnosis: 'too big',
        suggestedEstimatedHours: undefined, // hasSuggestedHours = false
      });

      const node1: any = { name: 'Node No ID', estimatedHours: 6 };
      const result1: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node: node1,
        nodePath: 'path',
        leafTaskDtos: [{ name: 'T1', pomodorosPlanned: 6 }] as any,
        budgetHours: 4,
        generatedHoursBefore: 6,
        result: result1,
      });

      expect(result1.auditsApplied[0].appliedAction).toBe('simplify');
      expect(result1.wbsUpdates.length).toBe(0); // no nodeId -> no wbsUpdates push

      // Rebaseline without suggested hours
      mockAuditService.auditLeafDiscrepancy.mockResolvedValueOnce({
        suggestedAction: 'rebaseline',
        diagnosis: 'too small',
        suggestedEstimatedHours: undefined, // hasSuggestedHours = false
      });

      const node2: any = { name: 'Node 2 No ID', estimatedHours: 2 };
      const result2: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node: node2,
        nodePath: 'path',
        leafTaskDtos: [{ name: 'T1', pomodorosPlanned: 4 }] as any,
        budgetHours: 2,
        generatedHoursBefore: 4,
        result: result2,
      });

      expect(result2.auditsApplied[0].appliedAction).toBe('rebaseline');
    });

    it('should handle exception during auditAndResolveLeafDiscrepancy gracefully', async () => {
      mockAuditService.auditLeafDiscrepancy.mockRejectedValueOnce('Audit string crash');

      const node: any = { name: 'Crashing Node' };
      const result: any = { auditsApplied: [], wbsUpdates: [] };

      await service.auditAndResolveLeafDiscrepancy({
        node,
        nodePath: 'path',
        leafTaskDtos: [] as any,
        budgetHours: 2,
        generatedHoursBefore: 2,
        result,
      });

      expect(result.auditsApplied.length).toBe(0);
    });
  });
});
