import { Types } from 'mongoose';
import { RTMCrudService } from '@src/tasks/services/traceability/rtm-crud.service';

describe('RTMCrudService', () => {
  let service: RTMCrudService;
  let mockRequirementModel: any;

  const validReqId = new Types.ObjectId().toHexString();
  const validTaskId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockRequirementModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: validReqId,
            projectId: 'p1',
            title: 'Req 1',
            kind: 'feature',
            type: 'functional',
            hierarchyLevel: 1,
            source: 'manual',
            status: 'open',
            traceableActionItems: [],
            traceableItems: [],
          },
        ]),
      }),
      create: jest.fn().mockImplementation((doc) =>
        Promise.resolve({
          _id: validReqId,
          ...doc,
        }),
      ),
      findByIdAndDelete: jest.fn().mockResolvedValue({ _id: validReqId }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        _id: validReqId,
        projectId: 'p1',
        title: 'Req 1',
        status: 'satisfied',
        traceableActionItems: [validTaskId],
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({
        _id: validReqId,
        projectId: 'p1',
        title: 'Req 1',
        status: 'open',
        traceableActionItems: [],
        save: jest.fn().mockResolvedValue(true),
      }),
    };

    service = new RTMCrudService(mockRequirementModel as any);
  });

  describe('getRequirements & saveRequirements', () => {
    it('should retrieve requirements for project', async () => {
      const result = await service.getRequirements('p1');
      expect(result.length).toBe(1);
    });

    it('should save prepared requirements array', async () => {
      const items: any[] = [
        {
          ref: 'R1',
          description: 'User Login',
          kind: 'feature',
          type: 'functional',
          source: 'manual',
        },
      ];

      const saved = await service.saveRequirements('p1', items);
      expect(saved.length).toBe(1);
    });
  });

  describe('deleteRequirement & deleteAllRequirements', () => {
    it('should delete requirement by ID', async () => {
      const deleted = await service.deleteRequirement(validReqId);
      expect(deleted).toBe(true);
    });

    it('should delete all requirements for project', async () => {
      const count = await service.deleteAllRequirements('p1');
      expect(count).toBe(2);
    });
  });

  describe('mapRequirementToTask & unmapRequirementFromTask', () => {
    it('should map requirement to task', async () => {
      const mapped = await service.mapRequirementToTask({
        projectId: 'p1',
        requirementId: validReqId,
        taskId: validTaskId,
      });

      expect(mapped).not.toBeNull();
    });

    it('should unmap requirement from task', async () => {
      const unmapped = await service.unmapRequirementFromTask(validReqId, validTaskId);
      expect(unmapped).not.toBeNull();
    });
  });
});
