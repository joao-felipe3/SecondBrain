import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { RollingWaveService } from '../../../../../src/projects/services/strategy/rolling-wave.service';
import { ProjectWave } from '../../../../../src/projects/schemas/project-wave.schema';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { RollingWavePlanningService } from '../../../../../src/projects/services/strategy/rolling-wave-planning.service';

describe('RollingWaveService', () => {
  let service: RollingWaveService;
  let mockWaveModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    updateMany: jest.Mock;
  };
  let mockTaskModel: {
    find: jest.Mock;
    bulkWrite: jest.Mock;
  };
  let mockProjectsService: {
    recalculateProjectStats: jest.Mock;
  };
  let mockRollingWavePlanningService: {
    createInitialWaves: jest.Mock;
  };

  const validProjectId = new Types.ObjectId().toString();
  const validWaveId = new Types.ObjectId().toString();
  const validTaskId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockWaveModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockTaskModel = {
      find: jest.fn(),
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockProjectsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue(undefined),
    };

    mockRollingWavePlanningService = {
      createInitialWaves: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollingWaveService,
        { provide: getModelToken(ProjectWave.name), useValue: mockWaveModel },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: RollingWavePlanningService, useValue: mockRollingWavePlanningService },
      ],
    }).compile();

    service = module.get<RollingWaveService>(RollingWaveService);
  });

  describe('createInitialWaves', () => {
    it('deve delegar a criacao inicial para RollingWavePlanningService', async () => {
      await service.createInitialWaves(validProjectId, { startDate: new Date() } as any);
      expect(mockRollingWavePlanningService.createInitialWaves).toHaveBeenCalled();
    });
  });

  describe('getWavesByProject', () => {
    it('deve buscar e ordenar as ondas do projeto por waveNumber', async () => {
      const mockWaves = [{ waveNumber: 1 }, { waveNumber: 2 }];
      mockWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockWaves),
        }),
      });

      const result = await service.getWavesByProject(validProjectId);
      expect(result).toEqual(mockWaves);
    });
  });

  describe('updateWaveStatus', () => {
    it('deve atualizar status da onda e resetar outras ondas ativas quando ativada', async () => {
      const mockUpdatedWave = { _id: validWaveId, status: 'active' };
      mockWaveModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUpdatedWave),
      });

      const result = await service.updateWaveStatus(validProjectId, validWaveId, 'active');

      expect(mockWaveModel.updateMany).toHaveBeenCalledWith(
        { projectId: new Types.ObjectId(validProjectId), status: 'active' },
        { status: 'planned' },
      );
      expect(result).toEqual(mockUpdatedWave);
    });
  });

  describe('addTaskToWave e removeTaskFromWave', () => {
    it('deve adicionar tarefa a onda', async () => {
      mockWaveModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validWaveId }),
      });

      const result = await service.addTaskToWave(validWaveId, validTaskId);
      expect(result).toBeDefined();
      expect(mockWaveModel.findByIdAndUpdate).toHaveBeenCalledWith(
        validWaveId,
        { $addToSet: { taskIds: new Types.ObjectId(validTaskId) } },
        { new: true },
      );
    });

    it('deve remover tarefa da onda', async () => {
      mockWaveModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validWaveId }),
      });

      const result = await service.removeTaskFromWave(validWaveId, validTaskId);
      expect(result).toBeDefined();
      expect(mockWaveModel.findByIdAndUpdate).toHaveBeenCalledWith(
        validWaveId,
        { $pull: { taskIds: new Types.ObjectId(validTaskId) } },
        { new: true },
      );
    });
  });

  describe('advanceToNextWave', () => {
    it('deve marcar onda atual como completed e proxima onda planejada como active', async () => {
      const currentWave = { _id: validWaveId, status: 'active' };
      const nextWave = { _id: new Types.ObjectId().toString(), status: 'planned' };

      mockWaveModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(currentWave),
      });

      mockWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([currentWave, nextWave]),
        }),
      });

      mockWaveModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...nextWave, status: 'active' }),
      });

      const result = await service.advanceToNextWave(validProjectId);
      expect(result).toBeDefined();
    });
  });

  describe('replanTaskDeadlines', () => {
    it('deve retornar contagem zerada se nao houver ondas', async () => {
      mockWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.replanTaskDeadlines(validProjectId);
      expect(result.waveCount).toBe(0);
      expect(result.updatedCount).toBe(0);
    });
  });
});
