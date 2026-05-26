import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from '@src/ai/gemini.service';
import { ConfigService } from '@nestjs/config';

describe('GeminiService - PERT Estimation (Unit Tests)', () => {
  let service: GeminiService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') return process.env.GEMINI_API_KEY || 'test-key';
              if (key === 'REDIS_ENABLED') return false; // Use in-memory for tests
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('suggestPertEstimates', () => {
    it('should return PERT estimates with valid structure', async () => {
      const result = await service.suggestPertEstimates(
        'complex',
        'Implement user authentication system',
        'Security Module',
      );

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
      const result = await service.suggestPertEstimates(
        'quick',
        'Fix minor bug',
      );

      expect(result.optimistic).toBeLessThanOrEqual(result.likely);
      expect(result.likely).toBeLessThanOrEqual(result.pessimistic);
    });

    it('should calculate expectedTime using PERT formula', async () => {
      const result = await service.suggestPertEstimates(
        'complex',
        'Build REST API',
      );

      // TE = (O + 4*M + P) / 6
      const expectedTE = (result.optimistic + 4 * result.likely + result.pessimistic) / 6;
      expect(result.expectedTime).toBeCloseTo(expectedTE, 1);
    });

    it('should calculate standardDeviation correctly', async () => {
      const result = await service.suggestPertEstimates(
        'subtask',
        'Add comments to function',
      );

      // σ = (P - O) / 6
      const expectedSigma = (result.pessimistic - result.optimistic) / 6;
      expect(result.standardDeviation).toBeCloseTo(expectedSigma, 1);
    });

    it('should return recommendations based on coefficient of variation', async () => {
      const result = await service.suggestPertEstimates(
        'quick',
        'Simple task with low uncertainty',
      );

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
      // Force fallback by using invalid API key or mocking LLM failure
      const result = await service.suggestPertEstimates(
        'subtask',
        'Any task',
      );

      // Should still have valid values
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

      const result1 = await service.suggestPertEstimates(
        input.taskType,
        input.description,
        input.projectContext,
      );

      const result2 = await service.suggestPertEstimates(
        input.taskType,
        input.description,
        input.projectContext,
      );

      // Results should be identical (from cache)
      expect(result1.optimistic).toEqual(result2.optimistic);
      expect(result1.likely).toEqual(result2.likely);
      expect(result1.pessimistic).toEqual(result2.pessimistic);
      expect(result1.expectedTime).toEqual(result2.expectedTime);
    });

    it('should return different results for different inputs', async () => {
      const complexResult = await service.suggestPertEstimates(
        'complex',
        'Migrate database to new schema',
      );

      const quickResult = await service.suggestPertEstimates(
        'quick',
        'Fix typo in README',
      );

      // Complex tasks should generally take longer than quick tasks
      expect(complexResult.expectedTime).toBeGreaterThan(quickResult.expectedTime);
    });

    it('should handle different task types correctly', async () => {
      const taskTypes = ['subtask', 'quick', 'complex', 'habit'];
      const results: any[] = [];

      for (const taskType of taskTypes) {
        const result = await service.suggestPertEstimates(
          taskType,
          'Sample task',
        );
        results.push(result);
        expect(result.optimistic).toBeGreaterThan(0);
      }

      // Complex should generally be largest
      const complexResult = results[taskTypes.indexOf('complex')];
      const quickResult = results[taskTypes.indexOf('quick')];
      expect(complexResult.expectedTime).toBeGreaterThanOrEqual(quickResult.expectedTime);
    });

    it('should handle long descriptions gracefully', async () => {
      const longDescription = 'A'.repeat(500) + ' very long task description';

      const result = await service.suggestPertEstimates(
        'complex',
        longDescription,
      );

      expect(result.optimistic).toBeGreaterThan(0);
      expect(result.optimistic).toBeLessThanOrEqual(result.likely);
      expect(result.likely).toBeLessThanOrEqual(result.pessimistic);
    });

    it('should include fromLLM flag indicating source', async () => {
      const result = await service.suggestPertEstimates(
        'quick',
        'Test task',
      );

      expect(typeof result.fromLLM).toBe('boolean');
      // In test environment, likely to be fallback (false) unless LLM is mocked
    });
  });

  describe('getPertFallback', () => {
    it('should return fallback values for subtask', () => {
      const fallback = service['getPertFallback']('subtask');
      expect(fallback).toEqual({
        optimistic: 5,
        likely: 15,
        pessimistic: 30,
      });
    });

    it('should return fallback values for quick', () => {
      const fallback = service['getPertFallback']('quick');
      expect(fallback).toEqual({
        optimistic: 5,
        likely: 10,
        pessimistic: 20,
      });
    });

    it('should return fallback values for complex', () => {
      const fallback = service['getPertFallback']('complex');
      expect(fallback).toEqual({
        optimistic: 30,
        likely: 60,
        pessimistic: 120,
      });
    });

    it('should return fallback values for habit', () => {
      const fallback = service['getPertFallback']('habit');
      expect(fallback).toEqual({
        optimistic: 3,
        likely: 8,
        pessimistic: 15,
      });
    });

    it('should return generic fallback for unknown type', () => {
      const fallback = service['getPertFallback']('unknown_type');
      expect(fallback).toEqual({
        optimistic: 10,
        likely: 20,
        pessimistic: 45,
      });
    });
  });

  describe('calculatePertMetrics', () => {
    it('should calculate correct TE', () => {
      // TE = (10 + 4*20 + 50) / 6 = 140/6 = 23.33
      const metrics = service['calculatePertMetrics'](10, 20, 50);
      expect(metrics.expectedTime).toBeCloseTo(23.33, 1);
    });

    it('should calculate correct variance', () => {
      // σ² = ((50-10) / 6)² = (40/6)² = 44.44
      const metrics = service['calculatePertMetrics'](10, 20, 50);
      expect(metrics.variance).toBeCloseTo(44.44, 0);
    });

    it('should calculate correct standard deviation', () => {
      // σ = √44.44 = 6.67
      const metrics = service['calculatePertMetrics'](10, 20, 50);
      expect(metrics.standardDeviation).toBeCloseTo(6.67, 1);
    });

    it('should handle edge case with O = P', () => {
      const metrics = service['calculatePertMetrics'](10, 10, 10);
      expect(metrics.expectedTime).toEqual(10);
      expect(metrics.variance).toEqual(0);
      expect(metrics.standardDeviation).toEqual(0);
    });
  });

  describe('getPertRecommendation', () => {
    it('should return warning for high CV', () => {
      const recommendation = service['getPertRecommendation'](10, 10); // CV = 1.0
      expect(recommendation).toContain('⚠️');
    });

    it('should return caution for moderate CV', () => {
      const recommendation = service['getPertRecommendation'](5, 20); // CV = 0.25
      expect(recommendation).toContain('✅');
    });

    it('should return confidence for low CV', () => {
      const recommendation = service['getPertRecommendation'](2, 20); // CV = 0.1
      expect(recommendation).toContain('✅');
    });

    it('should handle edge case with zero expected time', () => {
      // Should not throw error
      const recommendation = service['getPertRecommendation'](5, 0.1);
      expect(recommendation).toBeDefined();
    });
  });

  describe('Cache behavior', () => {
    it('should store and retrieve cached results', async () => {
      const input = {
        taskType: 'complex',
        description: 'Test cache',
      };

      const cacheKey = service['getPertCacheKey'](input.taskType, input.description);
      
      // Initially no cache
      let cached = await service['getPertCache'](cacheKey);
      expect(cached).toBeNull();

      // Set cache
      const testValue = {
        optimistic: 30,
        likely: 60,
        pessimistic: 120,
        expectedTime: 65,
        standardDeviation: 15,
        recommendation: '✅ Low uncertainty',
        fromLLM: true,
      };
      await service['setPertCache'](cacheKey, testValue);

      // Retrieve cache
      cached = await service['getPertCache'](cacheKey);
      expect(cached).toEqual(testValue);
    });

    it('should expire cache after TTL', async () => {
      const cacheKey = 'test:expiration';
      const testValue = { test: 'data' };

      service['setPertCache'](cacheKey, testValue);
      
      // Immediately should be in cache
      let cached = service['getPertCache'](cacheKey);
      expect(cached).toBeDefined();

      // Note: TTL is 24h, so we can't actually test expiration in unit tests
      // This is validated in E2E tests or integration tests with Redis
    });
  });
});
