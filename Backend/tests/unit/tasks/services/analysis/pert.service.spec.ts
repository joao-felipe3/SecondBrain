import { Test, TestingModule } from '@nestjs/testing';
import { PertService } from '../../../../../src/tasks/services/analysis/pert.service';
import { PertEstimateDto } from '../../../../../src/tasks/dto/analysis/pert-estimate.dto';

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
      const estimate: PertEstimateDto = {
        optimistic: 480,
        mostLikely: 720,
        pessimistic: 1200,
      };

      const expectedTime = service.calculateExpectedTime(estimate);
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

      expect(metrics.expectedTime).toBeCloseTo(17.5, 1);
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
      const variance = 14400;
      const expectedTime = 200;

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Alta incerteza');
    });

    it('should note moderate uncertainty (0.3 < CV ≤ 0.5)', () => {
      const variance = 10000;
      const expectedTime = 250;

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Incerteza moderada');
    });

    it('should confirm low uncertainty (CV ≤ 0.3)', () => {
      const variance = 2500;
      const expectedTime = 500;

      const recommendation = service.getRecommendation(variance, expectedTime);
      expect(recommendation).toContain('Incerteza baixa');
    });
  });
});

describe('TasksPertService', () => {
  let tasksPertService: any;
  let mockTaskModel: any;
  let mockPertService: any;
  let mockMetricsService: any;

  const validId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    mockTaskModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validId,
          createdAt: new Date('2026-01-01'),
        }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validId,
          pertExpectedMinutes: 100,
        }),
      }),
    };

    mockPertService = {
      calculatePertMetrics: jest.fn().mockReturnValue({
        expectedTime: 100,
        variance: 25,
        standardDeviation: 5,
        formula: '(O + 4M + P) / 6',
        estimate: { optimistic: 80, mostLikely: 100, pessimistic: 120 },
      }),
    };

    mockMetricsService = {
      calculateDeadline: jest.fn().mockReturnValue(new Date('2026-01-02')),
    };

    const { TasksPertService: TasksPertServiceClass } = jest.requireActual(
      '../../../../../src/tasks/services/analysis/pert.service',
    );
    tasksPertService = new TasksPertServiceClass(mockTaskModel, mockPertService, mockMetricsService);
  });

  it('should update PERT estimate for task', async () => {
    const res = await tasksPertService.updatePert(validId, {
      pertOptimisticMinutes: 80,
      pertMostLikelyMinutes: 100,
      pertPessimisticMinutes: 120,
    });

    expect(res).toBeDefined();
    expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('should save PERT estimate directly', async () => {
    const dto = { optimistic: 80, mostLikely: 100, pessimistic: 120 };
    const res = await tasksPertService.savePertEstimate(validId, dto);

    expect(res.expectedTime).toBe(100);
    expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalled();
  });
});
