import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RollingWavePlanningService } from '../../../../src/projects/services/strategy/rolling-wave-planning.service';
import { ProjectsService } from '../../../../src/projects/projects.service';
import { WBSService } from '../../../../src/projects/services/wbs/core/wbs.service';
import { RollingWaveAIService } from '../../../../src/ai/services/projects/rolling-wave-ai.service';
import { ProjectWave } from '../../../../src/projects/schemas/project-wave.schema';

describe('RollingWavePlanningService', () => {
  let service: RollingWavePlanningService;
  let waveModelMock: any;
  let projectsServiceMock: any;
  let wbsServiceMock: any;
  let rollingWaveAiServiceMock: any;

  beforeEach(async () => {
    waveModelMock = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'w-1' }),
    }));
    waveModelMock.deleteMany = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    });
    waveModelMock.findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    });
    waveModelMock.bulkWrite = jest.fn().mockResolvedValue({});
    waveModelMock.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { waveNumber: 1, taskIds: ['t-1'], startDate: new Date(), endDate: new Date() },
        ]),
      }),
    });

    projectsServiceMock = {
      getTasksForProject: jest.fn().mockResolvedValue([
        { _id: '507f1f77bcf86cd799439011', id: 't-1', name: 'Task 1', pomodorosPlanned: 2 },
      ]),
      update: jest.fn().mockResolvedValue({}),
    };

    wbsServiceMock = {
      getWBS: jest.fn().mockResolvedValue([
        { name: 'Fase 1', children: [] },
      ]),
    };

    rollingWaveAiServiceMock = {
      planWaveStructure: jest.fn().mockResolvedValue({
        recommendedWaveCount: 2,
        totalDurationDays: 30,
      }),
      planWaveGrouping: jest.fn().mockResolvedValue({
        waves: [
          { waveNumber: 1, taskIds: ['507f1f77bcf86cd799439011'], durationDays: 15 },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RollingWavePlanningService,
        { provide: getModelToken(ProjectWave.name), useValue: waveModelMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: WBSService, useValue: wbsServiceMock },
        { provide: RollingWaveAIService, useValue: rollingWaveAiServiceMock },
      ],
    }).compile();

    service = module.get<RollingWavePlanningService>(RollingWavePlanningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInitialWaves', () => {
    it('deve criar ondas de planejamento com auxílio da IA', async () => {
      const project: any = {
        name: 'Projeto Teste',
        description: 'Desc',
        smartObjective: { deadline: new Date() },
      };

      const result = await service.createInitialWaves('507f1f77bcf86cd799439011', project, 28);

      expect(result).toBeDefined();
      expect(projectsServiceMock.getTasksForProject).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(rollingWaveAiServiceMock.planWaveStructure).toHaveBeenCalled();
      expect(rollingWaveAiServiceMock.planWaveGrouping).toHaveBeenCalled();
    });
  });
});
