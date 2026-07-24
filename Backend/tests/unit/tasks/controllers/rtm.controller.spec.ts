import { Types } from 'mongoose';
import { RTMController } from '@src/tasks/controllers/rtm.controller';

describe('RTMController', () => {
  let controller: RTMController;
  let mockRtmService: any;
  let mockTasksService: any;

  const validProjId = new Types.ObjectId().toHexString();
  const validReqId = new Types.ObjectId().toHexString();
  const validTaskId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockRtmService = {
      generateRequirements: jest.fn().mockResolvedValue([{ description: 'Req 1', type: 'FUNCTIONAL', kind: 'action', ref: 'R1' }]),
      saveRequirements: jest.fn().mockResolvedValue([{ id: validReqId, description: 'Req 1', kind: 'action', hierarchyLevel: 1, status: 'UNMAPPED' }]),
      validateRTM: jest.fn().mockResolvedValue({ isValid: true, coverage: 100, unmappedRequirements: [], risks: [] }),
      getRTMMatrix: jest.fn().mockResolvedValue({
        requirements: [{ id: validReqId }],
        tasks: [{ id: validTaskId }],
        matrix: new Map([[validReqId, new Set([validTaskId])]]),
        validation: { isValid: true, coverage: 100 },
      }),
      mapRequirementToTask: jest.fn().mockResolvedValue({ id: validReqId, description: 'Req 1', kind: 'action', hierarchyLevel: 1, status: 'MAPPED' }),
      unmapRequirementFromTask: jest.fn().mockResolvedValue({ id: validReqId, description: 'Req 1', kind: 'action', hierarchyLevel: 1, status: 'UNMAPPED' }),
      deleteRequirement: jest.fn().mockResolvedValue(true),
      deleteAllRequirements: jest.fn().mockResolvedValue(3),
      getRequirements: jest.fn().mockResolvedValue([{ id: validReqId, description: 'Req 1' }]),
      autoMapRequirementsToTasks: jest.fn().mockResolvedValue({ success: true, mappedCount: 2, createdRequirementsCount: 0, coverage: 100 }),
      generateTasksForUnmappedRequirements: jest.fn().mockResolvedValue({ success: true, createdTasksCount: 1, coverage: 100 }),
    };

    mockTasksService = {
      findByProjectId: jest.fn().mockResolvedValue([{ _id: validTaskId, name: 'Task 1' }]),
    };

    controller = new RTMController(mockRtmService, mockTasksService);
  });

  describe('Requirements & RTM Matrix endpoints', () => {
    it('should auto-generate requirements from SMART objective', async () => {
      const res = await controller.autoGenerateRequirements(validProjId, { smartObjective: { specific: 'Build' } });
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
    });

    it('should handle auto-generate requirements returning empty list', async () => {
      mockRtmService.generateRequirements.mockResolvedValueOnce([]);
      const res = await controller.autoGenerateRequirements(validProjId, { smartObjective: {} });
      expect(res.success).toBe(false);
    });

    it('should handle auto-generate requirements error', async () => {
      mockRtmService.generateRequirements.mockRejectedValueOnce(new Error('AI generation failed'));
      const res = await controller.autoGenerateRequirements(validProjId, { smartObjective: {} });
      expect(res.success).toBe(false);
      expect(res.error).toBe('AI generation failed');
    });

    it('should get RTM matrix', async () => {
      const matrix = await controller.getRTMMatrix(validProjId);
      expect(matrix.success).toBe(true);
      expect(matrix.requirements?.length).toBe(1);
    });

    it('should handle get RTM matrix error', async () => {
      mockRtmService.getRTMMatrix.mockRejectedValueOnce(new Error('Matrix failed'));
      const res = await controller.getRTMMatrix(validProjId);
      expect(res.success).toBe(false);
    });

    it('should map and unmap requirement to task', async () => {
      const mapped = await controller.mapRequirementToTask(validProjId, { requirementId: validReqId, taskId: validTaskId });
      expect(mapped.success).toBe(true);

      const unmapped = await controller.unmapRequirementFromTask(validProjId, { requirementId: validReqId, taskId: validTaskId });
      expect(unmapped.success).toBe(true);
    });

    it('should handle requirement not found during mapping or unmapping', async () => {
      mockRtmService.mapRequirementToTask.mockResolvedValueOnce(null);
      const mapped = await controller.mapRequirementToTask(validProjId, { requirementId: 'invalid', taskId: validTaskId });
      expect(mapped.success).toBe(false);

      mockRtmService.unmapRequirementFromTask.mockResolvedValueOnce(null);
      const unmapped = await controller.unmapRequirementFromTask(validProjId, { requirementId: 'invalid', taskId: validTaskId });
      expect(unmapped.success).toBe(false);
    });

    it('should handle error during mapping or unmapping', async () => {
      mockRtmService.mapRequirementToTask.mockRejectedValueOnce(new Error('Map err'));
      const mapped = await controller.mapRequirementToTask(validProjId, { requirementId: validReqId, taskId: validTaskId });
      expect(mapped.success).toBe(false);
    });

    it('should list and delete requirements', async () => {
      const list = await controller.getRequirements(validProjId);
      expect(list.success).toBe(true);

      const del = await controller.deleteRequirement(validReqId);
      expect(del.success).toBe(true);

      const delAll = await controller.deleteAllRequirements(validProjId);
      expect(delAll.count).toBe(3);
    });

    it('should handle delete requirement not found or error', async () => {
      mockRtmService.deleteRequirement.mockResolvedValueOnce(false);
      const del = await controller.deleteRequirement('invalid-id');
      expect(del.success).toBe(false);
    });

    it('should auto-map requirements and generate tasks for unmapped', async () => {
      const autoMap = await controller.autoMapRequirementsToTasks(validProjId);
      expect(autoMap.success).toBe(true);

      const genTasks = await controller.generateTasksForUnmappedRequirements(validProjId);
      expect(genTasks.success).toBe(true);
    });

    it('should handle auto-map when no tasks exist in project', async () => {
      mockTasksService.findByProjectId.mockResolvedValueOnce([]);
      const autoMap = await controller.autoMapRequirementsToTasks(validProjId);
      expect(autoMap.success).toBe(false);
    });
  });
});
