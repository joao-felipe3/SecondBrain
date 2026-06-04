import { Injectable } from '@nestjs/common';

/**
 * Manages caching for WBS drafts using in-memory storage.
 */
@Injectable()
export class CacheService {
  private draftsCache = new Map<string, { value: any; exp: number }>();
  private cacheTTLSeconds = 60 * 60 * 24; // 24h

  private isCacheDebugEnabled(): boolean {
    const v = String(process.env.WBS_CACHE_DEBUG || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  getBackendName(): 'memory' {
    return 'memory';
  }

  private logCache(event: 'hit' | 'miss' | 'set' | 'clear', key: string, extra?: Record<string, any>): void {
    if (!this.isCacheDebugEnabled()) return;
    const payload = {
      backend: this.getBackendName(),
      keyPrefix: String(key).split(':').slice(0, 3).join(':'),
      keyLen: String(key).length,
      ...(extra || {}),
    };
    // eslint-disable-next-line no-console
    console.log(`[CacheService][cache:${event}]`, payload);
  }

  async get<T = any>(key: string): Promise<T | null> {
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
