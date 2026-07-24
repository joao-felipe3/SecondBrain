import {
  inferHeuristicPhases,
  filterInvalidAndSelfEdges,
  keepAcyclic,
  truncateText,
  previewText,
  normalizeDependencies,
} from '@src/tasks/services/dependencies/utils/dependency-inference.utils';

describe('DependencyInferenceUtils', () => {
  describe('inferHeuristicPhases', () => {
    it('should return empty array if less than 2 tasks', () => {
      expect(inferHeuristicPhases([])).toEqual([]);
      expect(inferHeuristicPhases([{ id: 't1', name: 'Task 1' }] as any)).toEqual([]);
    });

    it('should infer heuristic phase dependencies for multi-phase tasks', () => {
      const tasks: any[] = [
        { id: 't1', name: 'Task 1', microTaskType: 'prepare' },
        { id: 't2', name: 'Task 2', microTaskType: 'produce' },
        { id: 't3', name: 'Task 3', microTaskType: 'test' },
      ];

      const deps = inferHeuristicPhases(tasks);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0].relationship).toBe('FINISH_TO_START');
    });
  });

  describe('filterInvalidAndSelfEdges & keepAcyclic', () => {
    it('should filter self edges, invalid IDs, and duplicates', () => {
      const validIds = new Set(['t1', 't2']);
      const deps: any[] = [
        { taskId: 't1', dependsOnTaskId: 't1' }, // self edge
        { taskId: 't1', dependsOnTaskId: 't99' }, // invalid dep
        { taskId: 't2', dependsOnTaskId: 't1' }, // valid
        { taskId: 't2', dependsOnTaskId: 't1' }, // duplicate
      ];

      const filtered = filterInvalidAndSelfEdges(deps, validIds);
      expect(filtered.length).toBe(1);
      expect(filtered[0]).toEqual({ taskId: 't2', dependsOnTaskId: 't1' });
    });

    it('should keep graph acyclic by discarding cyclic edges', () => {
      const taskIds = ['t1', 't2', 't3'];
      const deps: any[] = [
        { taskId: 't2', dependsOnTaskId: 't1' },
        { taskId: 't3', dependsOnTaskId: 't2' },
        { taskId: 't1', dependsOnTaskId: 't3' }, // creates cycle!
      ];

      const acyclic = keepAcyclic(taskIds, deps);
      expect(acyclic.length).toBe(2);
    });
  });

  describe('text formatting & normalization', () => {
    it('should truncate and preview text safely', () => {
      expect(truncateText(null, 10)).toBeUndefined();
      expect(truncateText('short', 10)).toBe('short');
      expect(truncateText('a very long string text', 10)).toBe('a very lon…');

      expect(previewText('  multiple   spaces  line  ', 10)).toBe('multiple s…');
    });

    it('should normalize raw dependency array formats', () => {
      const raw = [
        ['t2', 't1', 'FINISH_TO_START'],
        { taskId: 't3', dependsOnTaskId: 't2', reason: 'Sequential' },
      ];

      const normalized = normalizeDependencies(raw);
      expect(normalized.length).toBe(2);
      expect(normalized[0]).toEqual({
        taskId: 't2',
        dependsOnTaskId: 't1',
        relationship: 'FINISH_TO_START',
      });
      expect(normalized[1].reason).toBe('Sequential');
    });
  });
});
