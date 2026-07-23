import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GanttService } from '../../../../src/projects/services/visualization/gantt.service';
import { ProjectWave } from '../../../../src/projects/schemas/project-wave.schema';
import { CPMService } from '../../../../src/tasks/services/dependencies/cpm.service';
import { Types } from 'mongoose';

describe('GanttService', () => {
  let service: GanttService;
  let mockProjectModel: any;
  let mockTaskModel: any;
  let mockWaveModel: any;
  let mockCpmService: any;

  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockProjectModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validProjectId,
          name: 'Projeto Teste',
          startDate: new Date('2026-01-01'),
          deadline: new Date('2026-12-31'),
        }),
      }),
    };

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            name: 'Tarefa 1',
            pertExpectedMinutes: 120,
            isConcluded: false,
          },
        ]),
      }),
    };

    mockWaveModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockCpmService = {
      normalizeRelationship: jest.fn().mockReturnValue('FS'),
      calculateCriticalPath: jest.fn().mockReturnValue({
        criticalPath: [],
        alerts: [],
        diagnostics: {},
        packageCriticality: [],
        projectDuration: 2,
        tasksByImpact: [],
      }),
      getDependencies: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GanttService,
        { provide: getModelToken('Project'), useValue: mockProjectModel },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: getModelToken(ProjectWave.name), useValue: mockWaveModel },
        { provide: CPMService, useValue: mockCpmService },
      ],
    }).compile();

    service = module.get<GanttService>(GanttService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGanttData', () => {
    it('deve retornar os dados do gráfico Gantt', async () => {
      const result = await service.getGanttData(validProjectId);

      expect(result.projectId).toBe(validProjectId);
      expect(result.projectName).toBe('Projeto Teste');
      expect(result.projectDurationHours).toBe(2);
      expect(mockProjectModel.findById).toHaveBeenCalledWith(validProjectId);
    });

    it('deve rejeitar ID de projeto inválido', async () => {
      await expect(service.getGanttData('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se o projeto não for encontrado', async () => {
      mockProjectModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.getGanttData(validProjectId)).rejects.toThrow(NotFoundException);
    });
  });
});
