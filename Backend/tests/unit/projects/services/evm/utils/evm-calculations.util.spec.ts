import {
  toFiniteNumber,
  toBoundedScore,
  toWeekKey,
  getScheduleRatioByDates,
  calculateEffortBalanceScore,
} from '../../../../../../src/projects/services/evm/utils/evm-calculations.util';

describe('evm-calculations.util', () => {
  describe('toFiniteNumber', () => {
    it('deve converter valores válidos e usar fallback em nulos ou NaNs', () => {
      expect(toFiniteNumber(42)).toBe(42);
      expect(toFiniteNumber('10.5')).toBe(10.5);
      expect(toFiniteNumber(NaN, 5)).toBe(5);
      expect(toFiniteNumber(undefined, 0)).toBe(0);
    });
  });

  describe('toBoundedScore', () => {
    it('deve limitar pontuações entre 0 e 100 com 1 casa decimal', () => {
      expect(toBoundedScore(105)).toBe(100);
      expect(toBoundedScore(-10)).toBe(0);
      expect(toBoundedScore(75.56)).toBe(75.6);
    });
  });

  describe('toWeekKey', () => {
    it('deve gerar chave de semana no formato YYYY-Www', () => {
      const date = new Date('2026-07-23T12:00:00Z');
      const weekKey = toWeekKey(date);

      expect(weekKey).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  describe('getScheduleRatioByDates', () => {
    it('deve calcular a proporção entre data de início e fim', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const end = new Date('2026-01-10T00:00:00Z');
      const at = new Date('2026-01-05T12:00:00Z');

      const ratio = getScheduleRatioByDates(start, end, at);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('deve retornar null se datas forem inválidas', () => {
      expect(getScheduleRatioByDates(null, new Date())).toBeNull();
    });
  });

  describe('calculateEffortBalanceScore', () => {
    it('deve calcular o score de equilíbrio de esforço', () => {
      const score = calculateEffortBalanceScore({ completedHours: 10, plannedHours: 10 });
      expect(score).toBe(100);
    });
  });
});
