import { Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectsWbsController } from '@src/projects/controllers/projects-wbs.controller';

describe('ProjectsWbsController', () => {
  let controller: ProjectsWbsController;
  let mockProjectsService: any;
  let mockWbsService: any;
  let mockValidation: any;
  let mockAuditService: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: validProjId,
        name: 'Proj 1',
        deadline: new Date('2026-06-01'),
        smartObjective: { weeklyHours: 20 },
      }),
    };

    mockWbsService = {
      generateWBS: jest.fn().mockResolvedValue([{ name: 'Node 1', estimatedHours: 4 }]),
      saveWBS: jest.fn().mockResolvedValue([{ _id: 'n1' }]),
      getWBS: jest.fn().mockResolvedValue([{ name: 'Node 1' }]),
      getLeafNodesWithPaths: jest
        .fn()
        .mockReturnValue([{ node: { name: 'N1', estimatedHours: 2 }, path: 'N1' }]),
      generateTasksForSingleLeaf: jest
        .fn()
        .mockResolvedValue({ tasks: [{ name: 'T1', pomodorosPlanned: 2 }] }),
    };

    mockValidation = {
      validateTree: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      validateBudget: jest.fn().mockReturnValue({ isWithinBudget: true }),
      normalizeTreeToBudget: jest.fn().mockReturnValue([{ name: 'Node 1' }]),
      suggestDecomposition: jest.fn().mockResolvedValue(['Subnode 1']),
    };

    mockAuditService = {
      auditLeafDiscrepancy: jest.fn().mockResolvedValue({ diagnosis: 'ok' }),
    };

    controller = new ProjectsWbsController(
      mockProjectsService,
      mockWbsService,
      mockValidation,
      mockAuditService,
    );
  });

  describe('generateWBS', () => {
    it('should throw NotFoundException if project does not exist', async () => {
      mockProjectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.generateWBS('invalid', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if weeklyHours is missing or <= 0', async () => {
      mockProjectsService.findOne.mockResolvedValueOnce({ _id: validProjId, smartObjective: {} });
      await expect(controller.generateWBS(validProjId, { weeklyHours: 0 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should parse ISO and BR dates and generate WBS', async () => {
      // ISO date
      const genIso = await controller.generateWBS(validProjId, {
        weeklyHours: 10,
        temporal: 'Prazo até 2026-10-15',
        budgetHours: 100,
      } as any);
      expect(genIso.nodes.length).toBe(1);

      // BR date
      const genBr = await controller.generateWBS(validProjId, {
        temporal: 'Prazo 15/10/2026',
      } as any);
      expect(genBr.nodes.length).toBe(1);

      // Fallback deadline
      mockProjectsService.findOne.mockResolvedValueOnce({
        _id: validProjId,
        deadline: null,
        smartObjective: { weeklyHours: 10 },
      });
      const genFallback = await controller.generateWBS(validProjId, {} as any);
      expect(genFallback.nodes.length).toBe(1);
    });
  });

  describe('saveWBS, getWBS, validateWBS', () => {
    it('should save and get WBS and handle not found', async () => {
      const saved = await controller.saveWBS(validProjId, { nodes: [] });
      expect(saved.message).toBeDefined();

      const wbs = await controller.getWBS(validProjId);
      expect(wbs.nodes.length).toBe(1);

      mockProjectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.saveWBS('inv', { nodes: [] })).rejects.toThrow(NotFoundException);

      mockProjectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.getWBS('inv')).rejects.toThrow(NotFoundException);
    });

    it('should validate WBS tree', () => {
      const res = controller.validateWBS(validProjId, { nodes: [] });
      expect(res).toBeDefined();
    });
  });

  describe('resolveWBSBudget & suggestDecomposition', () => {
    it('should throw NotFoundException or BadRequestException on invalid budgetHours', async () => {
      mockProjectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.resolveWBSBudget('inv', {} as any)).rejects.toThrow(NotFoundException);

      await expect(
        controller.resolveWBSBudget(validProjId, { budgetHours: 0, nodes: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle reject and normalize strategies', async () => {
      const resReject = await controller.resolveWBSBudget(validProjId, {
        budgetHours: 40,
        strategy: 'reject',
        nodes: [],
      } as any);
      expect(resReject.resolved).toBe(false);

      const resNormalize = await controller.resolveWBSBudget(validProjId, {
        budgetHours: 40,
        strategy: 'normalize',
        nodes: [],
      } as any);
      expect(resNormalize.resolved).toBe(true);
    });

    it('should suggest decomposition', async () => {
      const res = await controller.suggestDecomposition(validProjId, {} as any);
      expect(res.suggestion).toBeDefined();
    });
  });

  describe('auditLeafDiscrepancy', () => {
    it('should throw NotFoundException if project not found', async () => {
      mockProjectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.auditLeafDiscrepancy('inv', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should audit leaf discrepancy successfully', async () => {
      const res = await controller.auditLeafDiscrepancy(validProjId, {} as any);
      expect(res.diagnosis).toBe('ok');
    });
  });
});
