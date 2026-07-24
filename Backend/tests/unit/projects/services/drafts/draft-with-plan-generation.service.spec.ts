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
      generateOutlineWithPlan: jest.fn().mockResolvedValue([
        { name: 'Outline Plan 1', pomodorosPlanned: 3 },
      ]),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockDetailsEnrichment = {
      enrichOutlinesWithDetails: jest.fn().mockResolvedValue([
        { name: 'Enriched Draft Plan 1', pomodorosPlanned: 3 },
      ]),
    };

    service = new DraftWithPlanGenerationService(
      mockDraftsAi,
      mockCacheService,
      mockDetailsEnrichment,
    );
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
});
