import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProjectsService } from '@src/projects/projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockProjectModel: any;
  let mockTaskModel: any;
  let mockXMatrixService: any;
  let mockGanttService: any;
  let mockPertDiagramService: any;
  let mockProjectStatsService: any;

  const validProjId = new Types.ObjectId().toHexString();
  const validProjId2 = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: validProjId, ...dto }),
    }));

    mockProjectModel.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ _id: validProjId, name: 'Proj 1' }]),
    });
    mockProjectModel.findById = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: validProjId,
        name: 'Proj 1',
        totalHoursWorked: 10,
        plannedHours: 100,
        save: jest.fn().mockResolvedValue({ _id: validProjId, totalHoursWorked: 12 }),
      }),
    });
    mockProjectModel.findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validProjId }),
    });
    mockProjectModel.findByIdAndDelete = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validProjId }),
    });

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: 't1' }]),
      }),
      deleteMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      }),
      updateMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      }),
    };

    mockXMatrixService = {
      createXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
      getSavedXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
    };

    mockGanttService = {
      getGanttData: jest.fn().mockResolvedValue({ tasks: [] }),
    };

    mockPertDiagramService = {
      getPertDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    };

    mockProjectStatsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue({ _id: validProjId }),
    };

    service = new ProjectsService(
      mockProjectModel,
      mockTaskModel,
      mockXMatrixService,
      mockGanttService,
      mockPertDiagramService,
      mockProjectStatsService,
    );
  });

  describe('CRUD & visualization methods', () => {
    it('should create project', async () => {
      const proj = await service.create({ name: 'New Proj' });
      expect(proj._id).toBe(validProjId);
    });

    it('should find all and find one', async () => {
      const all = await service.findAll();
      expect(all.length).toBe(1);

      const one = await service.findOne(validProjId);
      expect(one).toBeDefined();
    });

    it('should throw BadRequestException on invalid ObjectId', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.update('invalid-id', {})).rejects.toThrow(BadRequestException);
      await expect(service.remove('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.getTasksForProject('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('should update and remove project', async () => {
      const updated = await service.update(validProjId, { name: 'Updated' });
      expect(updated).toBeDefined();

      const removed = await service.remove(validProjId);
      expect(removed).toBe(true);
    });

    it('should remove project with options (deleteTasks = true and false)', async () => {
      const resultDelete = await service.removeWithOptions(validProjId, true);
      expect(resultDelete.deleted).toBe(true);
      expect(mockTaskModel.deleteMany).toHaveBeenCalled();

      const resultUnset = await service.removeWithOptions(validProjId, false);
      expect(resultUnset.deleted).toBe(true);
      expect(mockTaskModel.updateMany).toHaveBeenCalled();
    });

    it('should handle project not found when removing with options', async () => {
      mockProjectModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.removeWithOptions(validProjId, true);
      expect(res.deleted).toBe(false);
      expect(res.tasksAffected).toBe(0);
    });

    it('should increment hours worked or throw if not found', async () => {
      const updated = await service.incrementHoursWorked(validProjId, 2);
      expect(updated).toBeDefined();

      mockProjectModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.incrementHoursWorked(validProjId, 2)).rejects.toThrow(NotFoundException);
    });

    it('should delegate XMatrix methods and tasks management', async () => {
      await service.createXMatrix(validProjId, {});
      expect(mockXMatrixService.createXMatrix).toHaveBeenCalled();

      await service.getSavedXMatrix(validProjId);
      expect(mockXMatrixService.getSavedXMatrix).toHaveBeenCalled();

      await service.getTasksForProject(validProjId);
      expect(mockTaskModel.find).toHaveBeenCalled();

      await service.moveTaskToProject('t1', validProjId, validProjId2);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalled();
    });

    it('should delegate visualization and stats methods', async () => {
      await service.getGanttData(validProjId);
      expect(mockGanttService.getGanttData).toHaveBeenCalled();

      await service.getPertDiagramData(validProjId);
      expect(mockPertDiagramService.getPertDiagramData).toHaveBeenCalled();

      await service.recalculateProjectStats(validProjId);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalled();
    });
  });
});
