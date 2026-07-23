import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GanttService } from '../../../../../src/projects/services/visualization/gantt.service';
import { CPMService } from '../../../../../src/tasks/services/dependencies';

describe('GanttService', () => {
  let service: GanttService;
  let mockProjectModel: {
    findById: jest.Mock;
  };
  let mockTaskModel: {
    find: jest.Mock;
  };
  let mockWaveModel: {
    find: jest.Mock;
  };
  let mockCpmService: {
    normalizeRelationship: jest.Mock;
    calculateCriticalPath: jest.Mock;
    getDependencies: jest.Mock;
  };

  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockProjectModel = {
      findById: jest.fn(),
    };

    mockTaskModel = {
      find: jest.fn(),
    };

    mockWaveModel = {
      find: jest.fn(),
    };

    mockCpmService = {
      normalizeRelationship: jest.fn().mockReturnValue('FINISH_TO_START'),
      calculateCriticalPath: jest.fn().mockReturnValue({
        tasksByImpact: [],
        criticalPath: [],
        alerts: [],
        diagnostics: [],
        packageCriticality: [],
        projectDuration: 0,
      }),
      getDependencies: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GanttService,
        { provide: getModelToken('Project'), useValue: mockProjectModel },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: getModelToken('ProjectWave'), useValue: mockWaveModel },
        { provide: CPMService, useValue: mockCpmService },
      ],
    }).compile();

    service = module.get<GanttService>(GanttService);
  });

  describe('getGanttData', () => {
    it('deve rejeitar ID de projeto invalido', async () => {
      await expect(service.getGanttData('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lancar NotFoundException se o projeto nao for encontrado', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getGanttData(validProjectId)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar dados do diagrama de Gantt com sucesso', async () => {
      const mockProject = {
        _id: validProjectId,
        name: 'Projeto Gantt',
        createdAt: new Date(),
      };

      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      mockTaskModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      mockWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getGanttData(validProjectId);
      expect(result).toBeDefined();
      expect(result.projectId).toBe(validProjectId);
      expect(result.projectName).toBe('Projeto Gantt');
      expect(mockCpmService.calculateCriticalPath).toHaveBeenCalled();
    });
  });
});
