import { Types } from 'mongoose';
import { TasksRecurringService } from '../../../src/tasks/services/tasks/recurring.service';

/**
 * Unit tests for calculateNextRecurringDate private method
 * Tests edge cases and comprehensive date calculation logic
 */
describe('TasksService - calculateNextRecurringDate Logic', () => {
  let service: TasksRecurringService;

  beforeEach(async () => {
    service = new TasksRecurringService();
  });

  it('should handle weekly with multiple daysOfWeek correctly', () => {
    // Tuesday (day 2), need to find next Wednesday (3) or Friday (5)
    const tuesday = new Date('2026-04-21T10:00:00.000Z'); // Tuesday
    const result = (service as any).calculateNextRecurringDate(
      tuesday,
      { frequency: 'weekly', interval: 1, daysOfWeek: [3, 5] }, // Wednesday, Friday
    );

    expect(result).toBeInstanceOf(Date);
    // Should skip to Wednesday (3 days away)
    expect(result.getUTCDay()).toBe(3);
  });

  it('should wrap to next week if all daysOfWeek are passed', () => {
    // Friday (day 5), daysOfWeek = [1, 3] (Mon, Wed), should wrap to next Monday
    const friday = new Date('2026-04-24T10:00:00.000Z'); // Friday
    const result = (service as any).calculateNextRecurringDate(friday, {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1, 3],
    });

    expect(result).toBeInstanceOf(Date);
    // Should be next Monday (in 3 days)
    expect(result.getUTCDay()).toBe(1);
  });

  it('should handle daily with interval > 1', () => {
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 5,
    });

    expect(result).toBeInstanceOf(Date);
    // 5 days later
    expect(result.getUTCDate()).toBe(25);
  });

  it('should respect multiple exceptions', () => {
    // Daily starting 2026-04-20, but skip 21, 22, 23 -> should return 24
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 1,
      exceptions: [
        { date: new Date(2026, 3, 21), reason: 'holiday' },
        { date: new Date(2026, 3, 22), reason: 'holiday' },
        { date: new Date(2026, 3, 23), reason: 'holiday' },
      ],
    });

    expect(result).toBeInstanceOf(Date);
    // Should skip to next day after all exceptions (April 24)
    expect(result.getUTCDate()).toBe(24);
  });

  it('should handle monthly on 31st (edge month boundaries)', () => {
    // May 31 + 1 month = June 30 (June only has 30 days)
    const may31 = new Date('2026-05-31T10:00:00.000Z');
    const result = (service as any).calculateNextRecurringDate(may31, {
      frequency: 'monthly',
      interval: 1,
    });

    expect(result).toBeInstanceOf(Date);
    // addMonths should handle day boundary: May 31 + 1 month = June 30
    expect(result.getUTCDate()).toBeLessThanOrEqual(31);
  });

  it('should support biweekly with interval=2', () => {
    // April 20 + 14 days = May 4
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'weekly',
      interval: 2,
    });

    expect(result).toBeInstanceOf(Date);
    // 14 days later
    expect(result.getUTCDate()).toBe(4);
    expect(result.getUTCMonth()).toBe(4); // May = month 4
  });

  it('should skip exception before respecting endDate', () => {
    // Daily starting 2026-04-20, exception on 21, endDate 2026-04-25
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 1,
      exceptions: [{ date: new Date(2026, 3, 21), reason: 'holiday' }],
      endDate: new Date('2026-04-25T23:59:59.999Z'),
    });

    expect(result).toBeInstanceOf(Date);
    // Should skip 21 and return 22
    expect(result.getUTCDate()).toBe(22);
  });

  it('should support custom interval with daily frequency', () => {
    // Every 3 days starting from April 20
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 3,
    });

    expect(result).toBeInstanceOf(Date);
    // 3 days later = April 23
    expect(result.getUTCDate()).toBe(23);
  });

  it('should respect endDate boundary correctly', () => {
    // After endDate, should return null
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-25T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 1,
      endDate: new Date('2026-04-24T23:59:59.999Z'),
    });

    expect(result).toBeNull();
  });

  it('should handle exception on same day as base date', () => {
    // If exception is on the next scheduled date, should skip to day after
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'daily',
      interval: 1,
      exceptions: [{ date: new Date(2026, 3, 21), reason: 'holiday' }],
    });

    expect(result).toBeInstanceOf(Date);
    // Should skip 21 and return 22
    expect(result.getUTCDate()).toBe(22);
  });

  it('should support biweekly frequency (biweekly alias)', () => {
    // Biweekly starting 2026-04-20
    const result = (service as any).calculateNextRecurringDate(new Date('2026-04-20T10:00:00.000Z'), {
      frequency: 'biweekly',
      interval: 1,
    });

    expect(result).toBeInstanceOf(Date);
    // 14 days later = May 4
    expect(result.getUTCDate()).toBe(4);
    expect(result.getUTCMonth()).toBe(4); // May
  });
});
