import { Types } from 'mongoose';
import { calculateReplannedDeadlines } from '@src/projects/services/strategy/utils/rolling-wave-replan-helpers.util';
import { endOfDay, startOfDay } from '@src/projects/services/strategy/utils/rolling-wave-helpers.util';

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
        pomodorosPlanned: 16, // 8h
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
        pertExpectedMinutes: 240, // 4h
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

  it('should handle waves with empty pending tasks or undefined taskIds', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'planned',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        taskIds: [],
      },
      {
        waveNumber: 2,
        status: 'planned',
        startDate: '2026-01-11T00:00:00Z',
        endDate: '2026-01-20T00:00:00Z',
        // taskIds undefined -> fallback to []
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks: [], now });

    expect(result.updatedCount).toBe(0);
    expect(result.skippedConcludedCount).toBe(0);
    expect(result.bulkOps).toEqual([]);
    expect(result.summaries[0].effectiveStartDate).toBeNull();
  });

  it('should sort pending tasks by deadline, hours, and createdAt, handling missing properties', () => {
    const t1 = new Types.ObjectId();
    const t2 = new Types.ObjectId();
    const t3 = new Types.ObjectId();
    const t4 = new Types.ObjectId();
    const t5 = new Types.ObjectId();
    const t6 = new Types.ObjectId();
    const tMissing = new Types.ObjectId();

    const now = new Date('2026-01-01T10:00:00Z');

    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'planned', // no active wave -> first planned is anchor
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        taskIds: [t1, t2, t3, t4, t5, t6, tMissing], // tMissing tests filter(!task)
      },
    ];

    const tasks: any[] = [
      {
        _id: t1,
        // no deadline -> POSITIVE_INFINITY
        pomodorosPlanned: 4,
        createdAt: new Date('2025-12-02'),
      },
      {
        _id: t2,
        // no deadline -> POSITIVE_INFINITY, same hours as t1, earlier createdAt
        pomodorosPlanned: 4,
        createdAt: new Date('2025-12-01'),
      },
      {
        _id: t3,
        deadline: new Date('2026-01-05T00:00:00Z'),
        pomodorosPlanned: 10, // 5 hours (different hours than t4)
      },
      {
        _id: t4,
        deadline: new Date('2026-01-05T00:00:00Z'), // same deadline as t3, but fewer hours
        pomodorosPlanned: 2, // 1 hour
        // no createdAt
      },
      {
        _id: t5,
        deadline: new Date('2026-01-05T00:00:00Z'), // same deadline as t4 and same hours, but has createdAt
        pomodorosPlanned: 2,
        createdAt: new Date('2025-11-01'),
      },
      {
        _id: t6,
        deadline: new Date('2026-01-05T00:00:00Z'), // same deadline and same hours, also no createdAt
        pomodorosPlanned: 2,
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks, now });
    expect(result.updatedCount).toBe(6);
  });

  it('should handle anchorWaveIndex fallback to 0 when no active and no planned waves exist', () => {
    const t1 = new Types.ObjectId();
    const now = new Date('2026-01-01T10:00:00Z');

    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'completed',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-05T00:00:00Z',
        taskIds: [t1],
      },
    ];

    const tasks: any[] = [
      {
        _id: t1,
        deadline: new Date('2025-12-01T00:00:00Z'),
        isConcluded: false,
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks, now });
    expect(result.updatedCount).toBe(1);
  });

  it('should skip update when task already has matching calculated deadline', () => {
    const t1 = new Types.ObjectId();
    const now = new Date('2026-01-01T10:00:00Z');

    // 1 task in 1-day wave: dayOffset will be 0 -> nextDeadline is endOfDay(startOfDay(now))
    const expectedDeadline = endOfDay(startOfDay(now));

    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'active',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-01T23:59:59.999Z',
        taskIds: [t1],
      },
    ];

    const tasks: any[] = [
      {
        _id: t1,
        deadline: expectedDeadline, // Exactly equal to nextDeadline
        isConcluded: false,
        pomodorosPlanned: 2,
      },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks, now });
    // Since currentDeadlineTime === nextDeadline.getTime(), returns null and updatedCount is 0
    expect(result.updatedCount).toBe(0);
    expect(result.bulkOps.length).toBe(0);
  });

  it('should adjust effectiveEnd when cursor pushes wave start past originalEnd', () => {
    const t1 = new Types.ObjectId();
    const t2 = new Types.ObjectId();
    const now = new Date('2026-01-01T10:00:00Z');

    // Wave 1 ends on Jan 10. Wave 2 was originally Jan 02-05 (originalEnd < effectiveStart)
    const waves: any[] = [
      {
        waveNumber: 1,
        status: 'active',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-10T00:00:00Z',
        taskIds: [t1],
      },
      {
        waveNumber: 2,
        status: 'planned',
        startDate: '2026-01-02T00:00:00Z',
        endDate: '2026-01-05T00:00:00Z', // originalEnd is before cursor (which will be Jan 11)
        taskIds: [t2],
      },
    ];

    const tasks: any[] = [
      { _id: t1, isConcluded: false, pomodorosPlanned: 4 },
      { _id: t2, isConcluded: false, pomodorosPlanned: 4 },
    ];

    const result = calculateReplannedDeadlines({ waves, tasks, now });
    expect(result.summaries.length).toBe(2);
    // Wave 2 effectiveEnd must be extended past effectiveStart
    expect(new Date(result.summaries[1].effectiveEndDate!).getTime()).toBeGreaterThan(
      new Date(result.summaries[1].effectiveStartDate!).getTime(),
    );
  });
});
