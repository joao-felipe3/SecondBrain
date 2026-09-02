import {
  toFiniteNumber,
  toBoundedScore,
  toWeekKey,
  getScheduleRatioByDates,
  scopeEntriesByWindow,
  estimateCompletionDate,
  calculateEffortBalanceScore,
  calculateConsistencyScore,
  calculateCompletionTrend,
  buildActionHint,
  buildPersonalMetrics,
} from '@src/projects/services/evm/utils/evm-calculations.util';
import { ProjectProgress } from '@src/projects/schemas/project-progress.schema';

describe('EVM Calculations Util', () => {
  describe('toFiniteNumber', () => {
    it('should return parsed number when finite', () => {
      expect(toFiniteNumber(42)).toBe(42);
      expect(toFiniteNumber('15.5')).toBe(15.5);
    });

    it('should return fallback when NaN or non-finite', () => {
      expect(toFiniteNumber(NaN, 10)).toBe(10);
      expect(toFiniteNumber(undefined, 5)).toBe(5);
      expect(toFiniteNumber(null, 0)).toBe(0);
      expect(toFiniteNumber('invalid', 99)).toBe(99);
    });
  });

  describe('toBoundedScore', () => {
    it('should clamp score between 0 and 100', () => {
      expect(toBoundedScore(-10)).toBe(0);
      expect(toBoundedScore(150)).toBe(100);
      expect(toBoundedScore(75.555)).toBe(75.6);
      expect(toBoundedScore(NaN)).toBe(0);
    });
  });

  describe('toWeekKey', () => {
    it('should format ISO week key string properly', () => {
      const date = new Date(Date.UTC(2026, 0, 7)); // Jan 7 2026
      const weekKey = toWeekKey(date);
      expect(weekKey).toMatch(/^2026-W\d{2}$/);
    });
  });

  describe('getScheduleRatioByDates', () => {
    it('should return null if startDate or endDate is missing', () => {
      expect(getScheduleRatioByDates(null, new Date())).toBeNull();
      expect(getScheduleRatioByDates(new Date(), null)).toBeNull();
    });

    it('should return null for invalid date strings or if endDate <= startDate', () => {
      expect(getScheduleRatioByDates(new Date('invalid'), new Date())).toBeNull();
      expect(getScheduleRatioByDates(new Date('2026-01-10'), new Date('2026-01-05'))).toBeNull();
      expect(getScheduleRatioByDates(new Date('2026-01-10'), new Date('2026-01-10'))).toBeNull();
    });

    it('should clamp ratio between 0 and 1', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-11'); // 10 days
      const before = new Date('2025-12-31');
      const mid = new Date('2026-01-06'); // 5 days -> 0.5
      const after = new Date('2026-01-15');

      expect(getScheduleRatioByDates(start, end, before)).toBe(0);
      expect(getScheduleRatioByDates(start, end, mid)).toBe(0.5);
      expect(getScheduleRatioByDates(start, end, after)).toBe(1);
    });
  });

  describe('scopeEntriesByWindow', () => {
    it('should return all entries if startDate or endDate is null', () => {
      const entries: ProjectProgress[] = [{ date: new Date('2026-01-05') } as any];
      expect(scopeEntriesByWindow(entries, null, new Date())).toEqual(entries);
      expect(scopeEntriesByWindow(entries, new Date(), null)).toEqual(entries);
    });

    it('should filter entries within date window', () => {
      const entries: ProjectProgress[] = [
        { date: new Date('2026-01-01') } as any,
        { date: new Date('2026-01-05') } as any,
        { date: new Date('2026-01-10') } as any,
      ];
      const start = new Date('2026-01-03');
      const end = new Date('2026-01-08');
      const filtered = scopeEntriesByWindow(entries, start, end);
      expect(filtered.length).toBe(1);
      expect(filtered[0].date).toEqual(entries[1].date);
    });
  });

  describe('estimateCompletionDate', () => {
    it('should return null if no baseline start date exists', () => {
      const result = estimateCompletionDate({
        project: null,
        metrics: { completedHours: 0, plannedHours: 10 },
        scopeStartDate: null,
        scopeEndDate: null,
      });
      expect(result).toBeNull();
    });

    it('should return baselineEnd when completedHours <= 0 and baselineEnd exists', () => {
      const deadline = new Date('2026-02-01');
      const result = estimateCompletionDate({
        project: { startDate: new Date('2026-01-01'), deadline } as any,
        metrics: { completedHours: 0, plannedHours: 10 },
        scopeStartDate: null,
        scopeEndDate: null,
      });
      expect(result).toBe(deadline.toISOString());
    });

    it('should return null when completedHours <= 0 and no baselineEnd exists', () => {
      const result = estimateCompletionDate({
        project: { startDate: new Date('2026-01-01') } as any,
        metrics: { completedHours: 0, plannedHours: 10 },
        scopeStartDate: null,
        scopeEndDate: null,
      });
      expect(result).toBeNull();
    });

    it('should compute estimated date properly with positive progress', () => {
      const pastStart = new Date();
      pastStart.setDate(pastStart.getDate() - 10);

      const result = estimateCompletionDate({
        project: { startDate: pastStart } as any,
        metrics: { completedHours: 20, plannedHours: 40 },
        scopeStartDate: null,
        scopeEndDate: null,
      });
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });
  });

  describe('calculateEffortBalanceScore', () => {
    it('should compute score based on difference between planned and completed', () => {
      expect(calculateEffortBalanceScore({ completedHours: 10, plannedHours: 10 })).toBe(100);
      expect(calculateEffortBalanceScore({ completedHours: 5, plannedHours: 10 })).toBe(50);
      expect(calculateEffortBalanceScore({ completedHours: 25, plannedHours: 10 })).toBe(0);
    });
  });

  describe('calculateConsistencyScore', () => {
    it('should return 100 for empty or single entry', () => {
      expect(calculateConsistencyScore([])).toBe(100);
      expect(calculateConsistencyScore([{ date: new Date(), completedHours: 5 } as any])).toBe(100);
    });

    it('should return 100 when all entries map to the same week', () => {
      const d1 = new Date('2026-01-05');
      const d2 = new Date('2026-01-06');
      expect(
        calculateConsistencyScore([
          { date: d1, completedHours: 5 } as any,
          { date: d2, completedHours: 5 } as any,
        ]),
      ).toBe(100);
    });

    it('should compute consistency across multiple weeks', () => {
      const d1 = new Date('2026-01-05');
      const d2 = new Date('2026-01-15');
      const score = calculateConsistencyScore([
        { date: d1, completedHours: 10 } as any,
        { date: d2, completedHours: 10 } as any,
      ]);
      expect(score).toBe(100); // exactly identical weekly averages
    });

    it('should return 0 if weekly average hours <= 0', () => {
      const d1 = new Date('2026-01-05');
      const d2 = new Date('2026-01-15');
      const score = calculateConsistencyScore([
        { date: d1, completedHours: 0 } as any,
        { date: d2, completedHours: 0 } as any,
      ]);
      expect(score).toBe(0);
    });
  });

  describe('calculateCompletionTrend', () => {
    it('should return insuficiente if entries < 4', () => {
      expect(calculateCompletionTrend([])).toBe('insuficiente');
      expect(
        calculateCompletionTrend([
          { date: '2026-01-01', completedHours: 1 } as any,
          { date: '2026-01-02', completedHours: 1 } as any,
          { date: '2026-01-03', completedHours: 1 } as any,
        ]),
      ).toBe('insuficiente');
    });

    it('should return insuficiente if all hours are 0', () => {
      const entries: ProjectProgress[] = [
        { date: '2026-01-01', completedHours: 0 } as any,
        { date: '2026-01-02', completedHours: 0 } as any,
        { date: '2026-01-03', completedHours: 0 } as any,
        { date: '2026-01-04', completedHours: 0 } as any,
      ];
      expect(calculateCompletionTrend(entries)).toBe('insuficiente');
    });

    it('should return acelerando when second half average is significantly higher', () => {
      const entries: ProjectProgress[] = [
        { date: '2026-01-01', completedHours: 1 } as any,
        { date: '2026-01-02', completedHours: 1 } as any,
        { date: '2026-01-03', completedHours: 5 } as any,
        { date: '2026-01-04', completedHours: 5 } as any,
      ];
      expect(calculateCompletionTrend(entries)).toBe('acelerando');
    });

    it('should return desacelerando when second half average is significantly lower', () => {
      const entries: ProjectProgress[] = [
        { date: '2026-01-01', completedHours: 5 } as any,
        { date: '2026-01-02', completedHours: 5 } as any,
        { date: '2026-01-03', completedHours: 1 } as any,
        { date: '2026-01-04', completedHours: 1 } as any,
      ];
      expect(calculateCompletionTrend(entries)).toBe('desacelerando');
    });

    it('should return estavel when averages are close', () => {
      const entries: ProjectProgress[] = [
        { date: '2026-01-01', completedHours: 5 } as any,
        { date: '2026-01-02', completedHours: 5 } as any,
        { date: '2026-01-03', completedHours: 5.1 } as any,
        { date: '2026-01-04', completedHours: 5 } as any,
      ];
      expect(calculateCompletionTrend(entries)).toBe('estavel');
    });
  });

  describe('buildActionHint', () => {
    it('should trigger effortBalanceScore hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 40,
        consistencyScore: 90,
        completionTrend: 'estavel',
        spi: 1.0,
        planAdherence: 95,
      });
      expect(hint).toContain('desequilibrado com o plano');
    });

    it('should trigger consistencyScore hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 80,
        consistencyScore: 40,
        completionTrend: 'estavel',
        spi: 1.0,
        planAdherence: 95,
      });
      expect(hint).toContain('meta minima semanal');
    });

    it('should trigger desacelerando hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 80,
        consistencyScore: 80,
        completionTrend: 'desacelerando',
        spi: 1.0,
        planAdherence: 95,
      });
      expect(hint).toContain('Seu ritmo esta caindo');
    });

    it('should trigger spi < 0.95 hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 80,
        consistencyScore: 80,
        completionTrend: 'estavel',
        spi: 0.9,
        planAdherence: 95,
      });
      expect(hint).toContain('abaixo do ritmo planejado');
    });

    it('should trigger planAdherence < 90 hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 80,
        consistencyScore: 80,
        completionTrend: 'estavel',
        spi: 1.0,
        planAdherence: 85,
      });
      expect(hint).toContain('oscila em relacao ao plano');
    });

    it('should return default good progress hint', () => {
      const hint = buildActionHint({
        effortBalanceScore: 90,
        consistencyScore: 90,
        completionTrend: 'estavel',
        spi: 1.0,
        planAdherence: 95,
      });
      expect(hint).toContain('Bom progresso');
    });
  });

  describe('buildPersonalMetrics', () => {
    it('should assemble personal metrics object properly with PV > 0', () => {
      const metrics = buildPersonalMetrics({
        entries: [],
        spi: 1.0,
        coreMetrics: {
          pv: 20,
          ev: 20,
          completedHours: 20,
          plannedHours: 20,
        },
      });

      expect(metrics.planAdherence).toBe(100);
      expect(metrics.perceivedValueScore).toBeGreaterThan(0);
      expect(metrics.actionHint).toBeDefined();
    });

    it('should handle PV <= 0 fallback to 100% adherence', () => {
      const metrics = buildPersonalMetrics({
        entries: [],
        spi: 1.0,
        coreMetrics: {
          pv: 0,
          ev: 0,
          completedHours: 0,
          plannedHours: 0,
        },
      });

      expect(metrics.planAdherence).toBe(100);
    });
  });
});
