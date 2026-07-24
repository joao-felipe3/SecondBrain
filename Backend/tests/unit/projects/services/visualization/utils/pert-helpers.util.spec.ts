import {
  round2,
  toMinutes,
  buildTaskNodes,
  computeTaskLevels,
  mapNodes,
  mapEdges,
} from '@src/projects/services/visualization/utils/pert-helpers.util';

describe('PertHelpersUtil', () => {
  describe('round2 & toMinutes', () => {
    it('should round numbers to 2 decimals', () => {
      expect(round2(3.14159)).toBe(3.14);
      expect(round2(NaN)).toBe(0);
    });

    it('should convert task duration to minutes correctly', () => {
      expect(toMinutes({ pertExpectedMinutes: 45 } as any)).toBe(45);
      expect(toMinutes({ pomodorosPlanned: 2 } as any)).toBe(50);
      expect(toMinutes({} as any)).toBe(60);
    });
  });

  describe('buildTaskNodes', () => {
    it('should build task nodes with dependencies', () => {
      const tasks: any[] = [
        { _id: 't1', name: 'Task 1', pertExpectedMinutes: 30 },
        { _id: 't2', name: 'Task 2', pertExpectedMinutes: 60 },
      ];
      const dependencies: any[] = [
        { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FINISH_TO_START' },
      ];

      const nodes = buildTaskNodes({
        tasks,
        dependencies,
        normalizeRelationship: (rel) => (rel as any) || 'FINISH_TO_START',
      });

      expect(nodes.length).toBe(2);
      expect(nodes[1].dependencies).toEqual(['t1']);
    });
  });

  describe('computeTaskLevels, mapNodes, and mapEdges', () => {
    it('should compute task levels and map diagram nodes & edges', () => {
      const tasks: any[] = [
        { _id: 't1', name: 'Task 1', pertExpectedMinutes: 60 },
        { _id: 't2', name: 'Task 2', pertExpectedMinutes: 60, evmProgress: 0.5 },
      ];
      const dependencies: any[] = [
        { id: 'd1', taskId: 't2', dependsOnTaskId: 't1', relationship: 'finish-to-start' },
      ];

      const taskLevels = computeTaskLevels(tasks, dependencies);
      expect(taskLevels.get('t1')).toBe(0);
      expect(taskLevels.get('t2')).toBe(1);

      const metricsById = new Map<string, any>([
        ['t1', { earlyStart: 0, earlyFinish: 60, isCritical: true }],
        ['t2', { earlyStart: 60, earlyFinish: 120, isCritical: true }],
      ]);

      const nodes = mapNodes({ tasks, metricsById, taskLevels });
      expect(nodes.length).toBe(2);
      expect(nodes[0].isCritical).toBe(true);

      const taskNodesById = new Map<string, any>([
        ['t1', tasks[0]],
        ['t2', tasks[1]],
      ]);

      const edges = mapEdges({
        dependencies,
        taskNodesById,
        criticalPath: ['t1', 't2'],
      });

      expect(edges.length).toBe(1);
      expect(edges[0].isCriticalEdge).toBe(true);
    });
  });
});
