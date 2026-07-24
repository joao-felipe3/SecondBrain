import {
  toFiniteNumber,
  toBoundedScore,
  toWeekKey,
  getScheduleRatioByDates,
  scopeEntriesByWindow,
  estimateCompletionDate,
  calculateConsistencyScore,
  calculateCompletionTrend,
  buildActionHint,
  buildPersonalMetrics,
} from '@src/projects/services/evm/utils/evm-calculations.util';

describe('evm-calculations.util', () => {
  it('toFiniteNumber & toBoundedScore', () => {
    expect(toFiniteNumber(10)).toBe(10);
    expect(toFiniteNumber(NaN, 5)).toBe(5);

    expect(toBoundedScore(120)).toBe(100);
    expect(toBoundedScore(-10)).toBe(0);
    expect(toBoundedScore(85.45)).toBe(85.5);
  });

  it('toWeekKey & getScheduleRatioByDates', () => {
    const key = toWeekKey(new Date('2026-01-15T00:00:00Z'));
    expect(key).toContain('2026-W');

    const ratio = getScheduleRatioByDates(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-11T00:00:00Z'),
      new Date('2026-01-06T00:00:00Z'),
    );
    expect(ratio).toBe(0.5);
  });

  it('scopeEntriesByWindow & estimateCompletionDate', () => {
    const entries: any[] = [{ date: new Date('2026-01-05') }, { date: new Date('2026-01-15') }];
    const scoped = scopeEntriesByWindow(entries, new Date('2026-01-01'), new Date('2026-01-10'));
    expect(scoped.length).toBe(1);

    const completionDate = estimateCompletionDate({
      project: { startDate: new Date('2026-01-01'), deadline: new Date('2026-02-01') } as any,
      metrics: { completedHours: 10, plannedHours: 20 },
      scopeStartDate: new Date('2026-01-01'),
      scopeEndDate: new Date('2026-02-01'),
    });

    expect(completionDate).not.toBeNull();
  });

  it('calculateConsistencyScore & calculateCompletionTrend', () => {
    const entries: any[] = [
      { date: '2026-01-01', completedHours: 5 },
      { date: '2026-01-08', completedHours: 5 },
      { date: '2026-01-15', completedHours: 6 },
      { date: '2026-01-22', completedHours: 7 },
    ];

    const consistency = calculateConsistencyScore(entries);
    expect(consistency).toBeGreaterThan(0);

    const trend = calculateCompletionTrend(entries);
    expect(['acelerando', 'estavel', 'desacelerando', 'insuficiente']).toContain(trend);
  });

  it('buildActionHint & buildPersonalMetrics', () => {
    const hint = buildActionHint({
      spi: 0.8,
      consistencyScore: 90,
      effortBalanceScore: 90,
      planAdherence: 90,
      completionTrend: 'estavel',
    });
    expect(hint).toContain('abaixo do ritmo planejado');

    const personalMetrics = buildPersonalMetrics({
      entries: [{ date: '2026-01-01', completedHours: 5 }] as any,
      spi: 1.0,
      coreMetrics: { completedHours: 10, plannedHours: 20, ev: 10, pv: 10 },
    });

    expect(personalMetrics.perceivedValueScore).toBeGreaterThan(0);
  });
});
