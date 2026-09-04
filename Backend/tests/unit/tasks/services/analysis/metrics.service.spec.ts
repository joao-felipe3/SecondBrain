import { TasksMetricsService } from '@src/tasks/services/analysis/metrics.service';

describe('TasksMetricsService', () => {
  let service: TasksMetricsService;

  beforeEach(() => {
    service = new TasksMetricsService();
  });

  describe('applyPertEstimates', () => {
    it('should do nothing if no PERT inputs and no base minutes in dto or fallback', () => {
      const dto: any = {};
      service.applyPertEstimates(dto, null);
      expect(dto.pertExpectedMinutes).toBeUndefined();
    });

    it('should calculate and apply PERT estimates to dto using pomodorosPlanned', () => {
      const dto: any = { pomodorosPlanned: 4 }; // 100 minutes base
      service.applyPertEstimates(dto);

      expect(dto.pertOptimisticMinutes).toBe(75);
      expect(dto.pertMostLikelyMinutes).toBe(100);
      expect(dto.pertPessimisticMinutes).toBe(150);
      expect(dto.pertExpectedMinutes).toBeDefined();
      expect(dto.pertVariance).toBeDefined();
    });

    it('should use explicit PERT inputs when provided', () => {
      const dto: any = {
        pertOptimisticMinutes: 30,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 120,
      };

      service.applyPertEstimates(dto);
      expect(dto.pertExpectedMinutes).toBe(65); // (30 + 240 + 120) / 6 = 390 / 6 = 65
    });

    it('should resolve base minutes from fallbackTask when dto has none', () => {
      const dto: any = {};
      const fallback: any = { pertMostLikelyMinutes: 80 };
      service.applyPertEstimates(dto, fallback);
      expect(dto.pertMostLikelyMinutes).toBe(80);

      const dto2: any = {};
      const fallback2: any = { pomodorosPlanned: 2 };
      service.applyPertEstimates(dto2, fallback2);
      expect(dto2.pertMostLikelyMinutes).toBe(50);
    });

    it('should ensure bounds maintain minimums (optimistic >= 5, mostLikely >= optimistic, pessimistic >= mostLikely)', () => {
      const dto: any = {
        pertOptimisticMinutes: 2, // should become at least 5
        pertMostLikelyMinutes: 3, // should become at least 5
        pertPessimisticMinutes: 4, // should become at least 5
      };
      service.applyPertEstimates(dto);
      expect(dto.pertOptimisticMinutes).toBe(5);
      expect(dto.pertMostLikelyMinutes).toBe(5);
      expect(dto.pertPessimisticMinutes).toBe(5);
    });
  });

  describe('applyRtmRisk', () => {
    it('should set rtmRisk to false if requirement or WBS links exist in dto', () => {
      const dtoWbs: any = { parentWbsNodeId: 'wbs1' };
      service.applyRtmRisk(dtoWbs);
      expect(dtoWbs.rtmRisk).toBe(false);

      const dtoReq: any = { requirementIds: ['req-1'] };
      service.applyRtmRisk(dtoReq);
      expect(dtoReq.rtmRisk).toBe(false);

      const dtoJourney: any = { journeyItemIds: ['ji-1'] };
      service.applyRtmRisk(dtoJourney);
      expect(dtoJourney.rtmRisk).toBe(false);

      const dtoPath: any = { wbsPath: '1.2.3' };
      service.applyRtmRisk(dtoPath);
      expect(dtoPath.rtmRisk).toBe(false);
    });

    it('should set rtmRisk to false if requirement or WBS links exist in fallbackTask', () => {
      const dto: any = {};
      service.applyRtmRisk(dto, { requirementIds: ['req-2'] } as any);
      expect(dto.rtmRisk).toBe(false);

      const dto2: any = {};
      service.applyRtmRisk(dto2, { journeyItemIds: ['ji-2'] } as any);
      expect(dto2.rtmRisk).toBe(false);

      const dto3: any = {};
      service.applyRtmRisk(dto3, { parentWbsNodeId: 'node-x' } as any);
      expect(dto3.rtmRisk).toBe(false);

      const dto4: any = {};
      service.applyRtmRisk(dto4, { wbsPath: '2.1' } as any);
      expect(dto4.rtmRisk).toBe(false);
    });

    it('should set rtmRisk to true if no links exist in dto or fallback', () => {
      const dto: any = {};
      service.applyRtmRisk(dto);
      expect(dto.rtmRisk).toBe(true);
      expect(dto.rtmRiskReason).toBeDefined();
    });
  });

  describe('applyEvmMetrics', () => {
    it('should return immediately if expectedMinutes cannot be resolved', () => {
      const dto: any = {};
      service.applyEvmMetrics(dto, null);
      expect(dto.evmProgress).toBeUndefined();
    });

    it('should calculate EVM metrics with alert when SPI is below 0.9', () => {
      const pastCreated = new Date(Date.now() - 100000);
      const deadline = new Date(Date.now() + 100000);
      const dto: any = {
        pertExpectedMinutes: 100,
        pomodorosPlanned: 4,
        pomodorosDid: 1, // progress = 0.25
        deadline,
      };
      const fallback: any = { createdAt: pastCreated };

      service.applyEvmMetrics(dto, fallback);
      expect(dto.evmProgress).toBe(0.25);
      expect(dto.evmEarnedValueMinutes).toBe(25);
      expect(dto.evmAlert).toBe('SPI abaixo de 0.9 (risco de atraso)');
    });

    it('should handle plannedValue <= 0 and progress > 0 (setting SPI to 1)', () => {
      const dto: any = {
        pertExpectedMinutes: 100,
        pomodorosPlanned: 4,
        pomodorosDid: 2,
        // no deadline, so elapsedRatio = 0 and plannedValue = 0
      };

      service.applyEvmMetrics(dto);
      expect(dto.evmProgress).toBe(0.5);
      expect(dto.evmSchedulePerformanceIndex).toBe(1);
      expect(dto.evmAlert).toBeUndefined();
    });

    it('should handle plannedValue <= 0 and progress === 0 (setting SPI to 0)', () => {
      const dto: any = {
        pertExpectedMinutes: 100,
        pomodorosPlanned: 4,
        pomodorosDid: 0,
      };

      service.applyEvmMetrics(dto);
      expect(dto.evmProgress).toBe(0);
      expect(dto.evmSchedulePerformanceIndex).toBe(0);
    });

    it('should resolve expected minutes and deadline from fallbackTask if absent in dto', () => {
      const dto: any = { pomodorosDid: 4 };
      const fallback: any = {
        pertExpectedMinutes: 120,
        pomodorosPlanned: 4,
        deadline: new Date(Date.now() + 50000),
        createdAt: new Date(Date.now() - 50000),
      };

      service.applyEvmMetrics(dto, fallback);
      expect(dto.evmProgress).toBe(1);
      expect(dto.evmEarnedValueMinutes).toBe(120);
    });

    it('should handle past deadline when deadline <= createdAt (elapsedRatio = 1)', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);
      const dto: any = {
        pertExpectedMinutes: 60,
        deadline: past,
      };
      const fallback: any = {
        createdAt: now,
      };

      service.applyEvmMetrics(dto, fallback);
      expect(dto.evmPlannedValueMinutes).toBe(60);
    });
  });

  describe('calculateDeadline', () => {
    it('should calculate realistic deadline based on expected minutes', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const deadline = service.calculateDeadline(now, 120); // 2 hours -> 2.2 hours -> 3 hours
      expect(deadline.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
