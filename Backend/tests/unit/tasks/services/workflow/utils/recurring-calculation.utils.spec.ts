import {
  calculateNextRecurringDate,
  getRecurringStepDays,
  getAllowedDays,
  isAfterRecurringEnd,
  getRecurringEndDate,
  calculateFirstRecurringDate,
} from '@src/tasks/services/workflow/utils/recurring-calculation.utils';
import { toDateKey } from '@src/tasks/services/workflow/utils/recurring.utils';

describe('recurring-calculation.utils', () => {
  describe('helper calculations', () => {
    it('should compute getRecurringStepDays for weekly, biweekly and other', () => {
      expect(getRecurringStepDays({ frequency: 'weekly', interval: 2 })).toBe(14);
      expect(getRecurringStepDays({ frequency: 'biweekly', interval: 1 })).toBe(14);
      expect(getRecurringStepDays({ frequency: 'daily', interval: 3 })).toBe(3);
    });

    it('should return allowedDays or null', () => {
      expect(getAllowedDays({ frequency: 'weekly', interval: 1, daysOfWeek: [1, 2] })).toEqual([1, 2]);
      expect(getAllowedDays({ frequency: 'weekly', interval: 1, daysOfWeek: [] })).toBeNull();
      expect(getAllowedDays({ frequency: 'weekly', interval: 1 })).toBeNull();
    });

    it('should determine isAfterRecurringEnd and getRecurringEndDate', () => {
      const end = new Date('2026-06-01T00:00:00Z');
      expect(isAfterRecurringEnd(new Date('2026-06-02T00:00:00Z'), end)).toBe(true);
      expect(isAfterRecurringEnd(new Date('2026-05-31T00:00:00Z'), end)).toBe(false);
      expect(isAfterRecurringEnd(new Date('2026-06-02T00:00:00Z'), undefined)).toBe(false);

      expect(getRecurringEndDate({ frequency: 'daily', interval: 1, endDate: end })).toEqual(end);
      expect(getRecurringEndDate({ frequency: 'daily', interval: 1 })).toBeUndefined();
    });
  });

  describe('calculateNextRecurringDate', () => {
    it('should return null if base date is already after endDate', () => {
      const ref = new Date('2026-06-05T00:00:00Z');
      const rule = {
        frequency: 'daily',
        interval: 1,
        endDate: new Date('2026-06-01T00:00:00Z'),
      };
      expect(calculateNextRecurringDate(ref, rule)).toBeNull();
    });

    it('should calculate next date for daily stepped recurrence', () => {
      const ref = new Date('2026-01-01T10:00:00Z');
      const rule = { frequency: 'daily', interval: 2 };
      const next = calculateNextRecurringDate(ref, rule);
      expect(next).toBeDefined();
      expect(toDateKey(next!)).toBe('2026-01-03');
    });

    it('should calculate next date for monthly recurrence', () => {
      const ref = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));
      const rule = { frequency: 'monthly', interval: 1 };
      const next = calculateNextRecurringDate(ref, rule);
      expect(next).toBeDefined();
      expect(next!.getUTCMonth()).toBe(1); // February
    });

    it('should return null for monthly recurrence if candidate exceeds endDate', () => {
      const ref = new Date('2026-01-15T00:00:00Z');
      const rule = {
        frequency: 'monthly',
        interval: 2,
        endDate: new Date('2026-02-01T00:00:00Z'),
      };
      expect(calculateNextRecurringDate(ref, rule)).toBeNull();
    });

    it('should skip excluded dates in monthly recurrence and pick subsequent', () => {
      const ref = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));
      const rule = {
        frequency: 'monthly',
        interval: 1,
        exceptions: [new Date('2026-02-15')],
      };
      const next = calculateNextRecurringDate(ref, rule);
      expect(next).toBeDefined();
      expect(next!.getUTCMonth()).toBe(2); // March
    });

    it('should obey allowed daysOfWeek in stepped recurrence', () => {
      // 2026-01-01 is Thursday (day 4)
      const ref = new Date('2026-01-01T00:00:00Z');
      const rule = {
        frequency: 'daily',
        interval: 1,
        daysOfWeek: [1], // Monday only
      };
      const next = calculateNextRecurringDate(ref, rule);
      expect(next).toBeDefined();
      expect(next!.getUTCDay()).toBe(1); // Monday
    });

    it('should return null if stepped recurrence cannot find date within 365 days before endDate', () => {
      const ref = new Date('2026-01-01T00:00:00Z');
      const rule = {
        frequency: 'daily',
        interval: 1,
        endDate: new Date('2026-01-02T00:00:00Z'),
        daysOfWeek: [5], // Friday (Jan 2 is Friday, candidate offset Jan 2 is >= end so returns null)
      };
      expect(calculateNextRecurringDate(ref, rule)).toBeNull();
    });
  });

  describe('calculateFirstRecurringDate', () => {
    it('should return null if startDate is after endDate', () => {
      const start = new Date('2026-06-10T00:00:00Z');
      const rule = {
        frequency: 'daily',
        interval: 1,
        endDate: new Date('2026-06-01T00:00:00Z'),
      };
      expect(calculateFirstRecurringDate(start, rule)).toBeNull();
    });

    it('should return base if first monthly recurring date is not excluded', () => {
      const start = new Date(Date.UTC(2026, 2, 10, 10, 0, 0));
      const rule = { frequency: 'monthly', interval: 1 };
      const first = calculateFirstRecurringDate(start, rule);
      expect(first).toBeDefined();
      expect(toDateKey(first!)).toBe('2026-03-10');
    });

    it('should calculate next if first monthly date is excluded', () => {
      const start = new Date(Date.UTC(2026, 2, 10, 10, 0, 0));
      const rule = {
        frequency: 'monthly',
        interval: 1,
        exceptions: [new Date('2026-03-10')],
      };
      const first = calculateFirstRecurringDate(start, rule);
      expect(first).toBeDefined();
      expect(toDateKey(first!)).toBe('2026-04-10');
    });

    it('should find first allowed recurring date with daysOfWeek restriction', () => {
      // 2026-01-01 is Thursday
      const start = new Date('2026-01-01T00:00:00Z');
      const rule = {
        frequency: 'daily',
        interval: 1,
        daysOfWeek: [6], // Saturday
      };
      const first = calculateFirstRecurringDate(start, rule);
      expect(first).toBeDefined();
      expect(first!.getUTCDay()).toBe(6);
    });
  });
});
