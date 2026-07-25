import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { RiskService } from '../../../../../src/projects/services/execution/risk.service';
import { Risk } from '../../../../../src/projects/schemas/risk.schema';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('RiskService', () => {
  let service: RiskService;
  let mockRiskModel: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findByIdAndDelete: jest.Mock;
    find: jest.Mock;
  };
  let mockGeminiService: {
    generateContent: jest.Mock;
  };

  const validProjectId = new Types.ObjectId().toString();
  const validRiskId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockRiskModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      find: jest.fn(),
    };

    mockGeminiService = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        { provide: getModelToken(Risk.name), useValue: mockRiskModel },
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<RiskService>(RiskService);
  });

  describe('assessRisks', () => {
    it('deve gerar e salvar riscos avaliados pela IA', async () => {
      const llmResponse = JSON.stringify({
        risks: [
          {
            description: 'Risco de Infraestrutura',
            probability: 50,
            impact: 4,
            severity: 'alta',
            mitigationPlan: 'Usar redundancia',
          },
        ],
      });

      mockGeminiService.generateContent.mockResolvedValue(llmResponse);
      mockRiskModel.create.mockResolvedValue({
        _id: validRiskId,
        description: 'Risco de Infraestrutura',
      });

      const risks = await service.assessRisks(validProjectId, 'Projeto de E-commerce');
      expect(risks).toHaveLength(1);
      expect(mockGeminiService.generateContent).toHaveBeenCalled();
    });

    it('deve retornar array vazio se o JSON da IA for invalido', async () => {
      mockGeminiService.generateContent.mockResolvedValue('Invalid JSON string');
      const risks = await service.assessRisks(validProjectId, 'Projeto Teste');
      expect(risks).toEqual([]);
    });
  });

  describe('createRisk', () => {
    it('deve calcular severidade automaticamente se nao fornecida', async () => {
      const dto = {
        description: 'Atraso de dependencias',
        probability: 80,
        impact: 5,
      };

      mockRiskModel.create.mockImplementation((obj) => Promise.resolve({ _id: validRiskId, ...obj }));

      const risk = await service.createRisk(validProjectId, dto);
      expect(risk).toBeDefined();
      expect(mockRiskModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'alta',
        }),
      );
    });
  });

  describe('updateRisk', () => {
    it('deve retornar null se o risco nao for encontrado', async () => {
      mockRiskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.updateRisk(validRiskId, { impact: 3 });
      expect(result).toBeNull();
    });

    it('deve recalcular severidade ao atualizar probabilidade e impacto', async () => {
      const existing = { _id: validRiskId, probability: 20, impact: 2, severity: 'baixa' };
      mockRiskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      mockRiskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...existing, probability: 90, impact: 5, severity: 'alta' }),
      });

      const result = await service.updateRisk(validRiskId, { probability: 90, impact: 5 });
      expect(result?.severity).toBe('alta');
    });
  });

  describe('getRiskStatistics e getRiskInterventions', () => {
    it('deve calcular estatisticas de riscos', async () => {
      const mockRisks = [
        { _id: 'r1', status: 'identificado', severity: 'alta', probability: 80, impact: 5 },
        { _id: 'r2', status: 'mitigando', severity: 'média', probability: 50, impact: 3 },
      ];

      mockRiskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockRisks),
        }),
      });

      const stats = await service.getRiskStatistics(validProjectId);
      expect(stats.total).toBe(2);
      expect(stats.bySeverity.alta).toBe(1);
      expect(stats.byStatus.identificado).toBe(1);
    });

    it('deve gerar recomendacoes de intervencoes de risco', async () => {
      const mockRisks = [
        {
          _id: 'r1',
          description: 'Risco Critico',
          status: 'identificado',
          severity: 'alta',
          probability: 90,
          impact: 5,
        },
      ];

      mockRiskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockRisks),
        }),
      });

      const result = await service.getRiskInterventions(validProjectId);
      expect(result.summary.total).toBe(1);
      expect(result.interventions[0].recommendedAction).toBe('reduzir-escopo');
    });
  });
});
