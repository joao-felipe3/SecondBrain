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
});
