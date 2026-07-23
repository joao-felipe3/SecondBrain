import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PertDiagramService } from '../../../../src/projects/services/visualization/pert-diagram.service';
import { CPMService } from '../../../../src/tasks/services/dependencies/cpm.service';
import { Types } from 'mongoose';

describe('PertDiagramService', () => {
  let service: PertDiagramService;
  let mockProjectModel: any;
  let mockTaskModel: any;
  let mockCpmService: any;

  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockProjectModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validProjectId,
          name: 'Projeto PERT',
        }),
      }),
    };

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            name: 'Task PERT 1',
            pertExpectedMinutes: 60,
          },
        ]),
      }),
    };

    mockCpmService = {
      normalizeRelationship: jest.fn().mockReturnValue('FS'),
      calculateCriticalPath: jest.fn().mockReturnValue({
        criticalPath: [],
        alerts: [],
        diagnostics: { impliedParallelism: 1 },
        packageCriticality: [],
        projectDuration: 1,
        tasksByImpact: [],
      }),
      getDependencies: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PertDiagramService,
        { provide: getModelToken('Project'), useValue: mockProjectModel },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: CPMService, useValue: mockCpmService },
      ],
    }).compile();

    service = module.get<PertDiagramService>(PertDiagramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPertDiagramData', () => {
    it('deve retornar os dados do diagrama PERT', async () => {
      const result = await service.getPertDiagramData(validProjectId);

      expect(result.projectId).toBe(validProjectId);
      expect(result.projectName).toBe('Projeto PERT');
      expect(result.projectDurationHours).toBe(1);
      expect(result.statistics.totalTasks).toBe(1);
    });

    it('deve rejeitar ID inválido', async () => {
      await expect(service.getPertDiagramData('id-invalido')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se o projeto não for encontrado', async () => {
      mockProjectModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.getPertDiagramData(validProjectId)).rejects.toThrow(NotFoundException);
    });
  });
});
