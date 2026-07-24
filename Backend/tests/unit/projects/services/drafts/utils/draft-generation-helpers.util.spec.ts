import {
  safeString,
  safeStringOrUndefined,
  validateDraftOutlines,
  validateDraftDetails,
  validatePlannerPlan,
  validateDrafts,
  safeEnv,
  isTimingDebugEnabled,
  logWithTimestamp,
  getNumericEnv,
  isTwoPassEnabled,
  isCacheDebugEnabled,
  getProjectId,
  hashKey,
  buildDraftsCacheKey,
  getWbsGenerationModelOverride,
  getDetailsModelOverride,
  mapWithConcurrency,
  createBatches,
  assembleEnrichedBatches,
  isJsonishError,
  getConcurrencyParams,
} from '@src/projects/services/drafts/utils/draft-generation-helpers.util';

describe('draft-generation-helpers.util', () => {
  it('safeString & safeStringOrUndefined', () => {
    expect(safeString('text')).toBe('text');
    expect(safeString(123)).toBe('123');
    expect(safeString(null)).toBe('');

    expect(safeStringOrUndefined('text')).toBe('text');
    expect(safeStringOrUndefined(undefined)).toBeUndefined();
  });

  it('validateDraftOutlines & validateDrafts', () => {
    const outlines = [
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

    expect(validateDraftOutlines(outlines).length).toBe(1);
    expect(() => validateDraftOutlines([{ invalid: true }])).toThrow('Outlines inválidos');

    const drafts = [
      {
        name: 'Draft 1',
        description: 'Desc',
        checklist: ['s1', 's2'],
        definitionOfDone: 'DoD',
        pomodorosPlanned: 2,
        priority: 2,
        difficult: 2,
        microTaskType: 'code',
        themeTag: 'tech',
        contextTag: 'dev',
        cognitiveMode: 'deep',
      },
    ];

    expect(validateDrafts(drafts).length).toBe(1);
    expect(() => validateDrafts([{ invalid: true }])).toThrow('Drafts inválidos');
  });

  it('validateDraftDetails & validatePlannerPlan', () => {
    const details = {
      checklist: ['step 1', 'step 2'],
      definitionOfDone: 'DoD',
    };
    expect(validateDraftDetails(details).definitionOfDone).toBe('DoD');

    const plan = {
      themes: [{ name: 'Theme 1' }],
      workflow: ['dev'],
    };
    expect(validatePlannerPlan(plan).themes.length).toBe(1);
  });

  it('env helpers & model overrides & logWithTimestamp', () => {
    process.env.TEST_NUM = '10';
    process.env.WBS_TWO_PASS_DETAILS = 'true';
    process.env.WBS_TIMING_DEBUG = 'true';
    process.env.WBS_CACHE_DEBUG = 'true';
    process.env.WBS_GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.WBS_DETAILS_MODEL = 'gemini-2.5-pro';

    expect(safeEnv('TEST_NUM')).toBe('10');
    expect(getNumericEnv('TEST_NUM', 5)).toBe(10);
    expect(isTwoPassEnabled()).toBe(true);
    expect(isTimingDebugEnabled()).toBe(true);
    expect(isCacheDebugEnabled()).toBe(true);
    expect(getWbsGenerationModelOverride()).toBe('gemini-2.5-flash');
    expect(getDetailsModelOverride()).toBe('gemini-2.5-pro');

    logWithTimestamp('Test debug log');

    delete process.env.TEST_NUM;
    delete process.env.WBS_TWO_PASS_DETAILS;
    delete process.env.WBS_TIMING_DEBUG;
    delete process.env.WBS_CACHE_DEBUG;
    delete process.env.WBS_GEMINI_MODEL;
    delete process.env.WBS_DETAILS_MODEL;
  });

  it('getProjectId & hashing', () => {
    expect(getProjectId(null)).toBe('');
    expect(getProjectId('p123')).toBe('p123');
    expect(getProjectId({ _id: 'p456' })).toBe('p456');
    expect(getProjectId({ id: 'p789' })).toBe('p789');
    expect(getProjectId({ id: { toString: () => 'obj123' } })).toBe('obj123');

    const h = hashKey('test');
    expect(h.length).toBe(16);

    const key = buildDraftsCacheKey({ prefix: 'drafts', projectId: 'p1', fingerprint: 'fp' });
    expect(key).toContain('drafts:p1:');
  });

  it('mapWithConcurrency & batching helpers', async () => {
    const items = [1, 2, 3, 4];
    const mapped = await mapWithConcurrency(items, 2, async (x) => x * 2);
    expect(mapped).toEqual([2, 4, 6, 8]);

    const outlines: any[] = [{ name: 'O1' }, { name: 'O2' }];
    const batches = createBatches(outlines, [60, 60], 1);
    expect(batches.length).toBe(2);

    const batchResults: any[] = [
      { start: 0, detailsList: [{ description: 'd1' }] },
      { start: 1, detailsList: [{ description: 'd2' }] },
    ];
    const enriched = assembleEnrichedBatches(outlines, batchResults);
    expect(enriched[0].description).toBe('d1');
  });

  it('isJsonishError', () => {
    expect(isJsonishError(new Error('JSON parse error'))).toBe(true);
    expect(isJsonishError('Incomplete array response')).toBe(true);
    expect(isJsonishError({ message: 'JSON invalid format' })).toBe(true);
    expect(isJsonishError(new Error('Database disconnected'))).toBe(false);
  });

  it('getConcurrencyParams', () => {
    process.env.WBS_DETAILS_BATCH_SIZE = '2';
    const params = getConcurrencyParams();
    expect(params.detailsConcurrency).toBeGreaterThan(0);
    delete process.env.WBS_DETAILS_BATCH_SIZE;
  });
});
