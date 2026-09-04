import { BadRequestException } from '@nestjs/common';
import {
  normalizeRecurringRule,
  ensureRequiredFields,
  normalizeFrequency,
  normalizeInterval,
  parseAndValidateEndDate,
  normalizeDaysOfWeek,
} from '@src/tasks/services/workflow/utils/recurring-validation.utils';

describe('recurring-validation.utils', () => {
  describe('ensureRequiredFields', () => {
    it('should throw BadRequestException if frequency or interval is missing', () => {
      expect(() => ensureRequiredFields(undefined)).toThrow(BadRequestException);
      expect(() => ensureRequiredFields({ frequency: 'daily' } as any)).toThrow(BadRequestException);
      expect(() => ensureRequiredFields({ interval: 1 } as any)).toThrow(BadRequestException);
    });

    it('should not throw if frequency and interval are present', () => {
      expect(() => ensureRequiredFields({ frequency: 'daily', interval: 1 })).not.toThrow();
    });
  });

  describe('normalizeFrequency', () => {
    it('should normalize valid frequencies case-insensitively', () => {
      expect(normalizeFrequency('DAILY')).toBe('daily');
      expect(normalizeFrequency('Weekly')).toBe('weekly');
      expect(normalizeFrequency('biweekly')).toBe('biweekly');
      expect(normalizeFrequency('Monthly')).toBe('monthly');
      expect(normalizeFrequency('custom')).toBe('custom');
    });

    it('should throw for unsupported frequency', () => {
      expect(() => normalizeFrequency('hourly')).toThrow(BadRequestException);
    });
  });

  describe('normalizeInterval', () => {
    it('should convert valid positive number to integer interval', () => {
      expect(normalizeInterval('3')).toBe(3);
      expect(normalizeInterval(2)).toBe(2);
    });

    it('should throw for invalid or non-positive interval', () => {
      expect(() => normalizeInterval(0)).toThrow(BadRequestException);
      expect(() => normalizeInterval(-1)).toThrow(BadRequestException);
      expect(() => normalizeInterval('abc')).toThrow(BadRequestException);
    });
  });

  describe('parseAndValidateEndDate', () => {
    it('should return undefined when raw is undefined or null', () => {
      expect(parseAndValidateEndDate(undefined)).toBeUndefined();
      expect(parseAndValidateEndDate(null)).toBeUndefined();
    });

    it('should parse valid Date and string date in the future', () => {
      const future = new Date(Date.now() + 10000000);
      expect(parseAndValidateEndDate(future)).toEqual(future);
      expect(parseAndValidateEndDate(future.toISOString())).toBeInstanceOf(Date);
    });

    it('should throw for invalid date string', () => {
      expect(() => parseAndValidateEndDate('invalid-date')).toThrow(BadRequestException);
    });

    it('should throw for past date if allowPast is false', () => {
      const past = new Date('2020-01-01');
      expect(() => parseAndValidateEndDate(past, false)).toThrow(BadRequestException);
    });

    it('should allow past date if allowPast is true', () => {
      const past = new Date('2020-01-01');
      expect(parseAndValidateEndDate(past, true)).toEqual(past);
    });
  });

  describe('normalizeDaysOfWeek', () => {
    it('should return undefined if raw is not an array or has no valid days', () => {
      expect(normalizeDaysOfWeek(undefined)).toBeUndefined();
      expect(normalizeDaysOfWeek('not-array')).toBeUndefined();
      expect(normalizeDaysOfWeek([7, 8, -1])).toBeUndefined();
    });

    it('should filter valid integer days between 0 and 6', () => {
      expect(normalizeDaysOfWeek([0, 1, 2, 7, 3.5, -1])).toEqual([0, 1, 2]);
    });
  });

  describe('normalizeRecurringRule', () => {
    it('should normalize full recurring rule including exceptions and daysOfWeek', () => {
      const future = new Date(Date.now() + 20000000);
      const rule = normalizeRecurringRule({
        frequency: 'weekly',
        interval: 2,
        daysOfWeek: [1, 3, 5],
        endDate: future,
        exceptions: [new Date('2026-10-01')],
      });

      expect(rule.frequency).toBe('weekly');
      expect(rule.interval).toBe(2);
      expect(rule.daysOfWeek).toEqual([1, 3, 5]);
      expect(rule.exceptions).toBeDefined();
    });
  });
});
