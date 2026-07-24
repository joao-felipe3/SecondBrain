import {
  interpolateOrderAtIndex,
  calculateNextMaxOrder,
  resolveTargetOrder,
} from '@src/tasks/services/workflow/utils/kanban.utils';

describe('kanban.utils', () => {
  describe('interpolateOrderAtIndex', () => {
    it('should handle empty array', () => {
      expect(interpolateOrderAtIndex([], 0)).toBe(1);
    });

    it('should return prepended order when index <= 0', () => {
      expect(interpolateOrderAtIndex([10, 20, 30], 0)).toBe(9);
    });

    it('should return appended order when index >= length', () => {
      expect(interpolateOrderAtIndex([10, 20, 30], 5)).toBe(31);
    });

    it('should interpolate mid-index order', () => {
      expect(interpolateOrderAtIndex([10, 20, 30], 1)).toBe(15);
    });
  });

  describe('calculateNextMaxOrder & resolveTargetOrder', () => {
    it('should calculate next max order', () => {
      expect(calculateNextMaxOrder(5)).toBe(6);
      expect(calculateNextMaxOrder(null)).toBe(1);
    });

    it('should resolve explicit toOrder if provided', async () => {
      const mockTaskModel: any = {};
      const order = await resolveTargetOrder(mockTaskModel, 'p1', 'doing' as any, {
        status: 'doing',
        toOrder: 42,
      });
      expect(order).toBe(42);
    });

    it('should resolve order via destination tasks when toIndex is provided', async () => {
      const mockTaskModel: any = {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([{ kanbanOrder: 10 }, { kanbanOrder: 20 }]),
            }),
          }),
        }),
      };

      const order = await resolveTargetOrder(mockTaskModel, 'p1', 'todo' as any, {
        status: 'todo',
        toIndex: 1,
      });
      expect(order).toBe(15);
    });
  });
});
