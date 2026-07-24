import {
  parseExceptions,
  extractExceptionDate,
  extractExceptionReason,
  cleanExceptions,
  isRecurringDateExcluded,
} from '@src/tasks/services/workflow/utils/recurring-exception.utils';

describe('recurring-exception.utils', () => {
  describe('parseExceptions, extractExceptionDate, extractExceptionReason', () => {
    it('should return undefined for invalid raw exception input', () => {
      expect(parseExceptions('invalid')).toBeUndefined();
      expect(extractExceptionDate(null)).toBeUndefined();
      expect(extractExceptionReason(123)).toBeUndefined();
    });

    it('should parse valid exception date objects and reason strings', () => {
      const raw = [{ date: '2026-06-01T00:00:00Z', reason: 'Feriado' }];
      const parsed = parseExceptions(raw);

      expect(parsed).toBeDefined();
      expect(parsed?.length).toBe(1);
      expect(parsed?.[0].reason).toBe('Feriado');
    });
  });

  describe('cleanExceptions & isRecurringDateExcluded', () => {
    it('should filter out exceptions past endDate or pruned past exceptions', () => {
      const exceptions = [
        { date: new Date('2026-10-01T00:00:00Z'), reason: 'Futuro' },
        { date: new Date('2020-01-01T00:00:00Z'), reason: 'Passado' },
      ];
      const cleaned = cleanExceptions(exceptions, new Date('2026-12-31'), true);
      expect(cleaned.length).toBe(1);
      expect(cleaned[0].reason).toBe('Futuro');
    });

    it('should check if recurring date is excluded', () => {
      const date = new Date('2026-06-01T00:00:00Z');
      const rule: any = {
        exceptions: [{ date: new Date('2026-06-01T00:00:00Z'), reason: 'Cancelado' }],
      };
      expect(isRecurringDateExcluded(date, rule)).toBe(true);

      const notExcluded = new Date('2026-06-02T00:00:00Z');
      expect(isRecurringDateExcluded(notExcluded, rule)).toBe(false);
    });
  });
});
