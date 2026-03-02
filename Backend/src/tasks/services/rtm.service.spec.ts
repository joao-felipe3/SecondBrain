import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RTMService } from './rtm.service';
import { Requirement } from '../schemas/requirement.schema';
import { GeminiService } from '../gemini.service';

describe('RTMService', () => {
  let service: RTMService;
  let mockModel: any;
  let mockGeminiService: any;

  const mockProjectId = 'project-123';
  const mockRequirementId = 'req-123';
  const mockTaskId = 'task-456';

  beforeEach(async () => {
    mockModel = {
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      insertMany: jest.fn(),
    };

    mockGeminiService = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RTMService,
        {
          provide: getModelToken(Requirement.name),
          useValue: mockModel,
        },
        {
          provide: GeminiService,
          useValue: mockGeminiService,
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
      // Arrange
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

      // Act
      const result = await service.generateRequirements(smartObjective);

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].description).toContain('login');
      expect(result[1].type).toBe('non_functional');
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
    });

    it('deve retornar array vazio se Smart Objective for null', async () => {
      // Act
      const result = await service.generateRequirements(null);

      // Assert
      expect(result).toEqual([]);
    });

    it('deve retornar array vazio se IA retornar valor inválido', async () => {
      // Arrange
      mockGeminiService.generateContent.mockResolvedValue('invalid json');

      // Act
      const result = await service.generateRequirements({
        objective: 'test',
      });

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('mapRequirementToTask', () => {
    it('deve mapear um requisito para uma tarefa', async () => {
      // Arrange
      const mockRequirement = {
        _id: mockRequirementId,
        projectId: mockProjectId,
        description: 'Requisito de teste',
        traceableItems: [mockTaskId],
        status: 'satisfied',
        save: jest.fn(),
      };

      mockModel.findByIdAndUpdate.mockResolvedValue(mockRequirement);

      // Act
      const result = await service.mapRequirementToTask(
        mockProjectId,
        mockRequirementId,
        mockTaskId,
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result!.traceableItems).toContain(mockTaskId);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockRequirementId,
        expect.objectContaining({
          $addToSet: { traceableItems: mockTaskId },
          $set: { status: 'satisfied' },
        }),
        { new: true },
      );
    });

    it('deve retornar null se requisito não existir', async () => {
      // Arrange
      mockModel.findByIdAndUpdate.mockResolvedValue(null);

      // Act
      const result = await service.mapRequirementToTask(
        mockProjectId,
        mockRequirementId,
        mockTaskId,
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('unmapRequirementFromTask', () => {
    it('deve remover mapeamento de requisito', async () => {
      // Arrange
      const mockRequirement = {
        _id: mockRequirementId,
        description: 'Requisito de teste',
        traceableItems: [],
        status: 'open',
        save: jest.fn(),
      };

      mockModel.findByIdAndUpdate.mockResolvedValue(mockRequirement);

      // Act
      const result = await service.unmapRequirementFromTask(
        mockRequirementId,
        mockTaskId,
      );

      // Assert
      expect(result).not.toBeNull();
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockRequirementId,
        { $pull: { traceableItems: mockTaskId } },
        { new: true },
      );
    });
  });

  describe('validateRTM', () => {
    it('deve validar RTM e encontrar requisitos não mapeados', async () => {
      // Arrange
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

      // Act
      const result = await service.validateRTM(mockProjectId);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.unmappedRequirements.length).toBe(1);
      expect(result.coverage).toBeLessThan(100);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('deve retornar isValid=true se todos requisitos estão mapeados', async () => {
      // Arrange
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito 1',
          traceableItems: [mockTaskId],
        },
      ];

      mockModel.find.mockResolvedValue(mockRequirements);

      // Act
      const result = await service.validateRTM(mockProjectId);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.unmappedRequirements).toEqual([]);
      expect(result.coverage).toBe(100);
    });

    it('deve alertar sobre requisitos mapeados para múltiplas tarefas', async () => {
      // Arrange
      const mockRequirements = [
        {
          _id: 'req-1',
          description: 'Requisito compartilhado',
          traceableItems: ['task-1', 'task-2', 'task-3'],
        },
      ];

      mockModel.find.mockResolvedValue(mockRequirements);

      // Act
      const result = await service.validateRTM(mockProjectId);

      // Assert
      expect(result.risks.some((r) => r.includes('3 tarefas'))).toBe(true);
    });
  });

  describe('getRTMMatrix', () => {
    it('deve retornar matriz de rastreabilidade', async () => {
      // Arrange
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

      mockModel.find.mockResolvedValue(mockRequirements);

      // Act
      const result = await service.getRTMMatrix(mockProjectId, mockTasks);

      // Assert
      expect(result.requirements.length).toBe(1);
      expect(result.tasks.length).toBe(2);
      expect(result.matrix.size).toBe(1);
    });

    it('deve retornar matriz vazia se não houver requisitos', async () => {
      // Arrange
      mockModel.find.mockResolvedValue([]);

      // Act
      const result = await service.getRTMMatrix(mockProjectId, []);

      // Assert
      expect(result.requirements).toEqual([]);
      expect(result.matrix.size).toBe(0);
    });
  });

  describe('saveRequirements', () => {
    it('deve salvar múltiplos requisitos', async () => {
      // Arrange
      const requirementsData = [
        { description: 'Req 1', type: 'functional' },
        { description: 'Req 2', type: 'non_functional' },
      ];

      const mockSavedRequirements = [
        { _id: 'id1', ...requirementsData[0] },
        { _id: 'id2', ...requirementsData[1] },
      ];

      mockModel.insertMany.mockResolvedValue(mockSavedRequirements);

      // Act
      const result = await service.saveRequirements(mockProjectId, requirementsData);

      // Assert
      expect(result.length).toBe(2);
      expect(mockModel.insertMany).toHaveBeenCalled();
    });
  });

  describe('deleteRequirement', () => {
    it('deve deletar um requisito', async () => {
      // Arrange
      mockModel.findByIdAndDelete.mockResolvedValue({ _id: mockRequirementId });

      // Act
      const result = await service.deleteRequirement(mockRequirementId);

      // Assert
      expect(result).toBe(true);
      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith(mockRequirementId);
    });

    it('deve retornar false se requisito não existir', async () => {
      // Arrange
      mockModel.findByIdAndDelete.mockResolvedValue(null);

      // Act
      const result = await service.deleteRequirement(mockRequirementId);

      // Assert
      expect(result).toBe(false);
    });
  });
});
