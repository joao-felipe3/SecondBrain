import { Test, TestingModule } from '@nestjs/testing';
import { WbsValidationService } from '../../../../../../src/projects/services/wbs/core/wbs-validation.service';
import { WbsAiService } from '../../../../../../src/ai/services/projects/wbs-ai.service';

describe('WbsValidationService', () => {
  let service: WbsValidationService;
  let mockWbsAiService: {
    suggestDecomposition: jest.Mock;
  };

  beforeEach(async () => {
    mockWbsAiService = {
      suggestDecomposition: jest.fn().mockResolvedValue('Sugestao de decomposicao IA'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WbsValidationService,
        { provide: WbsAiService, useValue: mockWbsAiService },
      ],
    }).compile();

    service = module.get<WbsValidationService>(WbsValidationService);
  });

  describe('validateNode (8/80 Rule)', () => {
    it('deve validar no folha com horas entre 8h e 80h', () => {
      const result = service.validateNode({ name: 'Node OK', estimatedHours: 20 } as any);
      expect(result.valid).toBe(true);
    });

    it('deve rejeitar no folha com menos de 8 horas', () => {
      const result = service.validateNode({ name: 'Node Pequeno', estimatedHours: 4 } as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('mínimo 8 horas');
    });

    it('deve rejeitar no folha com mais de 80 horas', () => {
      const result = service.validateNode({ name: 'Node Grande', estimatedHours: 100 } as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('máximo 80 horas');
    });

    it('deve considerar nos com filhos sempre validos na raiz', () => {
      const result = service.validateNode({
        name: 'Pai',
        estimatedHours: 150,
        children: [{ name: 'Filho 1', estimatedHours: 40 }],
      } as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTree', () => {
    it('deve percorrer a arvore WBS e retornar todas as violacoes', () => {
      const tree = [
        {
          name: 'Fase 1',
          estimatedHours: 4,
          children: [
            { name: 'Task A', estimatedHours: 4 },
            { name: 'Task B', estimatedHours: 100 },
          ],
        },
      ];

      const result = service.validateTree(tree as any);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('validateBudget', () => {
    it('deve calcular utilizacao e indicar estouro de orcamento', () => {
      const nodes = [{ name: 'Task 1', estimatedHours: 60 }, { name: 'Task 2', estimatedHours: 60 }];
      const summary = service.validateBudget(nodes as any, 100);

      expect(summary.budgetHours).toBe(100);
      expect(summary.totalLeafHours).toBe(120);
      expect(summary.overBudget).toBe(true);
      expect(summary.deltaHours).toBe(20);
      expect(summary.utilizationPct).toBe(120);
    });
  });

  describe('normalizeTreeToBudget', () => {
    it('deve escalar folhas para caber no orcamento', () => {
      const nodes = [{ name: 'Task 1', estimatedHours: 40 }, { name: 'Task 2', estimatedHours: 60 }];
      const normalized = service.normalizeTreeToBudget(nodes as any, 50);

      expect(normalized).toBeDefined();
      const totalHours = normalized.reduce((sum, n) => sum + n.estimatedHours, 0);
      expect(totalHours).toBeCloseTo(50, 0);
    });
  });

  describe('suggestDecomposition', () => {
    it('deve delegar a decomposicao para WbsAiService', async () => {
      const suggestion = await service.suggestDecomposition({ name: 'Task', estimatedHours: 90 });
      expect(suggestion).toBe('Sugestao de decomposicao IA');
      expect(mockWbsAiService.suggestDecomposition).toHaveBeenCalled();
    });
  });
});
