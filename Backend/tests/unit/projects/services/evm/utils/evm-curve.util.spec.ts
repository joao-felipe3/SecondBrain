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

    it('should handle missing plannedValue and completedHours in entries (fallback to 0)', () => {
      const dto = {
        scopedEntries: [
          { date: '2026-01-01' }, // plannedValue & completedHours undefined
          { date: '2026-01-02', completedHours: 0, plannedValue: 0 },
        ],
        plannedHours: -5, // safePlannedHours fallback to 1
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-05'),
      };

      const result = buildEVMCurvePoints(dto as any);
      expect(result.dates.length).toBe(2);
      expect(result.plannedValue.length).toBe(2);
      expect(result.actualValue).toEqual([0, 0]);
    });

    it('should fallback to accumulating plannedValue when scheduleRatio is null and entries exist', () => {
      // Without valid start/end dates, scheduleRatio returns null
      const dto = {
        scopedEntries: [
          { date: '2026-01-01', completedHours: 1, plannedValue: 15 },
          { date: '2026-01-02', completedHours: 2, plannedValue: 25 },
          { date: '2026-01-03', completedHours: 1 }, // plannedValue undefined
        ],
        plannedHours: 50,
        startDate: null,
        endDate: null,
      };

      const result = buildEVMCurvePoints(dto as any);
      expect(result.dates.length).toBe(3);
      // 1st entry: plannedValue.length === 0 -> entry.plannedValue || 0 = 15
      expect(result.plannedValue[0]).toBe(15);
      // 2nd entry: plannedValue.length > 0 -> 15 + 25 = 40
      expect(result.plannedValue[1]).toBe(40);
      // 3rd entry: 40 + 0 = 40
      expect(result.plannedValue[2]).toBe(40);
    });

    it('should handle first entry having undefined plannedValue when scheduleRatio is null', () => {
      const dto = {
        scopedEntries: [
          { date: '2026-01-01' }, // plannedValue is undefined on first entry
        ],
        plannedHours: 10,
        startDate: null,
        endDate: null,
      };

      const result = buildEVMCurvePoints(dto as any);
      expect(result.plannedValue).toEqual([0]);
    });

    it('should handle empty scopedEntries gracefully', () => {
      const dto = {
        scopedEntries: [],
        plannedHours: 10,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-05'),
      };

      const result = buildEVMCurvePoints(dto as any);
      expect(result.dates).toEqual([]);
      expect(result.plannedValue).toEqual([]);
      expect(result.actualValue).toEqual([]);
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

    it('should fallback to safe division when waves array is empty', () => {
      const activeWave: any = { startDate: 'invalid', endDate: 'invalid' };
      const planned = calculateActiveWavePlannedHours(10, [], activeWave);
      expect(planned).toBe(10);
    });

    it('should clamp result to minimum 1 hour', () => {
      const waves: any[] = [{ startDate: '2026-01-01', endDate: '2026-01-05' }];
      const planned = calculateActiveWavePlannedHours(-10, waves, waves[0]);
      expect(planned).toBe(1);
    });
  });
});
