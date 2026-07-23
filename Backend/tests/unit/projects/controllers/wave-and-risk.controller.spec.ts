import { Test, TestingModule } from '@nestjs/testing';
import { WaveAndRiskController } from '../../../../src/projects/controllers/wave-and-risk.controller';
import { RollingWaveService } from '../../../../src/projects/services/strategy';
import { RiskService } from '../../../../src/projects/services/execution';
import { EVMService, EVMProgressService } from '../../../../src/projects/services/evm';
import { TasksService } from '../../../../src/tasks/tasks.service';
import { CPMService } from '../../../../src/tasks/services/dependencies';
import { getModelToken } from '@nestjs/mongoose';
import { Project } from '../../../../src/projects/entities/project.entity';

describe('WaveAndRiskController', () => {
  let controller: WaveAndRiskController;
  let waveServiceMock: any;
  let riskServiceMock: any;
  let evmServiceMock: any;
  let evmProgressServiceMock: any;
  let tasksServiceMock: any;
  let cpmServiceMock: any;
  let projectModelMock: any;

  beforeEach(async () => {
    waveServiceMock = {
      updateWaveStatus: jest.fn().mockResolvedValue({ id: 'w-1', status: 'in_progress' }),
      advanceToNextWave: jest.fn().mockResolvedValue({ id: 'w-2', status: 'in_progress' }),
      replanTaskDeadlines: jest.fn().mockResolvedValue({ updatedCount: 5, waveCount: 2, summaries: [] }),
    };

    riskServiceMock = {
      getRisksByProject: jest.fn().mockResolvedValue([{ id: 'r-1', description: 'Risco de prazo' }]),
      assessRisks: jest.fn().mockResolvedValue([{ id: 'r-1', description: 'Risco de prazo' }]),
    };

    evmServiceMock = {};
    evmProgressServiceMock = {};
    tasksServiceMock = {};
    cpmServiceMock = {};
    projectModelMock = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaveAndRiskController],
      providers: [
        { provide: RollingWaveService, useValue: waveServiceMock },
        { provide: RiskService, useValue: riskServiceMock },
        { provide: EVMService, useValue: evmServiceMock },
        { provide: EVMProgressService, useValue: evmProgressServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: CPMService, useValue: cpmServiceMock },
        { provide: getModelToken(Project.name), useValue: projectModelMock },
      ],
    }).compile();

    controller = module.get<WaveAndRiskController>(WaveAndRiskController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('updateWave', () => {
    it('deve atualizar o status da onda', async () => {
      const result = await controller.updateWave('p-1', 'w-1', { status: 'active' });
      expect(result).toBeDefined();
      expect(waveServiceMock.updateWaveStatus).toHaveBeenCalledWith('p-1', 'w-1', 'active');
    });
  });

  describe('advanceWave', () => {
    it('deve avançar para a próxima onda', async () => {
      const result = await controller.advanceWave('p-1');
      expect(result).toBeDefined();
      expect(waveServiceMock.advanceToNextWave).toHaveBeenCalledWith('p-1');
    });
  });

  describe('replanTaskDeadlines', () => {
    it('deve replanejar prazos das tarefas', async () => {
      const result = await controller.replanTaskDeadlines('p-1');
      expect(result.updatedCount).toBe(5);
      expect(waveServiceMock.replanTaskDeadlines).toHaveBeenCalledWith('p-1');
    });
  });

  describe('getRisks', () => {
    it('deve buscar riscos do projeto', async () => {
      const result = await controller.getRisks('p-1');
      expect(result).toHaveLength(1);
      expect(riskServiceMock.getRisksByProject).toHaveBeenCalledWith('p-1');
    });
  });

  describe('assessRisks', () => {
    it('deve avaliar riscos do projeto com IA', async () => {
      const result = await controller.assessRisks('p-1', { projectDescription: 'Desc' });
      expect(result).toHaveLength(1);
      expect(riskServiceMock.assessRisks).toHaveBeenCalledWith('p-1', 'Desc');
    });
  });
});
