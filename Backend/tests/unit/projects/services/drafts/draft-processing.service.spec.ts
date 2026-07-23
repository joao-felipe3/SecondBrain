import { Test, TestingModule } from '@nestjs/testing';
import { DraftProcessingService } from '../../../../../src/projects/services/drafts/draft-processing.service';

describe('DraftProcessingService', () => {
  let service: DraftProcessingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DraftProcessingService],
    }).compile();

    service = module.get<DraftProcessingService>(DraftProcessingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('applyThemeWorkflowAndProgression', () => {
    it('deve aplicar progressão de fluxo por tema em rascunhos de microtarefas', () => {
      const drafts: any[] = [
        { name: 'Task 1', themeTag: 'Autenticação', microTaskType: 'prepare' },
        { name: 'Task 2', themeTag: 'Autenticação', microTaskType: 'produce' },
      ];

      const result = service.applyThemeWorkflowAndProgression(drafts);
      expect(result).toHaveLength(2);
      expect(result[0].microTaskType).toBe('prepare');
      expect(result[1].microTaskType).toBe('produce');
    });

    it('deve retornar array intacto se estiver vazio', () => {
      const result = service.applyThemeWorkflowAndProgression([]);
      expect(result).toEqual([]);
    });
  });
});
