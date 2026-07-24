import { WbsConversionOrchestrationService } from '@src/projects/services/wbs/conversion/wbs-conversion-orchestrator.service';

describe('WbsConversionOrchestrationService', () => {
  let service: WbsConversionOrchestrationService;
  let mockConfigService: any;
  let mockDraftGenerationService: any;
  let mockDraftProcessingService: any;
  let mockTaskConversionService: any;

  beforeEach(() => {
    mockConfigService = {
      getNowIso: jest.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
      logIfTimingDebug: jest.fn(),
      isVerboseTaskLogsEnabled: jest.fn().mockReturnValue(true),
    };
    mockDraftGenerationService = {
      generateMicroTasksPlanForLeaf: jest.fn().mockResolvedValue({ focus: 'Test plan' }),
      generateMicroTasksDraftsForLeafWithPlan: jest
        .fn()
        .mockResolvedValue([{ title: 'Draft 1', pomodorosPlanned: 2 }]),
      generateMicroTasksDraftsForLeaf: jest.fn().mockResolvedValue([{ title: 'Draft 2' }]),
    };
    mockDraftProcessingService = {
      applyThemeWorkflowAndProgression: jest.fn((drafts) => drafts),
      applyGoldilocksAndMilestones: jest.fn((drafts) => drafts),
    };
    mockTaskConversionService = {
      convertDraftsToTasks: jest
        .fn()
        .mockResolvedValue([{ title: 'Task 1', pomodorosPlanned: 2 }]),
    };

    service = new WbsConversionOrchestrationService(
      mockConfigService,
      mockDraftGenerationService,
      mockDraftProcessingService,
      mockTaskConversionService,
    );
  });

  describe('convertWbsToTasks', () => {
    it('should successfully convert WBS node to tasks using two-phase strategy', async () => {
      const node: any = { _id: 'n1', name: 'Node 1', estimatedHours: 2 };
      const project: any = { id: 'p1', name: 'Proj 1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'root > Node 1',
        options: { strategy: 'two-phase', autoAudit: true, logVerbose: true },
      });

      expect(result.success).toBe(true);
      expect(result.tasks.length).toBe(1);
      expect(result.metadata.draftCount).toBe(1);
      expect(mockDraftGenerationService.generateMicroTasksPlanForLeaf).toHaveBeenCalled();
    });

    it('should convert using legacy strategy when specified', async () => {
      const node: any = { _id: 'n1', name: 'Node 1', estimatedHours: 2 };
      const project: any = { id: 'p1', name: 'Proj 1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'root > Node 1',
        options: { strategy: 'legacy' },
      });

      expect(result.success).toBe(true);
      expect(mockDraftGenerationService.generateMicroTasksDraftsForLeaf).toHaveBeenCalled();
    });

    it('should handle stage1 draft generation errors gracefully', async () => {
      mockDraftGenerationService.generateMicroTasksPlanForLeaf.mockRejectedValueOnce(
        new Error('Draft AI failure'),
      );

      const node: any = { _id: 'n1', name: 'Node 1' };
      const project: any = { id: 'p1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'path',
        options: { throwOnError: false },
      });

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('draft-generation');
      expect(result.error?.message).toBe('Draft AI failure');
    });

    it('should set error on result when stage1 fails with throwOnError', async () => {
      mockDraftGenerationService.generateMicroTasksPlanForLeaf.mockRejectedValueOnce(
        new Error('Draft AI failure'),
      );

      const node: any = { _id: 'n1', name: 'Node 1' };
      const project: any = { id: 'p1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'path',
        options: { throwOnError: true },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Draft AI failure');
    });

    it('should handle stage2 draft processing errors gracefully', async () => {
      mockDraftProcessingService.applyThemeWorkflowAndProgression.mockImplementationOnce(() => {
        throw new Error('Processing failure');
      });

      const node: any = { _id: 'n1', name: 'Node 1' };
      const project: any = { id: 'p1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'path',
        options: { throwOnError: false },
      });

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('draft-processing');
    });

    it('should handle stage3 task conversion errors gracefully', async () => {
      mockTaskConversionService.convertDraftsToTasks.mockRejectedValueOnce(
        new Error('Task conversion failure'),
      );

      const node: any = { _id: 'n1', name: 'Node 1' };
      const project: any = { id: 'p1' };

      const result = await service.convertWbsToTasks({
        node,
        project,
        path: 'path',
        options: { throwOnError: false },
      });

      expect(result.success).toBe(false);
      expect(result.error?.stage).toBe('task-conversion');
    });
  });

  describe('generateTasksForSingleLeaf', () => {
    it('should orchestrate single leaf conversion and save tasks when requested via createMany', async () => {
      const mockTasksService: any = {
        createMany: jest
          .fn()
          .mockResolvedValue([{ title: 'Persisted Task', pomodorosPlanned: 4 }]),
      };

      const leafNode: any = { _id: 'leaf1', name: 'Leaf 1', estimatedHours: 2 };

      const res = await service.generateTasksForSingleLeaf({
        leafNode,
        nodePath: 'path',
        projectId: 'proj123',
        project: {},
        tasksService: mockTasksService,
        saveTasks: true,
      });

      expect(res.tasks.length).toBe(1);
      expect(res.pomodorosGenerated).toBe(4);
      expect(res.generatedHours).toBe(2);
      expect(mockTasksService.createMany).toHaveBeenCalled();
    });

    it('should save tasks using single create fallback when createMany is missing', async () => {
      const mockTasksService: any = {
        create: jest.fn().mockResolvedValue({ title: 'Single Created Task', pomodorosPlanned: 2 }),
      };

      const leafNode: any = { _id: 'leaf1', name: 'Leaf 1', estimatedHours: 2 };

      const res = await service.generateTasksForSingleLeaf({
        leafNode,
        nodePath: 'path',
        projectId: 'proj123',
        project: {},
        tasksService: mockTasksService,
        saveTasks: true,
      });

      expect(res.tasks.length).toBe(1);
      expect(mockTasksService.create).toHaveBeenCalled();
    });

    it('should throw when single leaf conversion fails with error', async () => {
      mockDraftGenerationService.generateMicroTasksPlanForLeaf.mockRejectedValueOnce(
        new Error('Leaf conversion exception'),
      );

      const leafNode: any = { _id: 'leaf1', name: 'Leaf 1' };
      const mockTasksService: any = {};

      await expect(
        service.generateTasksForSingleLeaf({
          leafNode,
          nodePath: 'path',
          projectId: 'proj123',
          project: {},
          tasksService: mockTasksService,
          saveTasks: false,
        }),
      ).rejects.toThrow('Leaf conversion exception');
    });
  });
});
