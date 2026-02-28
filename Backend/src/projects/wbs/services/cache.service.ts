import { Injectable } from '@nestjs/common';

/**
 * Manages caching for WBS drafts using Redis (preferred) or in-memory fallback
 */
@Injectable()
export class CacheService {
  private draftsCache = new Map<string, { value: any; exp: number }>();
  private redisClient: any = null;
  private cacheTTLSeconds = 60 * 60 * 24; // 24h

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        // Dynamically require to avoid hard dependency at compile-time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const IORedis = require('ioredis');
        this.redisClient = new IORedis(redisUrl);
        console.log('[CacheService] Redis cache enabled');
      }
    } catch (err) {
      // Redis not available — fallback to in-memory cache
      this.redisClient = null;
    }
  }

  private isCacheDebugEnabled(): boolean {
    const v = String(process.env.WBS_CACHE_DEBUG || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  getBackendName(): 'redis' | 'memory' {
    return this.redisClient ? 'redis' : 'memory';
  }

  private cacheBackendName(): 'redis' | 'memory' {
    return this.getBackendName();
  }

  private logCache(event: 'hit' | 'miss' | 'set' | 'clear', key: string, extra?: Record<string, any>): void {
    if (!this.isCacheDebugEnabled()) return;
    const payload = {
      backend: this.cacheBackendName(),
      keyPrefix: String(key).split(':').slice(0, 3).join(':'),
      keyLen: String(key).length,
      ...(extra || {}),
    };
    // eslint-disable-next-line no-console
    console.log(`[CacheService][cache:${event}]`, payload);
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.redisClient) {
        const raw = await this.redisClient.get(key);
        if (!raw) {
          this.logCache('miss', key);
          return null;
        }
        this.logCache('hit', key);
        return JSON.parse(raw) as T;
      }
    } catch (err) {
      // ignore redis errors
    }

    const entry = this.draftsCache.get(key);
    if (!entry) {
      this.logCache('miss', key);
      return null;
    }
    if (Date.now() > entry.exp) {
      this.draftsCache.delete(key);
      this.logCache('miss', key, { expired: true });
      return null;
    }
    this.logCache('hit', key);
    return entry.value as T;
  }

  async set(key: string, value: any): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', this.cacheTTLSeconds);
        this.logCache('set', key, { ttlSeconds: this.cacheTTLSeconds, items: value?.length || 0 });
        return;
      }
    } catch (err) {
      // ignore redis errors
    }

    const exp = Date.now() + this.cacheTTLSeconds * 1000;
    this.draftsCache.set(key, { value, exp });
    this.logCache('set', key, { ttlSeconds: this.cacheTTLSeconds, items: value?.length || 0 });
  }

  /**
   * Clear cached drafts for a project (both plain and plan-based keys)
   */
  async clearForProject(projectId: string): Promise<void> {
    const prefix1 = `drafts:${projectId}:`;
    const prefix2 = `drafts_with_plan:${projectId}:`;
    
    try {
      if (this.redisClient) {
        // Use SCAN to iterate keys safely
        let cursor = '0';
        let deleted = 0;
        
        do {
          // scan for prefix1
          const [next, keys] = await this.redisClient.scan(cursor, 'MATCH', `${prefix1}*`, 'COUNT', 100);
          cursor = next;
          if (keys && keys.length) {
            await Promise.all(keys.map((k: string) => this.redisClient.del(k)));
            deleted += keys.length;
          }
        } while (cursor !== '0');

        cursor = '0';
        do {
          const [next, keys] = await this.redisClient.scan(cursor, 'MATCH', `${prefix2}*`, 'COUNT', 100);
          cursor = next;
          if (keys && keys.length) {
            await Promise.all(keys.map((k: string) => this.redisClient.del(k)));
            deleted += keys.length;
          }
        } while (cursor !== '0');

        if (deleted > 0) this.logCache('clear', `${prefix1}*`, { deleted });
        return;
      }
    } catch (err) {
      console.warn('[CacheService] redis cache clear error', err);
    }

    // In-memory fallback
    let deleted = 0;
    for (const k of Array.from(this.draftsCache.keys())) {
      if (k.startsWith(prefix1) || k.startsWith(prefix2)) {
        this.draftsCache.delete(k);
        deleted++;
      }
    }
    if (deleted > 0) this.logCache('clear', `${prefix1}*`, { deleted });
  }
}
