import { Test, TestingModule } from '@nestjs/testing';
import { WbsAiService } from '../../../../../src/ai/services/projects/wbs-ai.service';
import { GeminiExecutorService } from '../../../../../src/ai/services/core/gemini-executor.service';

describe('WbsAiService', () => {
  let service: WbsAiService;
  let mockGeminiExecutor: {
    generateContent: jest.Mock;
  };

  beforeEach(async () => {
    mockGeminiExecutor = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WbsAiService, { provide: GeminiExecutorService, useValue: mockGeminiExecutor }],
    }).compile();

    service = module.get<WbsAiService>(WbsAiService);
  });

  describe('generateWbs', () => {
    it('deve gerar nós WBS a partir de um objetivo SMART com markdown code block', async () => {
      const responseJson = '```json\n[{"name": "Fase 1", "estimatedHours": 20}]\n```';
      mockGeminiExecutor.generateContent.mockResolvedValue(responseJson);

      const nodes = await service.generateWbs({ title: 'Novo Sistema' } as any);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe('Fase 1');
    });

    it('deve gerar nós WBS a partir de JSON limpo sem markdown', async () => {
      const responseJson = '[{"name": "Fase 1", "estimatedHours": 20}]';
      mockGeminiExecutor.generateContent.mockResolvedValue(responseJson);

      const nodes = await service.generateWbs({ title: 'Novo Sistema' } as any);
      expect(nodes).toHaveLength(1);
    });

    it('deve lancar erro se o retorno nao for um array JSON', async () => {
      mockGeminiExecutor.generateContent.mockResolvedValue('{"not": "an array"}');
      await expect(service.generateWbs({ title: 'Novo Sistema' } as any)).rejects.toThrow(
        'Não foi possível gerar a WBS com IA',
      );
    });

    it('deve lancar erro se generateContent falhar', async () => {
      mockGeminiExecutor.generateContent.mockRejectedValue(new Error('API fail'));
      await expect(service.generateWbs({ title: 'Novo Sistema' } as any)).rejects.toThrow(
        'Não foi possível gerar a WBS com IA',
      );
    });
  });

  describe('suggestDecomposition', () => {
    it('deve gerar sugestao de decomposicao', async () => {
      mockGeminiExecutor.generateContent.mockResolvedValue('Sugestao: dividir em 2 nos de 40h');

      const result = await service.suggestDecomposition({
        name: 'Node Grande',
        estimatedHours: 120,
      });

      expect(result).toBe('Sugestao: dividir em 2 nos de 40h');
    });

    it('deve lancar erro se generateContent falhar em suggestDecomposition', async () => {
      mockGeminiExecutor.generateContent.mockRejectedValue(new Error('Fail'));
      await expect(
        service.suggestDecomposition({
          name: 'Node',
          estimatedHours: 100,
        }),
      ).rejects.toThrow('Não foi possível gerar sugestão de decomposição');
    });
  });

  describe('auditLeafDiscrepancy', () => {
    it('deve auditar discrepancia de folha e retornar diagnostico estruturado com horas em string com virgula', async () => {
      const jsonResponse = JSON.stringify({
        diagnosis: 'gold_plating',
        suggestedAction: 'simplify',
        rationale: 'Muitos passos desnecessarios',
        suggestedEstimatedHours: '15,5h',
      });

      mockGeminiExecutor.generateContent.mockResolvedValue(jsonResponse);

      const audit = await service.auditLeafDiscrepancy({
        leafNodeName: 'Leaf 1',
        nodePath: '1.1',
        budgetHours: 10,
        generatedHours: 15,
        diffPct: 50,
        taskCount: 5,
        duplicateRatio: 0.1,
        topDuplicateKeys: 't1',
        dupScore: 0.2,
        similarScore: 0.1,
        tasksPreview: 'p',
      } as any);

      expect(audit.diagnosis).toBe('gold_plating');
      expect(audit.suggestedAction).toBe('simplify');
      expect(audit.suggestedEstimatedHours).toBe(15.5);
    });

    it('deve lidar com diagnostico mixed e retentativa em caso de erro na primeira chamada', async () => {
      mockGeminiExecutor.generateContent
        .mockRejectedValueOnce(new Error('Tokens exceeded'))
        .mockResolvedValueOnce(
          JSON.stringify({
            diagnosis: 'mixed',
            suggestedAction: 'rebaseline',
            rationale: 'Misto',
            suggestedEstimatedHours: 20,
          }),
        );

      const audit = await service.auditLeafDiscrepancy({
        leafNodeName: 'Leaf 1',
        nodePath: '1.1',
        budgetHours: 10,
        generatedHours: 20,
        diffPct: 100,
        taskCount: 4,
        duplicateRatio: 0,
        topDuplicateKeys: '',
        dupScore: 0,
        similarScore: 0,
        tasksPreview: 'p',
      } as any);

      expect(audit.diagnosis).toBe('mixed');
      expect(audit.suggestedAction).toBe('rebaseline');
      expect(audit.suggestedEstimatedHours).toBe(20);
    });

    it('deve lidar com campos vazios e suggestedEstimatedHours inválido', async () => {
      mockGeminiExecutor.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          diagnosis: 'unknown',
          suggestedAction: 'unknown',
          suggestedEstimatedHours: 'sem horas',
        }),
      );

      const audit = await service.auditLeafDiscrepancy({
        leafNodeName: 'Leaf',
        nodePath: '',
        budgetHours: 10,
        generatedHours: 10,
        diffPct: 0,
        taskCount: 1,
        duplicateRatio: 0,
        topDuplicateKeys: '',
        dupScore: 0,
        similarScore: 0,
        tasksPreview: '',
      } as any);
      expect(audit.diagnosis).toBe('underestimated');
      expect(audit.suggestedAction).toBe('rebaseline');
      expect(audit.suggestedEstimatedHours).toBeUndefined();
    });
  });

  describe('fixMonotonyBatch', () => {
    it('deve corrigir lote de tarefas monotonas', async () => {
      const jsonResponse = JSON.stringify([{ name: 'Task Diversificada' }]);
      mockGeminiExecutor.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.fixMonotonyBatch({
        node: { name: 'Leaf 1', description: 'Desc' },
        currentPath: '1.1',
        indices: [0],
        drafts: [{ name: 'Task Repetitiva' }],
        chunkMinutes: [60],
      } as any);

      expect(result).toHaveLength(1);
    });

    it('deve retentar fixMonotonyBatch quando primeira tentativa dá erro de JSON', async () => {
      mockGeminiExecutor.generateContent
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce(JSON.stringify([{ name: 'Task Retentada' }]));

      const result = await service.fixMonotonyBatch({
        node: { name: 'Leaf 1' },
        indices: [0],
        drafts: [{}],
        chunkMinutes: [60],
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Task Retentada');
    });

    it('deve repassar erro se nao for erro de JSON', async () => {
      mockGeminiExecutor.generateContent.mockRejectedValueOnce(new Error('Network fatal error'));

      await expect(
        service.fixMonotonyBatch({
          node: { name: 'Leaf 1' },
          indices: [0],
          drafts: [{}],
          chunkMinutes: [60],
        } as any),
      ).rejects.toThrow('Network fatal error');
    });
  });
});
