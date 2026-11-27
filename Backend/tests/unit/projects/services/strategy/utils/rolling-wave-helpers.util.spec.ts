import {
  estimateTaskHours,
  startOfDay,
  endOfDay,
  addDays,
  buildTaskScheduleMetrics,
} from '@src/projects/services/strategy/utils/rolling-wave-helpers.util';

describe('rolling-wave-helpers.util', () => {
  describe('date utilities', () => {
    it('should estimate task hours correctly based on PERT or pomodoros or fallback', () => {
      expect(estimateTaskHours({ pertExpectedMinutes: 120 })).toBe(2);
      expect(estimateTaskHours({ pomodorosPlanned: 4 })).toBe(2);
      expect(estimateTaskHours({})).toBe(1);
    });

    it('should startOfDay, endOfDay, and addDays accurately', () => {
      const base = new Date('2026-05-15T14:30:00Z');
      const start = startOfDay(base);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);

      const end = endOfDay(base);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);

      const added = addDays(base, 2);
      expect(added.getDate()).toBe(17);
    });
  });

  describe('buildTaskScheduleMetrics', () => {
    it('should return empty object if no expected minutes can be computed', () => {
      expect(buildTaskScheduleMetrics({}, new Date())).toEqual({});
    });

    it('should compute EVM progress, PV, EV, SPI, and alert when applicable', () => {
      const task = {
        pertExpectedMinutes: 100,
        pomodorosPlanned: 4,
        pomodorosDid: 1,
        createdAt: new Date(Date.now() - 5000),
      };
      const deadline = new Date(Date.now() + 5000);
      const metrics = buildTaskScheduleMetrics(task, deadline);

      expect(metrics.evmProgress).toBe(0.25);
      expect(metrics.evmPlannedValueMinutes).toBeGreaterThanOrEqual(0);
      expect(metrics.evmEarnedValueMinutes).toBe(25);
    });
  });

  describe('buildTaskScheduleMetrics edge cases', () => {
    it('should handle totalDurationMs <= 0 and plannedValue <= 0', () => {
      const now = new Date();
      const task = {
        pertExpectedMinutes: 60,
        createdAt: now,
      };
      // deadline equals createdAt
      const metrics = buildTaskScheduleMetrics(task, now);
      expect(metrics.evmPlannedValueMinutes).toBe(60);
    });

    it('should handle plannedValue <= 0 and progress > 0 (setting SPI to 1)', () => {
      const task = {
        pertExpectedMinutes: 60,
        pomodorosPlanned: 2,
        pomodorosDid: 1,
        createdAt: new Date(Date.now() + 100000), // future createdAt -> elapsedRatio = 0 -> plannedValue = 0
      };
      const deadline = new Date(Date.now() + 200000);
      const metrics = buildTaskScheduleMetrics(task, deadline);
      expect(metrics.evmSchedulePerformanceIndex).toBe(1);
      expect(metrics.evmAlert).toBeUndefined();
    });
  });
});
