import { EVMProgressService } from '../../../../src/projects/services/evm/evm-progress.service';
import { ProjectProgressDocument } from '../../../../src/projects/schemas/project-progress.schema';
import { ProjectDocument } from '../../../../src/projects/schemas/project.schema';
import { Model, Types } from 'mongoose';

describe('EVMProgressService', () => {
  let service: EVMProgressService;
  let mockProgressModel: {
    create: jest.Mock;
    find: jest.Mock;
    deleteOne: jest.Mock;
  };
  let mockProjectModel: {
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  beforeEach(() => {
    mockProgressModel = {
      create: jest.fn(),
      find: jest.fn(),
      deleteOne: jest.fn(),
    };
    mockProjectModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    service = new EVMProgressService(
      mockProgressModel as unknown as Model<ProjectProgressDocument>,
      mockProjectModel as unknown as Model<ProjectDocument>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recordProgress', () => {
    it('should create progress entries successfully', async () => {
      const projectId = new Types.ObjectId().toString();
      const mockResult = { _id: 'progress1', projectId };
      mockProgressModel.create.mockResolvedValue(mockResult);

      const result = await service.recordProgress({ projectId, completedHours: 10, plannedValue: 20 });

      expect(mockProgressModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          completedHours: 10,
          plannedValue: 20,
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw BadRequestException if projectId is invalid', async () => {
      await expect(
        service.recordProgress({ projectId: 'invalid', completedHours: 10, plannedValue: 20 }),
      ).rejects.toThrow(/projectId invalido/);
    });
  });

  describe('getProgressEntries', () => {
    it('should query and sort entries by date and createdAt', async () => {
      const projectId = new Types.ObjectId().toString();
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: '1' }]),
      };
      mockProgressModel.find.mockReturnValue(mockChain);

      const result = await service.getProgressEntries(projectId);

      expect(mockProgressModel.find).toHaveBeenCalledWith({
        projectId: new Types.ObjectId(projectId),
      });
      expect(mockChain.sort).toHaveBeenCalledWith({ date: 1, createdAt: 1 });
      expect(result).toEqual([{ _id: '1' }]);
    });
  });

  describe('deleteProgressEntry', () => {
    it('should delete and return true if deleteCount > 0', async () => {
      const projectId = new Types.ObjectId().toString();
      const entryId = new Types.ObjectId().toString();
      const mockChain = {
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      };
      mockProgressModel.deleteOne.mockReturnValue(mockChain);

      const result = await service.deleteProgressEntry(projectId, entryId);

      expect(mockProgressModel.deleteOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(entryId),
        projectId: new Types.ObjectId(projectId),
      });
      expect(result).toBe(true);
    });

    it('should return false if deleteCount is 0', async () => {
      const projectId = new Types.ObjectId().toString();
      const entryId = new Types.ObjectId().toString();
      const mockChain = {
        exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      };
      mockProgressModel.deleteOne.mockReturnValue(mockChain);

      const result = await service.deleteProgressEntry(projectId, entryId);
      expect(result).toBe(false);
    });
  });

  describe('getDashboardPreferences', () => {
    it('should return default preferences if project has none', async () => {
      const projectId = new Types.ObjectId().toString();
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };
      mockProjectModel.findById.mockReturnValue(mockChain);

      const result = await service.getDashboardPreferences(projectId);

      expect(result.mode).toBe('auto');
      expect(result.manualVisibility.spi).toBe(true);
    });
  });
});
