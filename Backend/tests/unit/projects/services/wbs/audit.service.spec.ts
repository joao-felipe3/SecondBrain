import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../../../src/projects/services/wbs/core/audit.service';
import { WbsAiService } from '../../../../src/ai/services/projects/wbs-ai.service';

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
      providers: [
        AuditService,
        { provide: WbsAiService, useValue: mockWbsAiService },
      ],
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
          { name: 'Criar endpoint A', pomodorosPlanned: 2, priority: 2 },
          { name: 'Criar endpoint B', pomodorosPlanned: 2, priority: 2 },
        ],
      };

      const result = await service.auditLeafDiscrepancy(project, dto);

      expect(result.diagnosis).toBe('underestimated');
      expect(result.suggestedAction).toBe('rebaseline');
      expect(result.suggestedEstimatedHours).toBe(40);
      expect(mockWbsAiService.auditLeafDiscrepancy).toHaveBeenCalled();
    });

    it('deve aplicar guardrails e alterar recomendação em caso de gold_plating com alta redundância', async () => {
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
    });
  });
});
