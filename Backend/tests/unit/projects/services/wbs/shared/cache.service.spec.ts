import { CacheService } from '@src/projects/services/wbs/shared/cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.WBS_CACHE_DEBUG = 'true';
    cacheService = new CacheService();
  });

  afterEach(() => {
    delete process.env.WBS_CACHE_DEBUG;
  });

  it('should default to in-memory backend when REDIS_URL is not set', () => {
    expect(cacheService.getBackendName()).toBe('memory');
  });

  it('should set and get values from in-memory cache', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await cacheService.set('drafts:proj1:key1', { test: 123 });
    const val = await cacheService.get<{ test: number }>('drafts:proj1:key1');

    expect(val).toEqual({ test: 123 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CacheService][cache:set]'),
      expect.anything(),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CacheService][cache:hit]'),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  it('should return null for missing or expired keys', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const missing = await cacheService.get('nonexistent');
    expect(missing).toBeNull();

    // Set item with past expiration
    await cacheService.set('expiredKey', 'value');
    (cacheService as any).draftsCache.set('expiredKey', { value: 'value', exp: Date.now() - 1000 });

    const expired = await cacheService.get('expiredKey');
    expect(expired).toBeNull();

    consoleSpy.mockRestore();
  });

  it('should clear project drafts from in-memory cache', async () => {
    await cacheService.set('drafts:proj99:a', { data: 1 });
    await cacheService.set('drafts_with_plan:proj99:b', { data: 2 });
    await cacheService.set('drafts:proj100:c', { data: 3 });

    await cacheService.clearForProject('proj99');

    expect(await cacheService.get('drafts:proj99:a')).toBeNull();
    expect(await cacheService.get('drafts_with_plan:proj99:b')).toBeNull();
    expect(await cacheService.get('drafts:proj100:c')).toEqual({ data: 3 });
  });
});
