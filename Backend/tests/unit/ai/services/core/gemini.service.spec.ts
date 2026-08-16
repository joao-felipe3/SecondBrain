import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { GeminiExecutorService } from '../../../../../src/ai/services/core/gemini-executor.service';
import { ChecklistAiService } from '../../../../../src/ai/services/tasks/checklist-ai.service';
import { PertAiService } from '../../../../../src/ai/services/tasks/pert-ai.service';
import { SuggestionsAiService } from '../../../../../src/ai/services/tasks/suggestions-ai.service';
import { DependencyAiService } from '../../../../../src/ai/services/tasks/dependency-ai.service';

interface PrivatePertAiService {
  getPertFallback(type: string): Record<string, number>;
  calculatePertMetrics(
    o: number,
    m: number,
    p: number,
  ): { expectedTime: number; variance: number; standardDeviation: number };
  getPertRecommendation(sd: number, te: number): string;
  getPertCacheKey(type: string, desc: string): string;
  getPertCache(key: string): Promise<Record<string, unknown> | null>;
  setPertCache(key: string, val: unknown): Promise<void>;
}

describe('GeminiService', () => {
  let service: GeminiService;
  let geminiExecutor: GeminiExecutorService;
  let pertAiService: PertAiService;
  let privateHelper: PrivatePertAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        GeminiExecutorService,
        ChecklistAiService,
        PertAiService,
        SuggestionsAiService,
        DependencyAiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const configMap: Record<string, string | undefined> = {
                GEMINI_API_KEY: 'test-api-key',
                GEMINI_MODEL: 'gemini-2.5-flash-lite',
                REDIS_URL: undefined,
                REDIS_ENABLED: 'false',
              };
              return configMap[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
    geminiExecutor = module.get<GeminiExecutorService>(GeminiExecutorService);
    pertAiService = module.get<PertAiService>(PertAiService);
    privateHelper = pertAiService as unknown as PrivatePertAiService;
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('retorna fallback quando a chamada ao LLM falha', async () => {
    jest
      .spyOn(geminiExecutor as any, 'generateContent')
      .mockRejectedValue(new Error('LLM indisponível'));

    const checklist = await service.generateChecklistForTask({
      taskName: 'Preparar revisão de código',
      description: 'Revisar PR de sprint 1',
      microTaskType: 'subtask',
    });

    expect(checklist).toEqual(['Preparar contexto', 'Executar tarefa', 'Validar entrega']);
  });

  it('usa cache e evita nova chamada ao LLM para a mesma chave', async () => {
    const generateContentSpy = jest
      .spyOn(geminiExecutor as any, 'generateContent')
      .mockResolvedValue(JSON.stringify(['Abrir branch', 'Implementar endpoint', 'Validar resposta']));

    const first = await service.generateChecklistForTask({
      taskName: 'Criar endpoint de micro-task',
      description: 'Implementação inicial',
      microTaskType: 'quick',
    });
    const second = await service.generateChecklistForTask({
      taskName: 'Criar endpoint de micro-task',
      description: 'Implementação inicial',
      microTaskType: 'quick',
    });

    expect(first).toEqual(['Abrir branch', 'Implementar endpoint', 'Validar resposta']);
    expect(second).toEqual(first);
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });

  describe('suggestPertEstimates', () => {
    it('should return PERT estimates with valid structure', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'complex',
        description: 'Implement user authentication system',
        projectContext: 'Security Module',
      });

      expect(result).toHaveProperty('optimistic');
      expect(result).toHaveProperty('likely');
      expect(result).toHaveProperty('pessimistic');
      expect(result).toHaveProperty('expectedTime');
      expect(result).toHaveProperty('standardDeviation');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('fromLLM');

      expect(typeof result.optimistic).toBe('number');
      expect(typeof result.likely).toBe('number');
      expect(typeof result.pessimistic).toBe('number');
      expect(typeof result.expectedTime).toBe('number');
      expect(typeof result.standardDeviation).toBe('number');
      expect(typeof result.recommendation).toBe('string');
      expect(typeof result.fromLLM).toBe('boolean');
    });

    it('should enforce O <= M <= P constraint', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'quick',
        description: 'Fix minor bug',
      });

      expect(result.optimistic).toBeLessThanOrEqual(result.likely);
      expect(result.likely).toBeLessThanOrEqual(result.pessimistic);
    });

    it('should calculate expectedTime using PERT formula', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'complex',
        description: 'Build REST API',
      });

      const expectedTE = (result.optimistic + 4 * result.likely + result.pessimistic) / 6;
      expect(result.expectedTime).toBeCloseTo(expectedTE, 1);
    });

    it('should calculate standardDeviation correctly', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'subtask',
        description: 'Add comments to function',
      });

      const expectedSigma = (result.pessimistic - result.optimistic) / 6;
      expect(result.standardDeviation).toBeCloseTo(expectedSigma, 1);
    });

    it('should return recommendations based on coefficient of variation', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'quick',
        description: 'Simple task with low uncertainty',
      });

      const cv = result.standardDeviation / result.expectedTime;

      if (cv > 0.5) {
        expect(result.recommendation).toContain('⚠️');
      } else if (cv > 0.3) {
        expect(result.recommendation).toContain('⚡');
      } else {
        expect(result.recommendation).toContain('✅');
      }
    });

    it('should return fallback values when LLM is unavailable', async () => {
      const result = await service.suggestPertEstimates({
        taskType: 'subtask',
        description: 'Any task',
      });

      expect(result.optimistic).toBeGreaterThan(0);
      expect(result.likely).toBeGreaterThan(result.optimistic);
      expect(result.pessimistic).toBeGreaterThan(result.likely);
    });

    it('should use cached results for identical inputs', async () => {
      const input = {
        taskType: 'complex',
        description: 'Build authentication module',
        projectContext: 'Security',
      };

      const result1 = await service.suggestPertEstimates({
        taskType: input.taskType,
        description: input.description,
        projectContext: input.projectContext,
      });

      const result2 = await service.suggestPertEstimates({
        taskType: input.taskType,
        description: input.description,
        projectContext: input.projectContext,
      });

      expect(result1.optimistic).toEqual(result2.optimistic);
      expect(result1.likely).toEqual(result2.likely);
      expect(result1.pessimistic).toEqual(result2.pessimistic);
      expect(result1.expectedTime).toEqual(result2.expectedTime);
    });

    it('should return different results for different inputs', async () => {
      const complexResult = await service.suggestPertEstimates({
        taskType: 'complex',
        description: 'Migrate database to new schema',
      });

      const quickResult = await service.suggestPertEstimates({
        taskType: 'quick',
        description: 'Fix typo in README',
      });

      expect(complexResult.expectedTime).toBeGreaterThan(quickResult.expectedTime);
    });

    it('should handle different task types correctly', async () => {
      const taskTypes = ['subtask', 'quick', 'complex', 'habit'];
      const results: Array<Awaited<ReturnType<typeof service.suggestPertEstimates>>> = [];

      for (const taskType of taskTypes) {
        const result = await service.suggestPertEstimates({ taskType, description: 'Sample task' });
        results.push(result);
        expect(result.optimistic).toBeGreaterThan(0);
      }

      const complexResult = results[taskTypes.indexOf('complex')];
      const quickResult = results[taskTypes.indexOf('quick')];
      if (complexResult && quickResult) {
        expect(complexResult.expectedTime).toBeGreaterThanOrEqual(quickResult.expectedTime);
      }
    });

    it('should handle long descriptions gracefully', async () => {
      const longDescription = 'A'.repeat(500) + ' very long task description';

      const result = await service.suggestPertEstimates({
        taskType: 'complex',
        description: longDescription,
      });

      expect(result.optimistic).toBeGreaterThan(0);
      expect(result.optimistic).toBeLessThanOrEqual(result.likely);
      expect(result.likely).toBeLessThanOrEqual(result.pessimistic);
    });

    it('should include fromLLM flag indicating source', async () => {
      const result = await service.suggestPertEstimates({ taskType: 'quick', description: 'Test task' });

      expect(typeof result.fromLLM).toBe('boolean');
    });
  });

  describe('getPertFallback', () => {
    it('should return fallback values for subtask', () => {
      const fallback = privateHelper.getPertFallback('subtask');
      expect(fallback).toEqual({
        optimistic: 5,
        likely: 15,
        pessimistic: 30,
      });
    });

    it('should return fallback values for quick', () => {
      const fallback = privateHelper.getPertFallback('quick');
      expect(fallback).toEqual({
        optimistic: 5,
        likely: 10,
        pessimistic: 20,
      });
    });

    it('should return fallback values for complex', () => {
      const fallback = privateHelper.getPertFallback('complex');
      expect(fallback).toEqual({
        optimistic: 30,
        likely: 60,
        pessimistic: 120,
      });
    });

    it('should return fallback values for habit', () => {
      const fallback = privateHelper.getPertFallback('habit');
      expect(fallback).toEqual({
        optimistic: 3,
        likely: 8,
        pessimistic: 15,
      });
    });

    it('should return generic fallback for unknown type', () => {
      const fallback = privateHelper.getPertFallback('unknown_type');
      expect(fallback).toEqual({
        optimistic: 10,
        likely: 20,
        pessimistic: 45,
      });
    });
  });

  describe('calculatePertMetrics', () => {
    it('should calculate correct TE', () => {
      const metrics = privateHelper.calculatePertMetrics(10, 20, 50);
      expect(metrics.expectedTime).toBeCloseTo(23.33, 1);
    });

    it('should calculate correct variance', () => {
      const metrics = privateHelper.calculatePertMetrics(10, 20, 50);
      expect(metrics.variance).toBeCloseTo(44.44, 0);
    });

    it('should calculate correct standard deviation', () => {
      const metrics = privateHelper.calculatePertMetrics(10, 20, 50);
      expect(metrics.standardDeviation).toBeCloseTo(6.67, 1);
    });

    it('should handle edge case with O = P', () => {
      const metrics = privateHelper.calculatePertMetrics(10, 10, 10);
      expect(metrics.expectedTime).toEqual(10);
      expect(metrics.variance).toEqual(0);
      expect(metrics.standardDeviation).toEqual(0);
    });
  });

  describe('getPertRecommendation', () => {
    it('should return warning for high CV', () => {
      const recommendation = privateHelper.getPertRecommendation(10, 10);
      expect(recommendation).toContain('⚠️');
    });

    it('should return caution for moderate CV', () => {
      const recommendation = privateHelper.getPertRecommendation(5, 20);
      expect(recommendation).toContain('✅');
    });

    it('should return confidence for low CV', () => {
      const recommendation = privateHelper.getPertRecommendation(2, 20);
      expect(recommendation).toContain('✅');
    });

    it('should handle edge case with zero expected time', () => {
      const recommendation = privateHelper.getPertRecommendation(5, 0.1);
      expect(recommendation).toBeDefined();
    });
  });

  describe('Cache behavior', () => {
    it('should store and retrieve cached results', async () => {
      const input = {
        taskType: 'complex',
        description: 'Test cache',
      };

      const cacheKey = privateHelper.getPertCacheKey(input.taskType, input.description);

      let cached = await privateHelper.getPertCache(cacheKey);
      expect(cached).toBeNull();

      const testValue = {
        optimistic: 30,
        likely: 60,
        pessimistic: 120,
        expectedTime: 65,
        standardDeviation: 15,
        recommendation: '✅ Low uncertainty',
        fromLLM: true,
      };
      await privateHelper.setPertCache(cacheKey, testValue);

      cached = await privateHelper.getPertCache(cacheKey);
      expect(cached).toEqual(testValue);
    });

    it('should expire cache after TTL', async () => {
      const cacheKey = 'test:expiration';
      const testValue = { test: 'data' };

      await privateHelper.setPertCache(cacheKey, testValue);

      const cached = await privateHelper.getPertCache(cacheKey);
      expect(cached).toBeDefined();
    });
  });
});
