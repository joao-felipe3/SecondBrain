import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RollingWaveService } from '../../../../src/projects/services/strategy/rolling-wave.service';
import { ProjectsService } from '../../../../src/projects/projects.service';
import { RollingWavePlanningService } from '../../../../src/projects/services/strategy/rolling-wave-planning.service';
import { ProjectWave } from '../../../../src/projects/schemas/project-wave.schema';

describe('RollingWaveService', () => {
  let service: RollingWaveService;
  let waveModelMock: any;
  let taskModelMock: any;
  let projectsServiceMock: any;
  let rollingWavePlanningServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    waveModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: 'w-1', waveNumber: 1, status: 'active', taskIds: [] },
            { _id: 'w-2', waveNumber: 2, status: 'planned', taskIds: [] },
          ]),
        }),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'w-1', waveNumber: 1, status: 'active' }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'w-1', status: 'active' }),
      }),
      updateMany: jest.fn().mockResolvedValue({}),
    };

    taskModelMock = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
      bulkWrite: jest.fn().mockResolvedValue({}),
    };

    projectsServiceMock = {};
    rollingWavePlanningServiceMock = {
      createInitialWaves: jest.fn().mockResolvedValue([{ _id: 'w-1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollingWaveService,
        { provide: getModelToken(ProjectWave.name), useValue: waveModelMock },
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: RollingWavePlanningService, useValue: rollingWavePlanningServiceMock },
      ],
    }).compile();

    service = module.get<RollingWaveService>(RollingWaveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInitialWaves', () => {
    it('deve delegar a criação de ondas para rollingWavePlanningService', async () => {
      const result = await service.createInitialWaves(validObjectId, {} as any, 28);

      expect(result).toHaveLength(1);
      expect(rollingWavePlanningServiceMock.createInitialWaves).toHaveBeenCalled();
    });
  });

  describe('getWavesByProject', () => {
    it('deve buscar as ondas do projeto ordenadas por waveNumber', async () => {
      const result = await service.getWavesByProject(validObjectId);

      expect(result).toHaveLength(2);
      expect(waveModelMock.find).toHaveBeenCalled();
    });
  });

  describe('updateWaveStatus', () => {
    it('deve atualizar o status da onda', async () => {
      const result = await service.updateWaveStatus(validObjectId, 'w-1', 'active');

      expect(result).toBeDefined();
      expect(waveModelMock.updateMany).toHaveBeenCalled();
    });
  });

  describe('getCurrentWave', () => {
    it('deve buscar a onda ativa do projeto', async () => {
      const result = await service.getCurrentWave(validObjectId);

      expect(result?._id).toBe('w-1');
    });
  });

  describe('advanceToNextWave', () => {
    it('deve concluir a onda atual e ativar a próxima onda', async () => {
      const result = await service.advanceToNextWave(validObjectId);

      expect(result).toBeDefined();
    });
  });
});
