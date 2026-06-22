import { Injectable } from '@nestjs/common';
import { BufferEntry } from '../../interfaces';

@Injectable()
export class LeafTasksBufferService {
  private readonly entries = new Map<string, BufferEntry<any>>();
  private readonly inFlight = new Map<string, Promise<void>>();

  private running = 0;
  private readonly queue: Array<() => void> = [];

  private ttlMs(): number {
    const raw = String(process.env.WBS_PREFETCH_TTL_SECONDS || '').trim();
    const seconds = raw ? Number(raw) : 15 * 60;
    return Math.max(10_000, (Number.isFinite(seconds) ? seconds : 15 * 60) * 1000);
  }

  private maxPerProject(): number {
    const raw = String(process.env.WBS_PREFETCH_BUFFER_SIZE || '').trim();
    const n = raw ? Number(raw) : 2;
    return Math.max(0, Math.floor(Number.isFinite(n) ? n : 2));
  }

  private concurrency(): number {
    const raw = String(process.env.WBS_PREFETCH_CONCURRENCY || '').trim();
    const n = raw ? Number(raw) : 2;
    return Math.max(1, Math.floor(Number.isFinite(n) ? n : 2));
  }

  private isDebugEnabled(): boolean {
    const v = String(process.env.WBS_PREFETCH_DEBUG || process.env.WBS_CACHE_DEBUG || '')
      .trim()
      .toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private log(message: string, extra?: any) {
    if (!this.isDebugEnabled()) return;

    console.log(`[LeafBuffer] ${message}`, extra || '');
  }

  private isExpired(entry: BufferEntry<any>): boolean {
    return Date.now() > entry.exp;
  }

  private cleanupKey(key: string): void {
    const entry = this.entries.get(key);
    if (entry && this.isExpired(entry)) {
      this.entries.delete(key);
    }
  }

  private async enqueue(task: () => Promise<void>): Promise<void> {
    const run = async () => {
      this.running++;
      try {
        await task();
      } finally {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
      }
    };

    if (this.running < this.concurrency()) {
      await run();
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        run().then(resolve).catch(resolve);
      });
    });
  }

  private evictIfNeeded(projectId: string): void {
    const max = this.maxPerProject();
    if (max <= 0) return;

    // naive eviction: drop oldest entries for this project until within limit.
    const candidates: Array<{ key: string; createdAt: number }> = [];
    for (const [key, entry] of this.entries.entries()) {
      if (entry.projectId === projectId) {
        if (this.isExpired(entry)) {
          this.entries.delete(key);
          continue;
        }
        candidates.push({ key, createdAt: entry.createdAt });
      }
    }

    if (candidates.length <= max) return;
    candidates.sort((a, b) => a.createdAt - b.createdAt);
    const toEvict = candidates.length - max;
    for (let i = 0; i < toEvict; i++) {
      this.entries.delete(candidates[i].key);
    }
  }

  has(key: string): boolean {
    this.cleanupKey(key);
    return this.entries.has(key);
  }

  // Consume the buffered value (removes from buffer). If it's currently being prefetched, waits for it.
  async consume<T = any>(key: string): Promise<T | null> {
    this.cleanupKey(key);
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.log('consume:hit', {
        keyPrefix: key.split(':').slice(0, 2).join(':'),
        remaining: this.entries.size,
      });
      return entry.value as T;
    }

    const inflight = this.inFlight.get(key);
    if (inflight) {
      this.log('consume:wait', {
        keyPrefix: key.split(':').slice(0, 2).join(':'),
        inFlight: true,
      });
      try {
        await inflight;
      } catch {
        // ignore
      }
      this.cleanupKey(key);
      const after = this.entries.get(key);
      if (after) {
        this.entries.delete(key);
        return after.value as T;
      }
    }

    this.log('consume:miss', {
      keyPrefix: key.split(':').slice(0, 2).join(':'),
      inFlight: false,
    });
    return null;
  }

  // Prefetch a value into the buffer (non-blocking). Dedupes in-flight tasks per key.
  prefetch(key: string, projectId: string, producer: () => Promise<any>): void {
    this.cleanupKey(key);
    if (this.entries.has(key)) return;
    if (this.inFlight.has(key)) return;

    const startedAt = Date.now();
    const p = this.enqueue(async () => {
      try {
        this.log('prefetch:start', {
          keyPrefix: key.split(':').slice(0, 2).join(':'),
          projectId,
        });
        const value = await producer();
        this.entries.set(key, {
          value,
          exp: Date.now() + this.ttlMs(),
          projectId,
          createdAt: Date.now(),
        });
        this.evictIfNeeded(projectId);
        this.log('prefetch:done', {
          keyPrefix: key.split(':').slice(0, 2).join(':'),
          ms: Date.now() - startedAt,
        });
      } catch (err: any) {
        this.log('prefetch:error', {
          keyPrefix: key.split(':').slice(0, 2).join(':'),
          message: err?.message || String(err),
        });
      }
    }).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, p);
  }
}
