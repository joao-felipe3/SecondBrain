import { Test, TestingModule } from '@nestjs/testing';
import { WbsValidationService } from '../../../../../src/projects/services/wbs/core/wbs-validation.service';
import { WbsAiService } from '../../../../../src/ai/services/projects/wbs-ai.service';
import { WBSNodeDto } from '../../../../../src/projects/dto/wbs.dto';

describe('WbsValidationService', () => {
  let service: WbsValidationService;
  let mockWbsAiService: any;

  beforeEach(async () => {
    mockWbsAiService = {
      suggestDecomposition: jest.fn().mockResolvedValue('Sugestão de decomposição IA'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WbsValidationService, { provide: WbsAiService, useValue: mockWbsAiService }],
    }).compile();

    service = module.get<WbsValidationService>(WbsValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateNode', () => {
    it('deve retornar válido para nó pai com filhos', () => {
      const parentNode: WBSNodeDto = {
        name: 'Fase 1',
        estimatedHours: 100,
        children: [{ name: 'Sub 1', estimatedHours: 20, children: [] }],
      } as any;

      const result = service.validateNode(parentNode);
      expect(result.valid).toBe(true);
    });

    it('deve rejeitar nó folha com menos de 8 horas (regra 8/80)', () => {
      const leafNode: WBSNodeDto = {
        name: 'Tarefa pequena',
        estimatedHours: 4,
        children: [],
      } as any;

      const result = service.validateNode(leafNode);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('muito pequeno');
    });

    it('deve rejeitar nó folha com mais de 80 horas (regra 8/80)', () => {
      const leafNode: WBSNodeDto = {
        name: 'Tarefa gigante',
        estimatedHours: 100,
        children: [],
      } as any;

      const result = service.validateNode(leafNode);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('muito grande');
    });

    it('deve aprovar nó folha entre 8 e 80 horas', () => {
      const leafNode: WBSNodeDto = {
        name: 'Tarefa ideal',
        estimatedHours: 40,
        children: [],
      } as any;

      const result = service.validateNode(leafNode);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTree', () => {
    it('deve retornar violações se nós na árvore violarem a regra 8/80', () => {
      const tree: WBSNodeDto[] = [
        {
          name: 'Nó 1',
          estimatedHours: 5,
          children: [],
        },
        {
          name: 'Nó 2',
          estimatedHours: 90,
          children: [],
        },
      ] as any;

      const result = service.validateTree(tree);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('validateBudget', () => {
    it('deve calcular métricas de orçamento corretamente', () => {
      const nodes: WBSNodeDto[] = [
        { name: 'Task 1', estimatedHours: 20, children: [] },
        { name: 'Task 2', estimatedHours: 30, children: [] },
      ] as any;

      const result = service.validateBudget(nodes, 40, { weeklyHours: 40, weeksAvailable: 1 });

      expect(result.budgetHours).toBe(40);
      expect(result.totalLeafHours).toBe(50);
      expect(result.overBudget).toBe(true);
      expect(result.deltaHours).toBe(10);
      expect(result.utilizationPct).toBe(125);
    });

    it('deve lidar com budgetHours zero ou inválido', () => {
      const nodes: WBSNodeDto[] = [{ name: 'Task 1', estimatedHours: 20, children: [] }] as any;
      const result = service.validateBudget(nodes, 0);
      expect(result.budgetHours).toBe(0);
      expect(result.overBudget).toBe(false);
      expect(result.utilizationPct).toBe(0);
    });
  });

  describe('normalizeTreeToBudget', () => {
    it('deve ajustar horas das folhas para se adequar ao orçamento', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Fase 1',
          estimatedHours: 100,
          children: [
            { name: 'Task 1', estimatedHours: 40, children: [] },
            { name: 'Task 2', estimatedHours: 60, children: [] },
          ],
        },
      ] as any;

      const normalized = service.normalizeTreeToBudget(nodes, 50);

      const total = normalized[0].children!.reduce((sum, n) => sum + n.estimatedHours, 0);
      expect(total).toBeCloseTo(50, 0);
      expect(normalized[0].estimatedHours).toBeCloseTo(50, 0);
    });

    it('deve retornar árvore inalterada se budgetHours for inválido ou leaves vazias', () => {
      const nodes: WBSNodeDto[] = [{ name: 'Fase 1', estimatedHours: 0, children: [] }] as any;
      const resInv = service.normalizeTreeToBudget(nodes, -10);
      expect(resInv).toEqual(nodes);

      const resEmpty: WBSNodeDto[] = [];
      expect(service.normalizeTreeToBudget(resEmpty, 50)).toEqual([]);

      const resZeroHours = service.normalizeTreeToBudget(
        [{ name: 'Task', estimatedHours: 0, children: [] }] as any,
        50,
      );
      expect(resZeroHours[0].estimatedHours).toBe(0);
    });

    it('deve respeitar limites 8/80 na normalização', () => {
      const nodes: WBSNodeDto[] = [
        { name: 'Task 1', estimatedHours: 10, children: [] },
        { name: 'Task 2', estimatedHours: 10, children: [] },
      ] as any;

      // Se tentar normalizar para 5h, o mínimo por folha é 8h -> total vira 16h
      const normalized = service.normalizeTreeToBudget(nodes, 5);
      expect(normalized[0].estimatedHours).toBe(8);
      expect(normalized[1].estimatedHours).toBe(8);
    });
  });

  describe('suggestDecomposition', () => {
    it('deve chamar wbsAiService para sugerir decomposição', async () => {
      const result = await service.suggestDecomposition({
        name: 'Modulo complexo',
        estimatedHours: 100,
      });

      expect(result).toBe('Sugestão de decomposição IA');
      expect(mockWbsAiService.suggestDecomposition).toHaveBeenCalled();
    });
  });
});
