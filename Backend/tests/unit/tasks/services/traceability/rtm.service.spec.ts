import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RTMService } from '../../../../../src/tasks/services/traceability/rtm.service';
import { RTMCrudService } from '../../../../../src/tasks/services/traceability/rtm-crud.service';
import { RTMAiService } from '../../../../../src/tasks/services/traceability/rtm-ai.service';
import { RTMJourneyService } from '../../../../../src/tasks/services/traceability/rtm-journey.service';
import { RTMMappingService } from '../../../../../src/tasks/services/traceability/rtm-mapping.service';
import { RTMValidationService } from '../../../../../src/tasks/services/traceability/rtm-validation.service';
import { RTMTaskGeneratorService } from '../../../../../src/tasks/services/traceability/rtm-task-generator.service';
import { Requirement } from '../../../../../src/tasks/schemas/requirement.schema';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';
import { Types } from 'mongoose';

describe('RTMService', () => {
  let service: RTMService;
  let mockModel: {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
    insertMany: jest.Mock;
    create: jest.Mock;
  };
  let mockGeminiService: {
    generateContent: jest.Mock;
  };

  const mockProjectId = new Types.ObjectId().toString();
  const mockRequirementId = new Types.ObjectId().toString();
  const mockTaskId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockModel = {
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      insertMany: jest.fn(),
      create: jest.fn(),
    };

    mockGeminiService = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RTMService,
        RTMCrudService,
        RTMAiService,
        RTMJourneyService,
        RTMMappingService,
        RTMValidationService,
        RTMTaskGeneratorService,
        {
          provide: getModelToken(Requirement.name),
          useValue: mockModel,
        },
        {
          provide: GeminiService,
          useValue: mockGeminiService,
        },
        {
          provide: TasksWriteService,
          useValue: { createTaskCore: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RTMService>(RTMService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRequirements', () => {
    it('deve gerar requisitos a partir de Smart Objective com IA', async () => {
      const smartObjective = {
        objective: 'Implementar sistema de vendas online',
        specific: 'Permitir que clientes comprem produtos',
        measurable: 'Processar 100 pedidos/dia',
        achievable: 'Com 2 desenvolvedores em 3 meses',
        relevant: 'Aumentar receita',
        temporal: '31/03/2026',
      };

      const mockAIResponse = JSON.stringify([
        {
          description: 'Sistema deve permitir login de usuários',
          type: 'functional',
        },
        {
          description: 'Sistema deve suportar até 1000 usuários simultâneos',
          type: 'non_functional',
        },
      ]);

      mockGeminiService.generateContent.mockResolvedValue(mockAIResponse);

      const result = await service.generateRequirements(smartObjective);

      expect(result.length).toBe(2);
      expect(result[0].description).toContain('login');
      expect(result[1].type).toBe('non_functional');
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
    });

    it('deve retornar array vazio se Smart Objective for null', async () => {
      const result = await service.generateRequirements(
        null as unknown as Record<string, string | undefined>,
      );

      expect(result).toEqual([]);
    });

    it('deve retornar array vazio se IA retornar valor inválido', async () => {
      mockGeminiService.generateContent.mockResolvedValue('invalid json');

      const result = await service.generateRequirements({
        objective: 'test',
      });

      expect(result).toEqual([]);
    });
  });

  describe('mapRequirementToTask', () => {
    it('deve mapear um requisito para uma tarefa', async () => {
      const mockRequirement = {
        _id: mockRequirementId,
        projectId: mockProjectId,
        description: 'Requisito de teste',
        traceableItems: [mockTaskId],
        status: 'satisfied',
        save: jest.fn(),
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockRequirement);

      const result = (await service.mapRequirementToTask({
        projectId: mockProjectId,
        requirementId: mockRequirementId,
        taskId: mockTaskId,
      })) as { traceableItems?: string[] } | null;

      expect(result).not.toBeNull();
      expect(result?.traceableItems).toContain(mockTaskId);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(Types.ObjectId) as unknown,
          projectId: mockProjectId,
        },
        expect.objectContaining({
          $addToSet: {
            traceableItems: mockTaskId,
            traceableActionItems: mockTaskId,
          },
          $set: { status: 'satisfied' },
        }),
        { new: true },
      );
    });

    it('deve retornar null se requisito não existir', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue(null);

      const result = (await service.mapRequirementToTask({
        projectId: mockProjectId,
        requirementId: mockRequirementId,
        taskId: mockTaskId,
      })) as unknown;

      expect(result).toBeNull();
    });
  });

  describe('unmapRequirementFromTask', () => {
    it('deve remover mapeamento de requisito', async () => {
      const mockRequirement = {
        _id: mockRequirementId,
        description: 'Requisito de teste',
        traceableItems: [],
        status: 'open',
        save: jest.fn(),
      };

      mockModel.findByIdAndUpdate.mockResolvedValue(mockRequirement);

      const result = await service.unmapRequirementFromTask(mockRequirementId, mockTaskId);

      expect(result).not.toBeNull();
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockRequirementId,
        {
          $pull: {
            traceableItems: mockTaskId,
            traceableActionItems: mockTaskId,
          },
        },
        { new: true },
      );
    });
  });

  describe('validateRTM', () => {
    it('deve validar RTM e encontrar requisitos não mapeados', async () => {
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito 1',
          traceableItems: [mockTaskId],
        },
        {
          _id: 'req-2',
          description: 'Requisito 2',
          traceableItems: [],
        },
      ];

      mockModel.find.mockResolvedValue(mockRequirements);

      const result = await service.validateRTM(mockProjectId);

      expect(result.isValid).toBe(false);
      expect(result.unmappedRequirements.length).toBe(1);
      expect(result.coverage).toBeLessThan(100);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('deve retornar isValid=true se todos requisitos estão mapeados', async () => {
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito 1',
          traceableItems: [mockTaskId],
        },
      ];

      mockModel.find.mockResolvedValue(mockRequirements);

      const result = await service.validateRTM(mockProjectId);

      expect(result.isValid).toBe(true);
      expect(result.unmappedRequirements).toEqual([]);
      expect(result.coverage).toBe(100);
    });

    it('deve alertar sobre requisitos mapeados para múltiplas tarefas', async () => {
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito compartilhado',
          traceableItems: ['task-1', 'task-2', 'task-3', 'task-4'],
        },
      ];

      mockModel.find.mockResolvedValue(mockRequirements);

      const result = await service.validateRTM(mockProjectId);

      expect(result.risks.some((r) => r.includes('4 tarefas'))).toBe(true);
    });
  });

  describe('getRTMMatrix', () => {
    it('deve retornar matriz de rastreabilidade', async () => {
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito 1',
          type: 'functional',
          status: 'satisfied',
          traceableItems: ['task-1'],
        },
      ];

      const mockTasks = [
        { _id: 'task-1', title: 'Tarefa 1' },
        { _id: 'task-2', title: 'Tarefa 2' },
      ];

      mockModel.find
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue(mockRequirements),
        })
        .mockResolvedValueOnce(mockRequirements as any);

      const result = await service.getRTMMatrix(
        mockProjectId,
        mockTasks as unknown as Parameters<typeof service.getRTMMatrix>[1],
      );

      expect(result.requirements.length).toBe(1);
      expect(result.tasks.length).toBe(2);
      expect(result.matrix.size).toBe(1);
    });

    it('deve retornar matriz vazia se não houver requisitos', async () => {
      mockModel.find.mockResolvedValue([]);

      const result = await service.getRTMMatrix(mockProjectId, []);

      expect(result.requirements).toEqual([]);
      expect(result.matrix.size).toBe(0);
    });
  });

  describe('saveRequirements', () => {
    it('deve salvar múltiplos requisitos', async () => {
      const requirementsData = [
        { description: 'Req 1', type: 'functional' },
        { description: 'Req 2', type: 'non_functional' },
      ];

      const mockSavedRequirements = [
        { _id: 'id1', ...requirementsData[0] },
        { _id: 'id2', ...requirementsData[1] },
      ];

      mockModel.create
        .mockResolvedValueOnce(mockSavedRequirements[0])
        .mockResolvedValueOnce(mockSavedRequirements[1]);

      const result = await service.saveRequirements(mockProjectId, requirementsData);

      expect(result.length).toBe(2);
      expect(mockModel.create).toHaveBeenCalled();
    });
  });

  describe('deleteRequirement', () => {
    it('deve deletar um requisito', async () => {
      mockModel.findByIdAndDelete.mockResolvedValue({ _id: mockRequirementId });

      const result = await service.deleteRequirement(mockRequirementId);

      expect(result).toBe(true);
      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith(mockRequirementId);
    });

    it('deve retornar false se requisito não existir', async () => {
      mockModel.findByIdAndDelete.mockResolvedValue(null);

      const result = await service.deleteRequirement(mockRequirementId);

      expect(result).toBe(false);
    });
  });
});
