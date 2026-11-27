import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../../../../src/projects/services/wbs/core/audit.service';
import { WbsAiService } from '../../../../../src/ai/services/projects/wbs-ai.service';

describe('AuditService', () => {
  let service: AuditService;
  let mockWbsAiService: any;

  beforeEach(async () => {
    mockWbsAiService = {
      auditLeafDiscrepancy: jest.fn().mockResolvedValue({
        diagnosis: 'underestimated',
        rationale: 'Estimativa inicial foi conservadora.',
        suggestedAction: 'rebaseline',
        suggestedEstimatedHours: 40,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: WbsAiService, useValue: mockWbsAiService }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('auditLeafDiscrepancy', () => {
    it('deve realizar a auditoria de discrepância entre WBS e tarefas geradas', async () => {
      const project = { name: 'Projeto Alfa' };
      const dto: any = {
        leafNode: { name: 'Desenvolvimento Backend', estimatedHours: 20 },
        nodePath: '1.1',
        generatedHours: 40,
        tasks: [
          {
            name: 'Criar endpoint A (1/2)',
            pomodorosPlanned: 2,
            priority: 2,
            microTaskType: 'EXECUTION',
            themeTag: 'backend',
            contextTag: 'api',
            cognitiveMode: 'deep_work',
          },
          { name: 'Criar endpoint B', pomodorosPlanned: 2, priority: 2 },
        ],
      };

      const result = await service.auditLeafDiscrepancy(project, dto);

      expect(result.diagnosis).toBe('underestimated');
      expect(result.suggestedAction).toBe('rebaseline');
      expect(result.suggestedEstimatedHours).toBe(40);
      expect(mockWbsAiService.auditLeafDiscrepancy).toHaveBeenCalled();
    });

    describe('discrepância dentro do limiar (auditoria automática)', () => {
      const project = { name: 'Projeto Alfa' };
      const mk = (names: string[]): any => ({
        leafNode: { name: 'Estudos', estimatedHours: 10 },
        nodePath: '1.1',
        generatedHours: 10,
        tasks: names.map((name) => ({ name, pomodorosPlanned: 2 })),
      });

      it('aponta repetição sem chamar a IA e sugere remover + completar', async () => {
        const result = await service.auditLeafDiscrepancy(
          project,
          mk([
            'Revisar deck',
            'Revisar deck',
            'Revisar deck',
            'Revisar deck',
            'Criar cartões',
            'Praticar áudio',
          ]),
        );
        expect(result.diagnosis).toBe('repetitive');
        expect(result.suggestedAction).toBe('regenerate');
        expect(mockWbsAiService.auditLeafDiscrepancy).not.toHaveBeenCalled();
      });

      it('não avisa por poucas repetições soltas (2 de 60 ≈ 3%)', async () => {
        const names = Array.from(
          { length: 58 },
          (_, i) => `Tarefa única ${String.fromCharCode(97 + (i % 26))}${'xyz'[i % 3]}${i}`,
        );
        const result = await service.auditLeafDiscrepancy(
          project,
          mk([...names, 'Tarefa única repetida', 'Tarefa única repetida']),
        );
        expect(result.diagnosis).toBe('ok');
      });

      it('não confunde "capítulo 1" com "capítulo 2" como repetição', async () => {
        const names = Array.from({ length: 12 }, (_, i) => `Ler capítulo ${i + 1} do livro`);
        const result = await service.auditLeafDiscrepancy(project, mk(names));
        expect(result.diagnosis).toBe('ok');
      });

      it('retorna "ok" quando não há repetição relevante', async () => {
        const result = await service.auditLeafDiscrepancy(
          project,
          mk(['Revisar deck', 'Criar cartões', 'Praticar áudio', 'Escrever resumo']),
        );
        expect(result.diagnosis).toBe('ok');
        expect(result.suggestedAction).toBe('none');
        expect(mockWbsAiService.auditLeafDiscrepancy).not.toHaveBeenCalled();
      });
    });

    describe('discrepância negativa (gerado < orçado)', () => {
      const project = { name: 'Projeto Alfa' };
      const dto: any = {
        leafNode: { name: 'Estudos', estimatedHours: 80 },
        nodePath: '1.1',
        generatedHours: 40,
        tasks: [{ name: 'Ler capítulo 1', pomodorosPlanned: 2 }],
      };

      it('mantém "incomplete" com ação regenerate', async () => {
        mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
          diagnosis: 'incomplete',
          rationale: 'Faltam temas.',
          suggestedAction: 'regenerate',
          suggestedEstimatedHours: 40,
        });
        const result = await service.auditLeafDiscrepancy(project, dto);
        expect(result.diagnosis).toBe('incomplete');
        expect(result.suggestedAction).toBe('regenerate');
        expect(result.suggestedEstimatedHours).toBeUndefined();
      });

      it('mantém "overestimated" com rebaseline para baixo', async () => {
        mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
          diagnosis: 'overestimated',
          rationale: 'Escopo coberto.',
          suggestedAction: 'rebaseline',
          suggestedEstimatedHours: 40,
        });
        const result = await service.auditLeafDiscrepancy(project, dto);
        expect(result.diagnosis).toBe('overestimated');
        expect(result.suggestedAction).toBe('rebaseline');
        expect(result.suggestedEstimatedHours).toBe(40);
      });

      it('corrige diagnóstico de excesso devolvido pela IA para uma discrepância negativa', async () => {
        mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
          diagnosis: 'gold_plating',
          rationale: 'x',
          suggestedAction: 'simplify',
        });
        const result = await service.auditLeafDiscrepancy(project, dto);
        expect(result.diagnosis).toBe('overestimated');
        expect(result.suggestedAction).toBe('rebaseline');
      });

      it('não aceita "incomplete" quando a discrepância é positiva', async () => {
        mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
          diagnosis: 'incomplete',
          rationale: 'x',
          suggestedAction: 'regenerate',
        });
        const result = await service.auditLeafDiscrepancy(project, {
          ...dto,
          leafNode: { name: 'Estudos', estimatedHours: 20 },
          generatedHours: 40,
        });
        expect(result.diagnosis).toBe('underestimated');
        expect(result.suggestedAction).toBe('rebaseline');
      });
    });

    it('deve aplicar guardrails e alterar recomendação em caso de gold_plating com forte redundância e diffPct >= 90', async () => {
      mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
        diagnosis: 'underestimated',
        rationale: 'Parece subestimado',
        suggestedAction: 'rebaseline',
        suggestedEstimatedHours: 100,
      });

      const project = { name: 'Projeto Alfa' };
      const dto: any = {
        leafNode: { name: 'Desenvolvimento Backend', estimatedHours: 10 },
        nodePath: '1.1',
        generatedHours: 50, // +400% diff
        tasks: [
          { name: 'Tarefa duplicada', pomodorosPlanned: 4 },
          { name: 'Tarefa duplicada', pomodorosPlanned: 4 },
          { name: 'Tarefa duplicada', pomodorosPlanned: 4 },
          { name: 'Tarefa duplicada', pomodorosPlanned: 4 },
        ],
      };

      const result = await service.auditLeafDiscrepancy(project, dto);

      expect(result.diagnosis).toBe('gold_plating');
      expect(result.suggestedAction).toBe('simplify');
      expect(result.rationale).toContain('[Guardrails]');
    });

    it('deve lidar com budgetHours zero e lista de tarefas vazia sem quebrar', async () => {
      const project = {};
      const dto: any = {
        leafNode: { name: '', estimatedHours: 0 },
        nodePath: '',
        generatedHours: 10,
        tasks: null,
      };

      const result = await service.auditLeafDiscrepancy(project, dto);
      expect(result).toBeDefined();
    });

    it('deve respeitar WBS_GEMINI_MODEL override do environment', async () => {
      process.env.WBS_GEMINI_MODEL = 'gemini-2.0-flash';
      const project = { name: 'Projeto' };
      const dto: any = {
        leafNode: { name: 'Leaf 1', estimatedHours: 10 },
        tasks: [],
      };

      await service.auditLeafDiscrepancy(project, dto);
      expect(mockWbsAiService.auditLeafDiscrepancy).toHaveBeenCalledWith(
        expect.objectContaining({ modelOverride: 'gemini-2.0-flash' }),
      );
      delete process.env.WBS_GEMINI_MODEL;
    });

    it('deve aplicar guardrail quando diagnosis inicial é gold_plating mas a redundância é baixa e diffPct <= 90', async () => {
      mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
        diagnosis: 'gold_plating',
        rationale: 'Excesso de itens',
        suggestedAction: 'simplify',
        suggestedEstimatedHours: 15,
      });

      const project = { name: 'Projeto' };
      const dto: any = {
        leafNode: { name: 'Node 1', estimatedHours: 10 },
        generatedHours: 15, // 50% diff
        tasks: [
          { name: 'Tarefa A única', themeTag: 't1', microTaskType: 'code' },
          { name: 'Tarefa B distinta', themeTag: 't2', microTaskType: 'test' },
          { name: 'Tarefa C variada', themeTag: 't3', microTaskType: 'doc' },
          { name: 'Tarefa D diferente', themeTag: 't4', microTaskType: 'review' },
          { name: 'Tarefa E inovadora', themeTag: 't5', microTaskType: 'deploy' },
          { name: 'Tarefa F criativa', themeTag: 't6', microTaskType: 'monitor' },
        ],
      };

      const result = await service.auditLeafDiscrepancy(project, dto);
      expect(result.diagnosis).toBe('underestimated');
      expect(result.suggestedAction).toBe('rebaseline');
    });

    it('deve aplicar guardrail para lowRedundancy com diffPct >= 120 convertendo para underestimated/rebaseline', async () => {
      mockWbsAiService.auditLeafDiscrepancy.mockResolvedValueOnce({
        diagnosis: 'mixed',
        rationale: 'Misto',
        suggestedAction: 'simplify',
        suggestedEstimatedHours: 30,
      });

      const project = { name: 'Projeto' };
      const dto: any = {
        leafNode: { name: 'Node 1', estimatedHours: 10 },
        generatedHours: 30, // 200% diff
        tasks: [
          { name: 'Tarefa A', themeTag: 't1' },
          { name: 'Tarefa B', themeTag: 't2' },
          { name: 'Tarefa C', themeTag: 't3' },
        ],
      };

      const result = await service.auditLeafDiscrepancy(project, dto);
      expect(result.diagnosis).toBe('underestimated');
      expect(result.suggestedAction).toBe('rebaseline');
    });
  });
});
