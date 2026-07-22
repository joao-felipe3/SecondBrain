import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { GeminiService } from '../core/gemini.service';
import { buildChecklistGenerationPrompt, buildChecklistWithHistoryPrompt } from '../../prompts';
import { ChecklistPromptParams, ChecklistWithHistoryPromptParams } from '../../interfaces';

@Injectable()
export class ChecklistAiService {
  private readonly checklistCache = new Map<string, { value: string[]; exp: number }>();
  private checklistRedisClient: Redis | null = null;
  private readonly checklistCacheTtlSeconds = 60 * 60;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {
    this.initializeChecklistRedis();
  }

  private initializeChecklistRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL') || process.env.REDIS_URL;
      if (!redisUrl) return;

      const redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      const disableRedis = (): void => {
        if (this.checklistRedisClient !== redisClient) return;
        this.checklistRedisClient = null;
        try {
          redisClient.removeAllListeners();
          redisClient.disconnect();
        } catch {
          // Keep in-memory fallback active.
        }
      };

      redisClient.on('error', disableRedis);
      redisClient.on('close', disableRedis);
      redisClient.on('end', disableRedis);

      this.checklistRedisClient = redisClient;
      void redisClient.connect().catch(() => disableRedis());
    } catch {
      this.checklistRedisClient = null;
    }
  }

  private getChecklistCacheKey(taskName: string, microTaskType?: string): string {
    const type = String(microTaskType || 'generic')
      .trim()
      .toLowerCase();
    const name = String(taskName || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return `checklist:${type}:${name}`;
  }

  private async getChecklistCache(key: string): Promise<string[] | null> {
    try {
      if (this.checklistRedisClient) {
        const raw = await this.checklistRedisClient.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as string[]) : null;
      }
    } catch {
      // fallback to memory
    }

    const local = this.checklistCache.get(key);
    if (!local) return null;
    if (Date.now() > local.exp) {
      this.checklistCache.delete(key);
      return null;
    }
    return local.value;
  }

  private async setChecklistCache(key: string, value: string[]): Promise<void> {
    try {
      if (this.checklistRedisClient) {
        await this.checklistRedisClient.set(
          key,
          JSON.stringify(value),
          'EX',
          this.checklistCacheTtlSeconds,
        );
        return;
      }
    } catch {
      // fallback to memory
    }

    this.checklistCache.set(key, {
      value,
      exp: Date.now() + this.checklistCacheTtlSeconds * 1000,
    });
  }

  private normalizeChecklistItems(input: unknown): string[] {
    if (!Array.isArray(input)) return [];

    const unique = new Set<string>();
    for (const row of input) {
      if (typeof row === 'string') {
        const clean = row.trim();
        if (clean) unique.add(clean);
        continue;
      }

      if (row && typeof row === 'object') {
        const value = (row as Record<string, unknown>).item;
        if (typeof value === 'string' && value.trim()) {
          unique.add(value.trim());
        }
      }
    }

    return Array.from(unique).slice(0, 10);
  }

  private parseChecklistResponse(raw: string): string[] {
    if (!raw || typeof raw !== 'string') return [];

    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as unknown;
      const items = this.normalizeChecklistItems(parsed);
      if (items.length > 0) return items;
    } catch {
      // ignore and try fallback
    }

    return cleaned
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  private getChecklistFallback(microTaskType?: string): string[] {
    const type = String(microTaskType || 'generic').toLowerCase();
    if (type === 'habit') {
      return ['Preparar ambiente', 'Executar habito', 'Registrar resultado'];
    }
    if (type === 'complex') {
      return [
        'Revisar requisitos',
        'Executar tarefa principal',
        'Validar resultado',
        'Documentar saida',
      ];
    }
    return ['Preparar contexto', 'Executar tarefa', 'Validar entrega'];
  }

  async generateChecklistForTask(params: ChecklistPromptParams): Promise<string[]> {
    const { taskName, microTaskType } = params;
    const key = this.getChecklistCacheKey(taskName, microTaskType);
    const cached = await this.getChecklistCache(key);
    if (cached && cached.length > 0) return cached;

    const prompt = buildChecklistGenerationPrompt(params);

    try {
      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
        temperature: 0.3,
      });

      const parsed = this.parseChecklistResponse(response);
      const finalChecklist = parsed.length >= 3 ? parsed : this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, finalChecklist);
      return finalChecklist;
    } catch {
      const fallback = this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, fallback);
      return fallback;
    }
  }

  async generateChecklistWithHistory(params: ChecklistWithHistoryPromptParams): Promise<string[]> {
    const { taskName, microTaskType, historicalContext } = params;
    if (!historicalContext || historicalContext.trim() === '') {
      return this.generateChecklistForTask(params);
    }

    const key = this.getChecklistCacheKey(taskName, microTaskType);
    const cached = await this.getChecklistCache(key);
    if (cached && cached.length > 0) return cached;

    const prompt = buildChecklistWithHistoryPrompt(params);

    try {
      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
        temperature: 0.3,
      });

      const parsed = this.parseChecklistResponse(response);
      const finalChecklist = parsed.length >= 3 ? parsed : this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, finalChecklist);
      return finalChecklist;
    } catch {
      const fallback = this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, fallback);
      return fallback;
    }
  }
}
