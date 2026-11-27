import { DraftWithPlanGenerationService } from '@src/projects/services/drafts/draft-with-plan-generation.service';

describe('DraftWithPlanGenerationService', () => {
  let service: DraftWithPlanGenerationService;
  let mockDraftsAi: any;
  let mockCacheService: any;
  let mockDetailsEnrichment: any;

  beforeEach(() => {
    mockDraftsAi = {
      generateSinglePassWithPlan: jest.fn().mockResolvedValue([
        {
          name: 'Draft with Plan 1',
          description: 'Desc Plan 1',
          pomodorosPlanned: 3,
        },
      ]),
      generateOutlineWithPlan: jest
        .fn()
        .mockResolvedValue([{ name: 'Outline Plan 1', pomodorosPlanned: 3 }]),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockDetailsEnrichment = {
      enrichOutlinesWithDetails: jest
        .fn()
        .mockResolvedValue([{ name: 'Enriched Draft Plan 1', pomodorosPlanned: 3 }]),
    };

    service = new DraftWithPlanGenerationService(mockDraftsAi, mockCacheService, mockDetailsEnrichment);
  });

  it('should generate drafts with plan in single-pass mode when cache misses', async () => {
    delete process.env.WBS_TWO_PASS_DETAILS;

    const dto: any = {
      context: {
        project: { _id: 'proj123' },
        node: { _id: 'node1', name: 'Node 1' },
        plan: { focus: 'Testing Plan' },
      },
      chunkMinutes: [60],
    };

    const drafts = await service.generateMicroTasksDraftsForLeafWithPlan(dto);

    expect(drafts.length).toBe(1);
    expect(drafts[0].name).toBe('Draft with Plan 1');
    expect(mockDraftsAi.generateSinglePassWithPlan).toHaveBeenCalled();
    expect(mockCacheService.set).toHaveBeenCalled();
  });

  describe('unicidade de títulos (two-pass)', () => {
    const dto = (extra: any = {}): any => ({
      context: {
        project: { _id: 'proj123' },
        node: { _id: 'node1', name: 'Node 1' },
        plan: { focus: 'Plan' },
      },
      chunkMinutes: [60, 60, 60],
      ...extra,
    });

    beforeEach(() => {
      process.env.WBS_TWO_PASS_DETAILS = 'true';
      mockDetailsEnrichment.enrichOutlinesWithDetails.mockImplementation(({ outlines }: any) =>
        Promise.resolve(outlines.map((o: any) => ({ ...o, pomodorosPlanned: 2 }))),
      );
    });
    afterEach(() => {
      delete process.env.WBS_TWO_PASS_DETAILS;
    });

    it('pede de novo só os títulos repetidos, proibindo os já usados', async () => {
      mockDraftsAi.generateOutlineWithPlan
        .mockResolvedValueOnce([{ name: 'Criar deck' }, { name: 'Criar deck' }, { name: 'Ler texto' }])
        .mockResolvedValueOnce([{ name: 'Gravar áudio' }]);

      const drafts = await service.generateMicroTasksDraftsForLeafWithPlan(dto());

      expect(drafts.map((d) => d.name)).toEqual(['Criar deck', 'Gravar áudio', 'Ler texto']);
      expect(mockDraftsAi.generateOutlineWithPlan).toHaveBeenCalledTimes(2);
      const [, retryMinutes, forbidden] = mockDraftsAi.generateOutlineWithPlan.mock.calls[1];
      expect(retryMinutes).toEqual([60]);
      expect(forbidden).toEqual(expect.arrayContaining(['Criar deck', 'Ler texto']));
    });

    it('trata como repetido o título igual a uma tarefa já existente (complemento)', async () => {
      mockDraftsAi.generateOutlineWithPlan
        .mockResolvedValueOnce([{ name: 'Revisar vocabulário' }, { name: 'Novo A' }, { name: 'Novo B' }])
        .mockResolvedValueOnce([{ name: 'Novo C' }]);

      const drafts = await service.generateMicroTasksDraftsForLeafWithPlan(
        dto({ avoidTaskTitles: ['revisar vocabulario'] }),
      );

      expect(drafts.map((d) => d.name)).toEqual(['Novo C', 'Novo A', 'Novo B']);
    });

    it('mantém os títulos se a nova tentativa falhar', async () => {
      mockDraftsAi.generateOutlineWithPlan
        .mockResolvedValueOnce([{ name: 'Igual' }, { name: 'Igual' }, { name: 'Outro' }])
        .mockRejectedValueOnce(new Error('quota'));

      const drafts = await service.generateMicroTasksDraftsForLeafWithPlan(dto());
      expect(drafts).toHaveLength(3);
    });

    it('não confunde "capítulo 1" com "capítulo 2"', async () => {
      mockDraftsAi.generateOutlineWithPlan.mockResolvedValueOnce([
        { name: 'Ler capítulo 1' },
        { name: 'Ler capítulo 2' },
        { name: 'Ler capítulo 3 (3/3)' },
      ]);
      await service.generateMicroTasksDraftsForLeafWithPlan(dto());
      expect(mockDraftsAi.generateOutlineWithPlan).toHaveBeenCalledTimes(1);
    });
  });
});
