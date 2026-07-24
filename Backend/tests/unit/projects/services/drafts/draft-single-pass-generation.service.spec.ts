import { DraftSinglePassGenerationService } from '@src/projects/services/drafts/draft-single-pass-generation.service';

describe('DraftSinglePassGenerationService', () => {
  let service: DraftSinglePassGenerationService;
  let mockDraftsAi: any;
  let mockCacheService: any;
  let mockDetailsEnrichment: any;

  beforeEach(() => {
    mockDraftsAi = {
      generateSinglePassWithoutPlan: jest.fn().mockResolvedValue([
        {
          name: 'Draft 1',
          description: 'Desc 1',
          pomodorosPlanned: 2,
          priority: 2,
        },
      ]),
      generateOutlineWithoutPlan: jest.fn().mockResolvedValue([
        { name: 'Outline 1', pomodorosPlanned: 2 },
      ]),
    };

    mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockDetailsEnrichment = {
      enrichOutlinesWithDetails: jest.fn().mockResolvedValue([
        { name: 'Enriched Draft 1', pomodorosPlanned: 2 },
      ]),
    };

    service = new DraftSinglePassGenerationService(
      mockDraftsAi,
      mockCacheService,
      mockDetailsEnrichment,
    );
  });

  it('should generate drafts in single-pass mode when cache misses', async () => {
    delete process.env.WBS_TWO_PASS_DETAILS;

    const dto: any = {
      context: {
        project: { _id: 'proj123' },
        node: { _id: 'node1', name: 'Node 1' },
      },
      chunkMinutes: [60],
    };

    const drafts = await service.generateMicroTasksDraftsForLeaf(dto);

    expect(drafts.length).toBe(1);
    expect(drafts[0].name).toBe('Draft 1');
    expect(mockDraftsAi.generateSinglePassWithoutPlan).toHaveBeenCalled();
    expect(mockCacheService.set).toHaveBeenCalled();
  });

  it('should return cached drafts when cache hits', async () => {
    mockCacheService.get.mockResolvedValueOnce([{ name: 'Cached Draft', pomodorosPlanned: 1 }]);

    const dto: any = {
      context: {
        project: { _id: 'proj123' },
        node: { _id: 'node1', name: 'Node 1' },
      },
      chunkMinutes: [60],
    };

    const drafts = await service.generateMicroTasksDraftsForLeaf(dto);
    expect(drafts.length).toBe(1);
    expect(drafts[0].name).toBe('Cached Draft');
    expect(mockDraftsAi.generateSinglePassWithoutPlan).not.toHaveBeenCalled();
  });
});
