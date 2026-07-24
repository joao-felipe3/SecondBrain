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

  it('should handle Redis operations when redisClient is attached', async () => {
    const mockRedis: any = {
      get: jest.fn().mockImplementation((key) =>
        Promise.resolve(key === 'redisKey' ? JSON.stringify({ redis: true }) : null),
      ),
      set: jest.fn().mockResolvedValue('OK'),
      scan: jest
        .fn()
        .mockResolvedValueOnce(['0', ['drafts:proj88:k1']])
        .mockResolvedValueOnce(['0', ['drafts_with_plan:proj88:k2']]),
      del: jest.fn().mockResolvedValue(1),
    };

    (cacheService as any).redisClient = mockRedis;

    expect(cacheService.getBackendName()).toBe('redis');

    const res = await cacheService.get('redisKey');
    expect(res).toEqual({ redis: true });

    const miss = await cacheService.get('missKey');
    expect(miss).toBeNull();

    await cacheService.set('redisKey', { redis: true });
    expect(mockRedis.set).toHaveBeenCalled();

    await cacheService.clearForProject('proj88');
    expect(mockRedis.del).toHaveBeenCalled();
  });
});
