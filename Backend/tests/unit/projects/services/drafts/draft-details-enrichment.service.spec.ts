import { Test, TestingModule } from '@nestjs/testing';
import { DraftDetailsEnrichmentService } from '../../../../../src/projects/services/drafts/draft-details-enrichment.service';
import { DraftsAiService } from '../../../../../src/ai/services/tasks/drafts-ai.service';

describe('DraftDetailsEnrichmentService', () => {
  let service: DraftDetailsEnrichmentService;
  let draftsAiMock: any;

  beforeEach(async () => {
    draftsAiMock = {
      generateDetails: jest.fn().mockResolvedValue([
        {
          definitionOfDone: 'Fazer deploy',
          checklist: ['Passo 1', 'Passo 2'],
          checklistSteps: ['Passo 1', 'Passo 2'],
          acceptanceCriteria: ['Critério 1'],
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftDetailsEnrichmentService,
        { provide: DraftsAiService, useValue: draftsAiMock },
      ],
    }).compile();

    service = module.get<DraftDetailsEnrichmentService>(DraftDetailsEnrichmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enrichOutlinesWithDetails', () => {
    it('deve enriquecer rascunhos de tarefas com detalhes de IA', async () => {
      const dto: any = {
        outlines: [
          {
            name: 'Task 1',
            microTaskType: 'prepare',
            pomodorosPlanned: 2,
            priority: 1,
            difficult: 1,
            themeTag: 'Auth',
            contextTag: 'medium',
            cognitiveMode: 'medium',
          },
        ],
        sliceMinutes: [50],
        params: { project: { name: 'Projeto' }, node: { name: 'Fase 1' } },
      };

      const result = await service.enrichOutlinesWithDetails(dto);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Task 1');
      expect(draftsAiMock.generateDetails).toHaveBeenCalled();
    });
  });
});
