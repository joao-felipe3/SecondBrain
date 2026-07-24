import { Types } from 'mongoose';
import { calculateReplannedDeadlines } from '@src/projects/services/strategy/utils/rolling-wave-replan-helpers.util';

describe('rolling-wave-replan-helpers.util', () => {
  it('should calculate replanned deadlines for waves and tasks', () => {
    const taskId1 = new Types.ObjectId();
    const taskId2 = new Types.ObjectId();
    const taskIdConcluded = new Types.ObjectId();

    const now = new Date('2026-01-01T10:00:00Z');

    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'active',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        taskIds: [taskId1, taskIdConcluded],
      },
      {
        waveNumber: 2,
        status: 'planned',
        startDate: '2026-01-11T00:00:00Z',
        endDate: '2026-01-20T00:00:00Z',
        taskIds: [taskId2],
      },
    ];

    const tasks: any[] = [
      {
        _id: taskId1,
        deadline: new Date('2025-12-30T00:00:00Z'), // needs update
        isConcluded: false,
        estimatedHours: 8,
        createdAt: new Date('2025-12-01'),
      },
      {
        _id: taskIdConcluded,
        deadline: new Date('2026-01-05T00:00:00Z'),
        isConcluded: true,
      },
      {
        _id: taskId2,
        deadline: new Date('2025-12-25T00:00:00Z'),
        isConcluded: false,
        optimistic: 2,
        mostLikely: 4,
        pessimistic: 6,
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks, now });

    expect(result.updatedCount).toBeGreaterThan(0);
    expect(result.skippedConcludedCount).toBe(1);
    expect(result.bulkOps.length).toBeGreaterThan(0);
    expect(result.summaries.length).toBe(2);
    expect(result.summaries[0].waveNumber).toBe(1);
    expect(result.summaries[0].skippedConcludedTasks).toBe(1);
  });

  it('should handle waves with empty pending tasks', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'planned',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        taskIds: [],
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks: [], now });

    expect(result.updatedCount).toBe(0);
    expect(result.skippedConcludedCount).toBe(0);
    expect(result.bulkOps).toEqual([]);
    expect(result.summaries[0].effectiveStartDate).toBeNull();
  });
});
