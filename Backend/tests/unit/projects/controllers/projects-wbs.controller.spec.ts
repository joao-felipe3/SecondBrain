import { Types } from 'mongoose';
import { ProjectsWbsController } from '@src/projects/controllers/projects-wbs.controller';

describe('ProjectsWbsController', () => {
  let controller: ProjectsWbsController;
  let mockProjectsService: any;
  let mockWbsService: any;
  let mockValidation: any;
  let mockTaskConversionService: any;
  let mockAuditService: any;
  let mockTasksService: any;
  let mockLeafBuffer: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectsService = {
      findOne: jest.fn().mockResolvedValue({ _id: validProjId, name: 'Proj 1', deadline: new Date() }),
    };

    mockWbsService = {
      generateWBS: jest.fn().mockResolvedValue([{ name: 'Node 1', estimatedHours: 4 }]),
      saveWBS: jest.fn().mockResolvedValue([{ _id: 'n1' }]),
      getWBS: jest.fn().mockResolvedValue([{ name: 'Node 1' }]),
      getLeafNodesWithPaths: jest
        .fn()
        .mockReturnValue([{ node: { name: 'N1', estimatedHours: 2 }, path: 'N1' }]),
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

    controller = new ProjectsWbsController(
      mockProjectsService,
      mockWbsService,
      mockValidation,
      mockTaskConversionService,
      mockAuditService,
      mockTasksService,
      mockLeafBuffer,
    );
  });

  it('should generate, save, and retrieve WBS', async () => {
    const gen = await controller.generateWBS(validProjId, { weeklyHours: 20 } as any);
    expect(gen.nodes.length).toBe(1);

    const saved = await controller.saveWBS(validProjId, { nodes: [] });
    expect(saved.message).toBeDefined();

    const wbs = await controller.getWBS(validProjId);
    expect(wbs.nodes.length).toBe(1);
  });

  it('should convert WBS to tasks', async () => {
    const res = await controller.convertWBSToTasks(validProjId, { nodes: [] });
    expect(res.tasks.length).toBe(1);
  });

  it('should resolve budget and suggest decomposition', async () => {
    const res = await controller.resolveWBSBudget(validProjId, {
      budgetHours: 40,
      strategy: 'normalize',
      nodes: [],
    } as any);
    expect(res.resolved).toBe(true);

    const decomp = await controller.suggestDecomposition(validProjId, {} as any);
    expect(decomp.suggestion.length).toBe(1);
  });

  it('should get leaf nodes and generate tasks for leaf', async () => {
    const leaves = controller.getLeafNodes(validProjId, { nodes: [] });
    expect(leaves.total).toBe(1);

    const taskGen = await controller.generateTasksForLeaf(validProjId, {
      leafNode: { name: 'Leaf 1' },
      nodePath: 'Root > Leaf 1',
      saveTasks: true,
    } as any);

    expect(taskGen.message).toContain('criadas');
  });

  it('should audit leaf discrepancy', async () => {
    const audit = await controller.auditLeafDiscrepancy(validProjId, {} as any);
    expect(audit.diagnosis).toBe('ok');
  });
});
