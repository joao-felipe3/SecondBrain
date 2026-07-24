import { Types } from 'mongoose';
import { ProjectsController } from '@src/projects/projects.controller';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let mockProjectsService: any;
  let mockPlanningService: any;
  let mockWbsService: any;
  let mockValidation: any;
  let mockTaskConversionService: any;
  let mockAuditService: any;
  let mockTasksService: any;
  let mockLeafBuffer: any;
  let mockTaskModel: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectsService = {
      findOne: jest.fn().mockResolvedValue({ _id: validProjId, name: 'Proj 1', deadline: new Date() }),
      findAll: jest.fn().mockResolvedValue([{ _id: validProjId, name: 'Proj 1' }]),
      create: jest.fn().mockResolvedValue({ _id: validProjId }),
      update: jest.fn().mockResolvedValue({ _id: validProjId }),
      remove: jest.fn().mockResolvedValue(true),
      removeWithOptions: jest.fn().mockResolvedValue({ deleted: true, tasksAffected: 3 }),
      getGanttData: jest.fn().mockResolvedValue({ tasks: [] }),
      getPertDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      createXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
      getSavedXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
      getTasksForProject: jest.fn().mockResolvedValue([]),
      incrementHoursWorked: jest.fn().mockResolvedValue({ _id: validProjId }),
      recalculateProjectStats: jest.fn().mockResolvedValue({ _id: validProjId }),
    };

    mockPlanningService = {
      startCatchball: jest.fn().mockResolvedValue({ questions: [] }),
      suggestAnswer: jest.fn().mockResolvedValue('Suggested'),
      generateSmartObjective: jest.fn().mockResolvedValue({ specific: 'Build' }),
    };

    mockWbsService = {
      generateWBS: jest.fn().mockResolvedValue([{ name: 'Node 1', estimatedHours: 4 }]),
      saveWBS: jest.fn().mockResolvedValue([{ _id: 'n1' }]),
      getWBS: jest.fn().mockResolvedValue([{ name: 'Node 1' }]),
      getLeafNodesWithPaths: jest.fn().mockReturnValue([{ node: { name: 'N1', estimatedHours: 2 }, path: 'N1' }]),
      generateTasksForSingleLeaf: jest.fn().mockResolvedValue({ tasks: [{ name: 'T1' }] }),
    };

    mockValidation = {
      validateTree: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      validateBudget: jest.fn().mockReturnValue({ isWithinBudget: true }),
      normalizeTreeToBudget: jest.fn().mockReturnValue([{ name: 'Node 1' }]),
      suggestDecomposition: jest.fn().mockResolvedValue(['Subnode 1']),
    };

    mockTaskConversionService = {
      convertWBSToTasksWithAI: jest.fn().mockResolvedValue({
        createdTasks: [{ name: 'T1', pomodorosPlanned: 2 }],
        wbsUpdates: [],
        auditsApplied: [],
      }),
    };

    mockAuditService = {
      auditLeafDiscrepancy: jest.fn().mockResolvedValue({ diagnosis: 'ok' }),
    };

    mockTasksService = {};

    mockLeafBuffer = {
      prefetch: jest.fn(),
      consume: jest.fn().mockResolvedValue(null),
    };

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ name: 'MicroTask 1' }]),
        }),
      }),
    };

    controller = new ProjectsController(
      mockProjectsService,
      mockPlanningService,
      mockWbsService,
      mockValidation,
      mockTaskConversionService,
      mockAuditService,
      mockTasksService as any,
      mockLeafBuffer,
      mockTaskModel as any,
    );
  });

  describe('CRUD & planning endpoints', () => {
    it('should list projects and find one', async () => {
      const all = await controller.findAll();
      expect(all.length).toBe(1);

      const one = await controller.findOne(validProjId);
      expect(one).toBeDefined();
    });

    it('should handle project planning with Catchball', async () => {
      const plan = await controller.planProjectWithAI(validProjId, {} as any);
      expect(plan).toBeDefined();

      const answer = await controller.suggestAnswer(validProjId, {} as any);
      expect(answer.suggestedAnswer).toBe('Suggested');

      const obj = await controller.refineObjective(validProjId, {} as any);
      expect(obj.nextPhase).toBe('wbs-generation');
    });

    it('should generate WBS and save WBS', async () => {
      const wbs = await controller.generateWBS(validProjId, { weeklyHours: 20 } as any);
      expect(wbs.nodes.length).toBe(1);

      const saved = await controller.saveWBS(validProjId, { nodes: [] } as any);
      expect(saved.message).toBeDefined();
    });

    it('should convert WBS to tasks', async () => {
      const res = await controller.convertWBSToTasks(validProjId, { nodes: [] } as any);
      expect(res.tasks.length).toBe(1);
    });

    it('should remove project with deleteTasks query param', async () => {
      const res = await controller.remove(validProjId, 'true');
      expect(res.tasksDeleted).toBe(true);
      expect(mockProjectsService.removeWithOptions).toHaveBeenCalledWith(validProjId, true);
    });

    it('should return gantt and pert diagram data', async () => {
      const gantt = await controller.getGanttData(validProjId, 'true');
      expect(gantt).toBeDefined();

      const pert = await controller.getPertDiagramData(validProjId, 'true');
      expect(pert).toBeDefined();
    });

    it('should handle X-Matrix generation and lookup', async () => {
      const created = await controller.createXMatrix(validProjId, {} as any);
      expect(created.projectId).toBe(validProjId);

      const fetched = await controller.getSavedXMatrix(validProjId);
      expect(fetched?.projectId).toBe(validProjId);
    });

    it('should resolve WBS budget and suggest decomposition', async () => {
      const res = await controller.resolveWBSBudget(validProjId, { budgetHours: 40, strategy: 'normalize', nodes: [] } as any);
      expect(res.resolved).toBe(true);

      const decomp = await controller.suggestDecomposition(validProjId, {} as any);
      expect(decomp.suggestion.length).toBe(1);
    });

    it('should get leaf nodes and generate tasks for leaf', async () => {
      const leaves = controller.getLeafNodes(validProjId, { nodes: [] } as any);
      expect(leaves.total).toBe(1);

      const taskGen = await controller.generateTasksForLeaf(validProjId, {
        leafNode: { name: 'Leaf 1' },
        nodePath: 'Root > Leaf 1',
        saveTasks: true,
      } as any);

      expect(taskGen.message).toContain('criadas');
    });

    it('should audit leaf discrepancy and recalculate stats', async () => {
      const audit = await controller.auditLeafDiscrepancy(validProjId, {} as any);
      expect(audit.diagnosis).toBe('ok');

      const recalc = await controller.recalculateStats(validProjId);
      expect(recalc._id).toBe(validProjId);

      const recalcAll = await controller.recalculateAllStats();
      expect(recalcAll.count).toBe(1);
    });

    it('should fetch tasks and micro-tasks for project', async () => {
      const tasks = await controller.getTasksForProject(validProjId);
      expect(tasks).toBeDefined();

      const micro = await controller.getMicroTasks(validProjId, 'TODO');
      expect(micro.length).toBe(1);
    });
  });
});
