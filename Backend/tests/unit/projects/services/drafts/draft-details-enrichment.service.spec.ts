import { DraftDetailsEnrichmentService } from '@src/projects/services/drafts/draft-details-enrichment.service';

describe('DraftDetailsEnrichmentService', () => {
  let service: DraftDetailsEnrichmentService;
  let mockDraftsAi: any;

  beforeEach(() => {
    mockDraftsAi = {
      generateDetails: jest.fn().mockResolvedValue([
        {
          checklist: ['step 1', 'step 2'],
          definitionOfDone: 'done',
          description: 'desc',
        },
      ]),
      generateDetailsBatch: jest.fn().mockResolvedValue([
        {
          checklist: ['step 1', 'step 2'],
          definitionOfDone: 'done',
          description: 'desc',
        },
        {
          checklist: ['step 3', 'step 4'],
          definitionOfDone: 'done 2',
          description: 'desc 2',
        },
      ]),
    };

    service = new DraftDetailsEnrichmentService(mockDraftsAi);
  });

  it('should enrich outlines without batching when batch size is 1', async () => {
    process.env.WBS_DETAILS_BATCH_SIZE = '1';

    const outlines: any[] = [
      {
        name: 'Task 1',
        pomodorosPlanned: 2,
        priority: 2,
        difficult: 2,
        microTaskType: 'code',
        themeTag: 'tech',
        contextTag: 'dev',
        cognitiveMode: 'deep',
      },
    ];

    const result = await service.enrichOutlinesWithDetails({
      outlines,
      sliceMinutes: [60],
      params: {
        project: {},
        node: { name: 'N1', level: 1, estimatedHours: 2 },
        currentPath: 'path',
        level: 1,
      },
    });

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Task 1');
    expect(mockDraftsAi.generateDetails).toHaveBeenCalled();

    delete process.env.WBS_DETAILS_BATCH_SIZE;
  });

  it('should enrich outlines with batching when batch size > 1', async () => {
    process.env.WBS_DETAILS_BATCH_SIZE = '2';

    const outlines: any[] = [
      {
        name: 'Task 1',
        pomodorosPlanned: 2,
        priority: 2,
        difficult: 2,
        microTaskType: 'code',
        themeTag: 'tech',
        contextTag: 'dev',
        cognitiveMode: 'deep',
      },
      {
        name: 'Task 2',
        pomodorosPlanned: 2,
        priority: 2,
        difficult: 2,
        microTaskType: 'code',
        themeTag: 'tech',
        contextTag: 'dev',
        cognitiveMode: 'deep',
      },
    ];

    const result = await service.enrichOutlinesWithDetails({
      outlines,
      sliceMinutes: [60, 60],
      params: {
        project: {},
        node: { name: 'N1', level: 1, estimatedHours: 2 },
        currentPath: 'path',
        level: 1,
      },
    });

    expect(result.length).toBe(2);
    expect(mockDraftsAi.generateDetailsBatch).toHaveBeenCalled();

    delete process.env.WBS_DETAILS_BATCH_SIZE;
  });
});
