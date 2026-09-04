import {
  toDateKey,
  addDays,
  addMonths,
  normalizeChecklistFromTask,
  computeParentRecurringId,
  assembleOccurrencePayload,
} from '@src/tasks/services/workflow/utils/recurring.utils';

describe('recurring.utils', () => {
  describe('date manipulation', () => {
    it('should format toDateKey as YYYY-MM-DD', () => {
      const d = new Date(Date.UTC(2026, 4, 15));
      expect(toDateKey(d)).toBe('2026-05-15');
    });

    it('should add days and months correctly', () => {
      const base = new Date(Date.UTC(2026, 0, 10));
      const nextDay = addDays(base, 5);
      expect(nextDay.getUTCDate()).toBe(15);

      const nextMonth = addMonths(base, 2);
      expect(nextMonth.getUTCMonth()).toBe(2); // March
    });
  });

  describe('normalizeChecklistFromTask', () => {
    it('should return empty array if checklist is not an array', () => {
      expect(normalizeChecklistFromTask({} as any)).toEqual([]);
    });

    it('should normalize string items and object items in checklist', () => {
      const task: any = {
        checklist: [
          'Item 1',
          { item: 'Item 2', order: 5 },
          { item: '   ' }, // empty item trimmed out
          { item: 'Item 3' }, // order fallback to index
        ],
      };

      const normalized = normalizeChecklistFromTask(task);
      expect(normalized).toBeDefined();
      expect(normalized!.length).toBe(3);
      expect(normalized![0]).toEqual({ item: 'Item 1', completed: false, order: 0 });
      expect(normalized![1]).toEqual({ item: 'Item 2', completed: false, order: 5 });
      expect(normalized![2]).toEqual({ item: 'Item 3', completed: false, order: 3 });
    });
  });

  describe('computeParentRecurringId & assembleOccurrencePayload', () => {
    it('should return parentRecurringId if present or fallback to _id', () => {
      expect(computeParentRecurringId({ parentRecurringId: 'p123' } as any)).toBe('p123');
      expect(computeParentRecurringId({ _id: 'id123' } as any)).toBe('id123');
    });

    it('should assemble occurrence payload with reset fields and notification', () => {
      const deadline = new Date('2026-06-01T12:00:00Z');
      const payload = assembleOccurrencePayload({
        task: { name: 'Recurring Task' } as any,
        nextDeadline: deadline,
        recurringRule: { frequency: 'daily', interval: 1 },
        normalizedChecklist: [{ item: 'C1', completed: false, order: 0 }],
        parentRecurringId: 'parent1',
      });

      expect(payload.deadline).toBe(deadline);
      expect(payload.pomodorosDid).toBe(0);
      expect(payload.isConcluded).toBe(false);
      expect(payload.late).toBe(false);
      expect(payload.parentRecurringId).toBe('parent1');
      expect(payload.isRecurringInstance).toBe(true);
      expect(payload.status).toBe('todo');
      expect(payload.notification!.getTime()).toBe(deadline.getTime() - 60 * 60 * 1000);
    });
  });
});
