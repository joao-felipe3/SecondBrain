import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { GeminiExecutorService } from '../core/gemini-executor.service';
import { buildPertEstimatePrompt } from '../../prompts';
import { PertEstimatePromptParams } from '../../interfaces';

@Injectable()
export class PertAiService {
  private readonly pertCache = new Map<string, { value: unknown; exp: number }>();
  private checklistRedisClient: Redis | null = null;
  private readonly pertCacheTtlSeconds = 24 * 60 * 60;

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiExecutor: GeminiExecutorService,
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

  private getPertCacheKey(taskType: string, description: string): string {
    const type = String(taskType || 'generic')
      .trim()
      .toLowerCase();
    const desc = String(description || '')
      .trim()
      .toLowerCase()
      .substring(0, 100)
      .replace(/\s+/g, ' ');
    return `pert:${type}:${desc}`;
  }

  private async getPertCache(key: string): Promise<any> {
    try {
      if (this.checklistRedisClient) {
        const raw = await this.checklistRedisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
      }
    } catch {
      // fallback to memory
    }

    const local = this.pertCache.get(key);
    if (!local) return null;
    if (Date.now() > local.exp) {
      this.pertCache.delete(key);
      return null;
    }
    return local.value;
  }

  private async setPertCache(key: string, value: any): Promise<void> {
    try {
      if (this.checklistRedisClient) {
        await this.checklistRedisClient.set(key, JSON.stringify(value), 'EX', this.pertCacheTtlSeconds);
        return;
      }
    } catch {
      // fallback to memory
    }

    this.pertCache.set(key, {
      value,
      exp: Date.now() + this.pertCacheTtlSeconds * 1000,
    });
  }

  private getPertFallback(taskType: string): {
    optimistic: number;
    likely: number;
    pessimistic: number;
  } {
    const type = String(taskType || 'generic').toLowerCase();
    const fallbacks: Record<string, { optimistic: number; likely: number; pessimistic: number }> = {
      subtask: { optimistic: 5, likely: 15, pessimistic: 30 },
      quick: { optimistic: 5, likely: 10, pessimistic: 20 },
      complex: { optimistic: 30, likely: 60, pessimistic: 120 },
      habit: { optimistic: 3, likely: 8, pessimistic: 15 },
      generic: { optimistic: 10, likely: 20, pessimistic: 45 },
    };

    return fallbacks[type] || fallbacks.generic;
  }

  private calculatePertMetrics(optimistic: number, likely: number, pessimistic: number) {
    const expectedTime = (optimistic + 4 * likely + pessimistic) / 6;
    const range = pessimistic - optimistic;
    const variance = Math.pow(range / 6, 2);
    const standardDeviation = Math.sqrt(variance);

    return {
      expectedTime: Math.round(expectedTime * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
    };
  }

  private getPertRecommendation(standardDeviation: number, expectedTime: number): string {
    const coefficientOfVariation = standardDeviation / expectedTime;

    if (coefficientOfVariation > 0.5) {
      return '⚠️ Alta incerteza. Considere decompor esta tarefa em sub-tarefas menores.';
    }
    if (coefficientOfVariation > 0.3) {
      return '⚡ Incerteza moderada. Monitore o progresso de perto e ajuste o plano conforme necessário.';
    }
    return '✅ Incerteza baixa. Estimativa confiável.';
  }

  async suggestPertEstimates(params: PertEstimatePromptParams): Promise<{
    optimistic: number;
    likely: number;
    pessimistic: number;
    expectedTime: number;
    standardDeviation: number;
    recommendation: string;
    fromLLM: boolean;
  }> {
    const { taskType, description } = params;
    const cacheKey = this.getPertCacheKey(taskType, description);
    const cached = (await this.getPertCache(cacheKey)) as {
      optimistic: number;
      likely: number;
      pessimistic: number;
      expectedTime: number;
      standardDeviation: number;
      recommendation: string;
      fromLLM: boolean;
    } | null;
    if (cached) return cached;

    const prompt = buildPertEstimatePrompt(params);

    try {
      const response = await this.geminiExecutor.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 200,
        temperature: 0.3,
      });

      const parsed = JSON.parse(response) as Record<string, unknown>;
      const optimistic = Number(parsed?.optimistic);
      const likely = Number(parsed?.likely);
      const pessimistic = Number(parsed?.pessimistic);

      if (
        !Number.isFinite(optimistic) ||
        !Number.isFinite(likely) ||
        !Number.isFinite(pessimistic) ||
        optimistic <= 0 ||
        likely <= 0 ||
        pessimistic <= 0 ||
        optimistic > likely ||
        likely > pessimistic
      ) {
        throw new Error('Valores PERT inválidos');
      }

      const metrics = this.calculatePertMetrics(optimistic, likely, pessimistic);
      const recommendation = this.getPertRecommendation(metrics.standardDeviation, metrics.expectedTime);
      const result = {
        optimistic,
        likely,
        pessimistic,
        expectedTime: metrics.expectedTime,
        standardDeviation: metrics.standardDeviation,
        recommendation,
        fromLLM: true,
      };

      await this.setPertCache(cacheKey, result);
      return result;
    } catch {
      const fallback = this.getPertFallback(taskType);
      const metrics = this.calculatePertMetrics(
        fallback.optimistic,
        fallback.likely,
        fallback.pessimistic,
      );
      const recommendation = this.getPertRecommendation(metrics.standardDeviation, metrics.expectedTime);
      const result = {
        optimistic: fallback.optimistic,
        likely: fallback.likely,
        pessimistic: fallback.pessimistic,
        expectedTime: metrics.expectedTime,
        standardDeviation: metrics.standardDeviation,
        recommendation,
        fromLLM: false,
      };

      await this.setPertCache(cacheKey, result);
      return result;
    }
  }
}
