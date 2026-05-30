import { Test, TestingModule } from '@nestjs/testing';
import { PertService } from '../../../../src/tasks/services/pert.service';
import { PertEstimateDto } from '../../../../src/tasks/dto/pert-estimate.dto';

describe('PertService', () => {
  let service: PertService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PertService],
    }).compile();

    service = module.get<PertService>(PertService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateExpectedTime', () => {
    it('should calculate expected time correctly using PERT formula', () => {
      // Exemplo do guia: O=8h, M=12h, P=20h → TE=12.7h
      const estimate: PertEstimateDto = {
        optimistic: 480, // 8 horas
        mostLikely: 720, // 12 horas
        pessimistic: 1200, // 20 horas
      };

      const expectedTime = service.calculateExpectedTime(estimate);

      // (480 + 4*720 + 1200) / 6 = (480 + 2880 + 1200) / 6 = 4560 / 6 = 760 minutos = 12.67h
      expect(expectedTime).toBeCloseTo(760, 0);
    });

    it('should handle equal estimates (no uncertainty)', () => {
      const estimate: PertEstimateDto = {
        optimistic: 600,
        mostLikely: 600,
        pessimistic: 600,
      };

      const expectedTime = service.calculateExpectedTime(estimate);
      expect(expectedTime).toBe(600);
    });
  });

  describe('calculateVariance', () => {
    it('should calculate variance correctly', () => {
      const estimate: PertEstimateDto = {
        optimistic: 480,
        mostLikely: 720,
        pessimistic: 1200,
      };

      const variance = service.calculateVariance(estimate);

      // Variância = ((1200 - 480) / 6)² = (720/6)² = 120² = 14400
      expect(variance).toBeCloseTo(14400, 0);
    });

    it('should return zero variance when estimates are equal', () => {
      const estimate: PertEstimateDto = {
        optimistic: 500,
        mostLikely: 500,
        pessimistic: 500,
      };

      const variance = service.calculateVariance(estimate);
      expect(variance).toBe(0);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('should calculate standard deviation as sqrt of variance', () => {
      const estimate: PertEstimateDto = {
        optimistic: 480,
        mostLikely: 720,
        pessimistic: 1200,
      };

      const stdDev = service.calculateStandardDeviation(estimate);

      // Desvio padrão = √14400 = 120
      expect(stdDev).toBeCloseTo(120, 0);
    });
  });

  describe('validateEstimate', () => {
    it('should return true for valid estimates (O ≤ M ≤ P)', () => {
      const estimate: PertEstimateDto = {
        optimistic: 100,
        mostLikely: 200,
        pessimistic: 300,
      };

      expect(service.validateEstimate(estimate)).toBe(true);
    });

    it('should return true when all estimates are equal', () => {
      const estimate: PertEstimateDto = {
        optimistic: 500,
        mostLikely: 500,
        pessimistic: 500,
      };

      expect(service.validateEstimate(estimate)).toBe(true);
    });

    it('should return false when optimistic > mostLikely', () => {
      const estimate: PertEstimateDto = {
        optimistic: 300,
        mostLikely: 200,
        pessimistic: 400,
      };

      expect(service.validateEstimate(estimate)).toBe(false);
    });

    it('should return false when mostLikely > pessimistic', () => {
      const estimate: PertEstimateDto = {
        optimistic: 100,
        mostLikely: 400,
        pessimistic: 300,
      };

      expect(service.validateEstimate(estimate)).toBe(false);
    });
  });

  describe('calculatePertMetrics', () => {
    it('should calculate all metrics correctly', () => {
      const estimate: PertEstimateDto = {
        optimistic: 480,
        mostLikely: 720,
        pessimistic: 1200,
      };

      const metrics = service.calculatePertMetrics(estimate);

      expect(metrics.expectedTime).toBeCloseTo(760, 0);
      expect(metrics.variance).toBeCloseTo(14400, 0);
      expect(metrics.standardDeviation).toBeCloseTo(120, 0);
      expect(metrics.formula).toBe('(O + 4M + P) / 6');
      expect(metrics.estimate).toEqual(estimate);
    });

    it('should throw error for invalid estimates', () => {
      const invalidEstimate: PertEstimateDto = {
        optimistic: 300,
        mostLikely: 200,
        pessimistic: 100,
      };

      expect(() => service.calculatePertMetrics(invalidEstimate)).toThrow(
        'Estimativas inválidas: deve ser Otimista ≤ Provável ≤ Pessimista',
      );
    });

    it('should handle extreme values (1, 1, 100)', () => {
      const extreme: PertEstimateDto = {
        optimistic: 1,
        mostLikely: 1,
        pessimistic: 100,
      };

      const metrics = service.calculatePertMetrics(extreme);

      // (1 + 4*1 + 100) / 6 = 105/6 = 17.5
      expect(metrics.expectedTime).toBeCloseTo(17.5, 1);

      // Variância = ((100-1)/6)² = (99/6)² = 16.5² = 272.25
      expect(metrics.variance).toBeCloseTo(272.25, 1);
    });
  });

  describe('formatMinutes', () => {
    it('should format hours and minutes correctly', () => {
      expect(service.formatMinutes(765)).toBe('12h 45min');
    });

    it('should format only hours when minutes are zero', () => {
      expect(service.formatMinutes(720)).toBe('12h');
    });

    it('should format only minutes when less than an hour', () => {
      expect(service.formatMinutes(45)).toBe('45min');
    });

    it('should handle zero', () => {
      expect(service.formatMinutes(0)).toBe('0min');
    });
  });

  describe('getRecommendation', () => {
    it('should warn about high uncertainty (CV > 0.5)', () => {
      const variance = 14400; // Desvio padrão = 120
      const expectedTime = 200; // CV = 120/200 = 0.6

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Alta incerteza');
    });

    it('should note moderate uncertainty (0.3 < CV ≤ 0.5)', () => {
      const variance = 10000; // Desvio padrão = 100
      const expectedTime = 250; // CV = 100/250 = 0.4

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Incerteza moderada');
    });

    it('should confirm low uncertainty (CV ≤ 0.3)', () => {
      const variance = 2500; // Desvio padrão = 50
      const expectedTime = 500; // CV = 50/500 = 0.1

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Incerteza baixa');
    });
  });
});
