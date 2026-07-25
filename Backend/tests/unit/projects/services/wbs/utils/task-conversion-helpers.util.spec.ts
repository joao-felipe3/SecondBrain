import {
  hashKey,
  buildDraftsWithPlanCacheKey,
  mapWithConcurrency,
  collectLeafNodesInOrder,
  shrinkLeafTasksToTargetHours,
  convertWBSToTasks,
  convertDraftsToTasks,
  mapDraftsToTasks,
  generateFallbackTasks,
} from '@src/projects/services/wbs/utils/task-conversion-helpers.util';

describe('TaskConversionHelpersUtil', () => {
  describe('hashKey & buildDraftsWithPlanCacheKey', () => {
    it('should generate hash key and cache key', () => {
      const h = hashKey('test string');
      expect(h.length).toBe(16);

      const cacheKey = buildDraftsWithPlanCacheKey({
        projectId: 'p1',
        node: { _id: 'n1', name: 'Node 1', estimatedHours: 2 } as any,
        nodePath: 'root > Node 1',
        chunkMinutes: [60, 60],
        plan: {},
      });

      expect(cacheKey).toContain('drafts_with_plan:p1:');
    });
  });

  describe('mapWithConcurrency', () => {
    it('should map items with concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await mapWithConcurrency(items, 2, async (item) => item * 2);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });
  });

  describe('collectLeafNodesInOrder', () => {
    it('should collect leaf nodes in order', () => {
      const nodes: any[] = [
        {
          name: 'Parent',
          children: [
            { name: 'Leaf 1', children: [] },
            { name: 'Leaf 2', children: [] },
          ],
        },
      ];

      const leaves = collectLeafNodesInOrder(nodes);
      expect(leaves.length).toBe(2);
      expect(leaves[0].nodePath).toBe('Parent > Leaf 1');
    });
  });

  describe('shrinkLeafTasksToTargetHours', () => {
    it('should shrink tasks when current hours exceed target hours', () => {
      const tasks: any[] = [
        { pomodorosPlanned: 4 }, // 100 mins
        { pomodorosPlanned: 4 }, // 100 mins
      ]; // total 200 mins = 3.33 hours

      const res = shrinkLeafTasksToTargetHours(tasks, 2);
      expect(res.finalHours).toBeLessThanOrEqual(3.33);
    });

    it('should return current hours unchanged if within target', () => {
      const tasks: any[] = [{ pomodorosPlanned: 1 }]; // 25 mins = 0.41 hours
      const res = shrinkLeafTasksToTargetHours(tasks, 2);
      expect(res.finalHours).toBe(25 / 60);
    });
  });

  describe('convertWBSToTasks', () => {
    it('should convert WBS nodes to legacy tasks', () => {
      const nodes: any[] = [{ name: 'Leaf 1', estimatedHours: 2, children: [] }];
      const tasks = convertWBSToTasks(nodes, 'p1');
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].projectId).toBe('p1');
    });
  });

  describe('convertDraftsToTasks', () => {
    it('should convert draft array to task objects', () => {
      const drafts: any[] = [
        { name: 'Draft 1', pomodorosPlanned: 2, priority: 1, microTaskType: 'code' },
      ];

      const tasks = convertDraftsToTasks(drafts, { project: { _id: 'p1' } });
      expect(tasks.length).toBe(1);
      expect(tasks[0].name).toBe('Draft 1');
    });

    it('should return empty array if drafts is empty', () => {
      expect(convertDraftsToTasks([], {})).toEqual([]);
    });
  });

  describe('mapDraftsToTasks & generateFallbackTasks', () => {
    it('should map drafts to task DTOs', () => {
      const drafts: any[] = [{ name: 'D1' }, { name: 'D2' }];
      const dtos = mapDraftsToTasks({
        drafts,
        node: { name: 'Node 1' } as any,
        nodePath: 'path',
        projectId: 'p1',
        chunkMinutes: [60, 60],
        priorityOffset: 0,
        deadline: new Date(),
      });

      expect(dtos.length).toBe(2);
    });

    it('should generate fallback tasks when draft generation fails', () => {
      const fallbacks = generateFallbackTasks({
        node: { name: 'Node 1', description: 'Desc' } as any,
        nodePath: 'path',
        projectId: 'p1',
        chunkMinutes: [60, 60],
        priorityOffset: 0,
        deadline: new Date(),
      });

      expect(fallbacks.length).toBe(2);
      expect(fallbacks[0].name).toContain('Node 1');
    });
  });
});
