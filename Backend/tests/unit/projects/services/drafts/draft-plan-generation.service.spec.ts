import { Test, TestingModule } from '@nestjs/testing';
import { DraftPlanGenerationService } from '../../../../../src/projects/services/drafts/draft-plan-generation.service';
import { DraftsAiService } from '../../../../../src/ai/services/tasks/drafts-ai.service';
import { ThemeExtractionService, CacheService } from '../../../../../src/projects/services/wbs';

describe('DraftPlanGenerationService', () => {
  let service: DraftPlanGenerationService;
  let draftsAiMock: any;
  let themeExtractionMock: any;
  let cacheServiceMock: any;

  beforeEach(async () => {
    draftsAiMock = {
      generatePlan: jest.fn().mockResolvedValue({
        themes: [{ name: 'Autenticação' }],
        workflow: ['execute'],
      }),
    };

    themeExtractionMock = {
      getThemeSuggestionsForLeaf: jest.fn().mockResolvedValue({ themes: ['Auth'] }),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftPlanGenerationService,
        { provide: DraftsAiService, useValue: draftsAiMock },
        { provide: ThemeExtractionService, useValue: themeExtractionMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<DraftPlanGenerationService>(DraftPlanGenerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateMicroTasksPlanForLeaf', () => {
    it('deve gerar plano de micro-tarefas para folha WBS', async () => {
      const params: any = {
        project: { _id: 'p-1' },
        node: { _id: 'n-1', name: 'Node 1', estimatedHours: 8 },
      };

      const result = await service.generateMicroTasksPlanForLeaf(params);

      expect(result).toBeDefined();
      expect(result.themes).toHaveLength(1);
      expect(draftsAiMock.generatePlan).toHaveBeenCalled();
    });

    it('deve retornar plano do cache se existente', async () => {
      cacheServiceMock.get.mockResolvedValueOnce({
        themes: [{ name: 'Cached Theme' }],
        workflow: ['execute'],
      });

      const params: any = {
        project: { _id: 'p-1' },
        node: { _id: 'n-1', name: 'Node 1', estimatedHours: 8 },
      };

      const result = await service.generateMicroTasksPlanForLeaf(params);

      expect(result.themes[0].name).toBe('Cached Theme');
      expect(draftsAiMock.generatePlan).not.toHaveBeenCalled();
    });
  });
});
