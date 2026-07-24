import { Types } from 'mongoose';
import { partitionTasksDeterministically } from '@src/projects/services/strategy/utils/rolling-wave-deterministic-helpers.util';

describe('rolling-wave-deterministic-helpers.util', () => {
  const today = new Date('2026-01-01T00:00:00Z');

  it('should throw error if project deadline is missing or invalid', () => {
    expect(() =>
      partitionTasksDeterministically({
        project: {} as any,
        tasks: [],
        wbsTree: [],
        dailyCapacityHours: 8,
        waveLengthDays: 7,
        today,
      }),
    ).toThrow('Project deadline is required');

    expect(() =>
      partitionTasksDeterministically({
        project: { deadline: 'invalid-date' } as any,
        tasks: [],
        wbsTree: [],
        dailyCapacityHours: 8,
        waveLengthDays: 7,
        today,
      }),
    ).toThrow('Invalid project deadline date format');

    expect(() =>
      partitionTasksDeterministically({
        project: { deadline: '2026-02-01' } as any,
        tasks: [],
        wbsTree: [],
        dailyCapacityHours: 0,
        waveLengthDays: 7,
        today,
      }),
    ).toThrow('Daily capacity hours must be greater than zero');
  });

  it('should partition tasks deterministically with deadlines and without deadlines', () => {
    const project = { deadline: new Date('2026-01-28T00:00:00Z') } as any;
    const taskWithDeadline = {
      _id: new Types.ObjectId(),
      deadline: new Date('2026-01-05T00:00:00Z'),
      estimatedHours: 4,
    };
    const taskWithoutDeadline = {
      _id: new Types.ObjectId(),
      estimatedHours: 12,
    };

    const result = partitionTasksDeterministically({
      project,
      tasks: [taskWithDeadline, taskWithoutDeadline] as any,
      wbsTree: [],
      dailyCapacityHours: 8,
      waveLengthDays: 7,
      today,
    });

    expect(result.waves.length).toBeGreaterThan(0);
    expect(result.waves[0].taskIds.length).toBeGreaterThan(0);
    expect(result.adjustedDeadline).toBeNull();
  });

  it('should calculate adjustedDeadline if total task hours exceed capacity', () => {
    const project = { deadline: new Date('2026-01-03T00:00:00Z') } as any; // 2 days planned
    const heavyTask = {
      _id: new Types.ObjectId(),
      pertExpectedMinutes: 6000, // 100 hours requires 13 days
    };

    const result = partitionTasksDeterministically({
      project,
      tasks: [heavyTask] as any,
      wbsTree: [],
      dailyCapacityHours: 8,
      waveLengthDays: 7,
      today,
    });

    expect(result.adjustedDeadline).not.toBeNull();
  });
});
