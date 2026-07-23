import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PertDiagramService } from '../../../../../src/projects/services/visualization/pert-diagram.service';
import { CPMService } from '../../../../../src/tasks/services/dependencies';

describe('PertDiagramService', () => {
  let service: PertDiagramService;
  let mockProjectModel: {
    findById: jest.Mock;
  };
  let mockTaskModel: {
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

    mockCpmService = {
      normalizeRelationship: jest.fn().mockReturnValue('FINISH_TO_START'),
      calculateCriticalPath: jest.fn().mockReturnValue({
        tasksByImpact: [],
        criticalPath: [],
        alerts: [],
        diagnostics: { impliedParallelism: 2 },
        packageCriticality: [],
        projectDuration: 100,
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

  describe('getPertDiagramData', () => {
    it('deve rejeitar ID de projeto invalido', async () => {
      await expect(service.getPertDiagramData('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lancar NotFoundException se o projeto nao for encontrado', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getPertDiagramData(validProjectId)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar dados do diagrama PERT com estatisticas', async () => {
      const mockProject = {
        _id: validProjectId,
        name: 'Projeto PERT',
      };

      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      mockTaskModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getPertDiagramData(validProjectId);
      expect(result).toBeDefined();
      expect(result.projectId).toBe(validProjectId);
      expect(result.projectName).toBe('Projeto PERT');
      expect(result.statistics).toBeDefined();
      expect(mockCpmService.calculateCriticalPath).toHaveBeenCalled();
    });
  });
});
