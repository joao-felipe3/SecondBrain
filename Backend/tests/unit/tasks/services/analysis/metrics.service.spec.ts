import { TasksMetricsService } from '@src/tasks/services/analysis/metrics.service';

describe('TasksMetricsService', () => {
  let service: TasksMetricsService;

  beforeEach(() => {
    service = new TasksMetricsService();
  });

  describe('applyPertEstimates', () => {
    it('should calculate and apply PERT estimates to dto', () => {
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
  });

  describe('applyRtmRisk', () => {
    it('should set rtmRisk to false if requirement or WBS links exist', () => {
      const dto: any = { parentWbsNodeId: 'wbs1' };
      service.applyRtmRisk(dto);
      expect(dto.rtmRisk).toBe(false);
    });

    it('should set rtmRisk to true if no links exist', () => {
      const dto: any = {};
      service.applyRtmRisk(dto);
      expect(dto.rtmRisk).toBe(true);
      expect(dto.rtmRiskReason).toBeDefined();
    });
  });

  describe('applyEvmMetrics & calculateDeadline', () => {
    it('should calculate EVM metrics for task', () => {
      const dto: any = {
        pomodorosPlanned: 4,
        pomodorosDid: 2,
        deadline: new Date(Date.now() + 86400000),
      };

      service.applyEvmMetrics(dto);
      expect(dto.evmProgress).toBe(0.5);
      expect(dto.evmEarnedValueMinutes).toBe(50);
    });

    it('should calculate realistic deadline based on expected minutes', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const deadline = service.calculateDeadline(now, 120); // 2 hours -> 2.2 hours -> 3 hours
      expect(deadline.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
