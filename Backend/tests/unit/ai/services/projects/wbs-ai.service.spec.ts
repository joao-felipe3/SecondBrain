import { Test, TestingModule } from '@nestjs/testing';
import { WbsAiService } from '../../../../../src/ai/services/projects/wbs-ai.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('WbsAiService', () => {
  let service: WbsAiService;
  let mockGeminiService: {
    generateContent: jest.Mock;
  };

  beforeEach(async () => {
    mockGeminiService = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WbsAiService,
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<WbsAiService>(WbsAiService);
  });

  describe('generateWbs', () => {
    it('deve gerar nós WBS a partir de um objetivo SMART', async () => {
      const responseJson = '```json\n[{"name": "Fase 1", "estimatedHours": 20}]\n```';
      mockGeminiService.generateContent.mockResolvedValue(responseJson);

      const nodes = await service.generateWbs({ title: 'Novo Sistema' } as any);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe('Fase 1');
    });

    it('deve lancar erro se o retorno nao for um array JSON', async () => {
      mockGeminiService.generateContent.mockResolvedValue('{"not": "an array"}');
      await expect(service.generateWbs({ title: 'Novo Sistema' } as any)).rejects.toThrow(
        'Não foi possível gerar a WBS com IA',
      );
    });
  });

  describe('suggestDecomposition', () => {
    it('deve gerar sugestao de decomposicao', async () => {
      mockGeminiService.generateContent.mockResolvedValue('Sugestao: dividir em 2 nos de 40h');

      const result = await service.suggestDecomposition({
        name: 'Node Grande',
        estimatedHours: 120,
      });

      expect(result).toBe('Sugestao: dividir em 2 nos de 40h');
    });
  });

  describe('auditLeafDiscrepancy', () => {
    it('deve auditar discrepancia de folha e retornar diagnostico estruturado', async () => {
      const jsonResponse = JSON.stringify({
        diagnosis: 'gold_plating',
        suggestedAction: 'simplify',
        rationale: 'Muitos passos desnecessarios',
        suggestedEstimatedHours: '15.5h',
      });

      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      const audit = await service.auditLeafDiscrepancy({
        leafNodeName: 'Leaf 1',
        nodePath: '1.1',
        budgetHours: 10,
        generatedHours: 15,
        diffPct: 50,
        taskCount: 5,
        duplicateRatio: 0.1,
        dupScore: 0.2,
        similarScore: 0.1,
        microTasks: [],
      } as any);

      expect(audit.diagnosis).toBe('gold_plating');
      expect(audit.suggestedAction).toBe('simplify');
      expect(audit.suggestedEstimatedHours).toBe(15.5);
    });
  });

  describe('fixMonotonyBatch', () => {
    it('deve corrigir lote de tarefas monotonas', async () => {
      const jsonResponse = JSON.stringify([{ name: 'Task Diversificada' }]);
      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.fixMonotonyBatch({
        node: { name: 'Leaf 1', description: 'Desc' },
        currentPath: '1.1',
        indices: [0],
        drafts: [{ name: 'Task Repetitiva' }],
        chunkMinutes: [60],
      } as any);

      expect(result).toHaveLength(1);
    });
  });
});
