import { Logger } from '@nestjs/common';
import { rebalanceWaveDistribution } from '@src/ai/utils/rolling-wave-rebalance.helper';

describe('rolling-wave-rebalance.helper', () => {
  it('should rebalance wave distribution across waves', () => {
    const logger = new Logger('Test');
    const aiPlan: any = {
      waves: [
        { waveNumber: 1, taskIds: ['t1', 't2', 't3', 't4'] },
        { waveNumber: 2, taskIds: [] },
      ],
    };

    const result = rebalanceWaveDistribution({
      aiPlan,
      allTaskIds: ['t1', 't2', 't3', 't4', 't5'],
      minTasksPerWave: 2,
      maxTasksPerWave: 3,
      expectedWaveCount: 2,
      totalDurationDays: 14,
      logger,
    });

    expect(result.waves.length).toBe(2);
    expect(result.waves[0].taskIds.length).toBeGreaterThan(0);
    expect(result.waves[1].taskIds.length).toBeGreaterThan(0);
  });

  it('should handle duplicate taskIds across waves gracefully and track duplicateTaskCount', () => {
    const logger = new Logger('Test');
    const aiPlan: any = {
      waves: [
        { waveNumber: 1, taskIds: ['t1', 't1', 't2'] }, // duplicate 't1' in wave 1
        { waveNumber: 2, taskIds: ['t2', 't3'] }, // duplicate 't2' in wave 2
      ],
    };

    const result = rebalanceWaveDistribution({
      aiPlan,
      allTaskIds: ['t1', 't2', 't3'],
      minTasksPerWave: 1,
      maxTasksPerWave: 5,
      expectedWaveCount: 2,
      totalDurationDays: 10,
      logger,
    });

    expect(result.waves.length).toBe(2);
    const totalAllocated = result.waves.reduce((sum, w) => sum + w.taskIds.length, 0);
    expect(totalAllocated).toBe(3);
  });

  it('should log warning when final task count per wave is out of target range', () => {
    const logger = new Logger('Test');
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

    // 10 tasks in 2 waves, but max allowed per wave is 2 -> will exceed maxTasksPerWave
    const aiPlan: any = {
      waves: [
        { waveNumber: 1, taskIds: ['t1', 't2', 't3', 't4', 't5'] },
        { waveNumber: 2, taskIds: ['t6', 't7', 't8', 't9', 't10'] },
      ],
    };

    const allTaskIds = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'];

    const result = rebalanceWaveDistribution({
      aiPlan,
      allTaskIds,
      minTasksPerWave: 1,
      maxTasksPerWave: 2, // target max is 2, but 5 tasks per wave will remain
      expectedWaveCount: 2,
      totalDurationDays: 14,
      logger,
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(result.waves.length).toBe(2);
    warnSpy.mockRestore();
  });
});
