import {
  buildEVMCurvePoints,
  calculateActiveWavePlannedHours,
} from '@src/projects/services/evm/utils/evm-curve.util';

describe('evm-curve.util', () => {
  describe('buildEVMCurvePoints', () => {
    it('should calculate planned and actual curve points over scoped timeline entries', () => {
      const dto = {
        scopedEntries: [
          { date: '2026-01-01', completedHours: 2, plannedValue: 10 },
          { date: '2026-01-02', completedHours: 4, plannedValue: 10 },
        ],
        plannedHours: 20,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-05'),
      };

      const result = buildEVMCurvePoints(dto as any);
      expect(result.dates.length).toBe(2);
      expect(result.plannedValue.length).toBe(2);
      expect(result.actualValue.length).toBe(2);
      expect(result.actualValue[1]).toBeGreaterThan(result.actualValue[0]);
    });
  });

  describe('calculateActiveWavePlannedHours', () => {
    it('should proportionally divide planned hours across active waves based on duration', () => {
      const waves: any[] = [
        { startDate: '2026-01-01', endDate: '2026-01-11' }, // 10 days
        { startDate: '2026-01-11', endDate: '2026-01-21' }, // 10 days
      ];
      const activeWave = waves[0];

      const planned = calculateActiveWavePlannedHours(100, waves, activeWave);
      expect(planned).toBe(50);
    });

    it('should fallback to equal division when total duration is zero or invalid', () => {
      const waves: any[] = [
        { startDate: '2026-01-01', endDate: '2026-01-01' },
        { startDate: '2026-01-01', endDate: '2026-01-01' },
      ];
      const planned = calculateActiveWavePlannedHours(100, waves, waves[0]);
      expect(planned).toBe(50);
    });
  });
});
