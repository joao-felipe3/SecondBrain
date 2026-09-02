import {
  round2,
  toMinutes,
  buildTaskNodes,
  computeTaskLevels,
  mapNodes,
  mapEdges,
} from '@src/projects/services/visualization/utils/pert-helpers.util';
import { TaskPertContext } from '@src/tasks/interfaces/task-contexts.interface';
import { TaskDependency } from '@src/tasks/entities/task-dependency.entity';

describe('PERT Helpers Util', () => {
  describe('round2', () => {
    it('should round numbers to 2 decimal places', () => {
      expect(round2(1.2345)).toBe(1.23);
      expect(round2(1.236)).toBe(1.24);
      expect(round2(10)).toBe(10);
    });

    it('should return 0 for non-finite values', () => {
      expect(round2(NaN)).toBe(0);
      expect(round2(Infinity)).toBe(0);
      expect(round2(-Infinity)).toBe(0);
    });
  });

  describe('toMinutes', () => {
    it('should return pertExpectedMinutes if > 0', () => {
      expect(toMinutes({ pertExpectedMinutes: 45 } as TaskPertContext)).toBe(45);
    });

    it('should calculate from pomodorosPlanned if pertExpectedMinutes is absent', () => {
      expect(toMinutes({ pomodorosPlanned: 3 } as TaskPertContext)).toBe(75);
    });

    it('should fallback to 60 minutes if neither is available or > 0', () => {
      expect(toMinutes({} as TaskPertContext)).toBe(60);
      expect(toMinutes({ pertExpectedMinutes: 0, pomodorosPlanned: 0 } as TaskPertContext)).toBe(60);
      expect(toMinutes(null as any)).toBe(60);
    });
  });

  describe('buildTaskNodes', () => {
    it('should map tasks and link valid dependencies', () => {
      const tasks: TaskPertContext[] = [
        {
          _id: 'task-1',
          name: 'Task 1',
          pertExpectedMinutes: 60,
          parentWbsNodeId: 'wbs-1',
          wbsPath: '1.1',
        } as TaskPertContext,
        {
          id: 'task-2',
          name: 'Task 2',
          pomodorosPlanned: 2,
        } as TaskPertContext,
        {
          // minimal task
        } as TaskPertContext,
      ];

      const dependencies: TaskDependency[] = [
        {
          taskId: 'task-2',
          dependsOnTaskId: 'task-1',
          relationship: 'FS',
        } as any,
        {
          taskId: '   ', // empty -> ignored
          dependsOnTaskId: 'task-1',
        } as any,
        {
          taskId: 'non-existent',
          dependsOnTaskId: 'task-1',
        } as any,
      ];

      const normalizeRel = jest.fn((r) => r || 'FS');
      const nodes = buildTaskNodes({
        tasks,
        dependencies,
        normalizeRelationship: normalizeRel,
      });

      expect(nodes.length).toBe(3);
      expect(nodes[0].id).toBe('task-1');
      expect(nodes[0].parentWbsNodeId).toBe('wbs-1');
      expect(nodes[0].wbsPath).toBe('1.1');
      expect(nodes[1].id).toBe('task-2');
      expect(nodes[1].dependencies).toContain('task-1');
      expect(nodes[1].dependencyEdges?.[0].relationship).toBe('FS');
      expect(nodes[2].name).toBe('Task');
    });
  });

  describe('computeTaskLevels', () => {
    it('should compute topological depth levels', () => {
      const tasks: TaskPertContext[] = [
        { id: 't1' } as TaskPertContext,
        { id: 't2' } as TaskPertContext,
        { id: 't3' } as TaskPertContext,
      ];

      const dependencies: TaskDependency[] = [
        { taskId: 't2', dependsOnTaskId: 't1' } as any,
        { taskId: 't3', dependsOnTaskId: 't2' } as any,
        { taskId: 't3', dependsOnTaskId: 'unknown' } as any, // ignored
      ];

      const levels = computeTaskLevels(tasks, dependencies);
      expect(levels.get('t1')).toBe(0);
      expect(levels.get('t2')).toBe(1);
      expect(levels.get('t3')).toBe(2);
    });

    it('should handle cycles gracefully by breaking recursion', () => {
      const tasks: TaskPertContext[] = [
        { id: 't1' } as TaskPertContext,
        { id: 't2' } as TaskPertContext,
      ];

      const dependencies: TaskDependency[] = [
        { taskId: 't1', dependsOnTaskId: 't2' } as any,
        { taskId: 't2', dependsOnTaskId: 't1' } as any,
      ];

      const levels = computeTaskLevels(tasks, dependencies);
      expect(levels.get('t1')).toBeDefined();
      expect(levels.get('t2')).toBeDefined();
    });
  });

  describe('mapNodes', () => {
    it('should map task metrics, levels and progress', () => {
      const tasks: TaskPertContext[] = [
        {
          _id: 't1',
          name: 'Task One',
          pertExpectedMinutes: 120,
          evmProgress: 0.5,
          isConcluded: true,
          priority: 2,
          parentWbsNodeId: 'wbs-1',
          wbsPath: '1.1',
        } as TaskPertContext,
        {
          id: 't2',
          // minimal
        } as TaskPertContext,
      ];

      const metricsById = new Map<string, any>();
      metricsById.set('t1', {
        earlyStart: 2,
        earlyFinish: 4,
        lateStart: 3,
        lateFinish: 5,
        slack: 1,
        isCritical: true,
      });

      const taskLevels = new Map<string, number>();
      taskLevels.set('t1', 1);

      const nodes = mapNodes({ tasks, metricsById, taskLevels });

      expect(nodes.length).toBe(2);
      expect(nodes[0].durationHours).toBe(2);
      expect(nodes[0].earlyStart).toBe(2);
      expect(nodes[0].isCritical).toBe(true);
      expect(nodes[0].progress).toBe(50);
      expect(nodes[0].isConcluded).toBe(true);
      expect(nodes[0].x).toBe(1);
      expect(nodes[0].y).toBe(2);

      expect(nodes[1].name).toBe('Task');
      expect(nodes[1].x).toBe(0);
      expect(nodes[1].isCritical).toBe(false);
    });
  });

  describe('mapEdges', () => {
    it('should map dependency edges and identify critical edges', () => {
      const dependencies: TaskDependency[] = [
        {
          id: 'dep-1',
          taskId: 't2',
          dependsOnTaskId: 't1',
          relationship: 'FS',
          reason: 'Blocking',
          isAutoIdentified: true,
        } as any,
        {
          taskId: 't3',
          dependsOnTaskId: 't2',
        } as any,
        {
          taskId: 't4', // not in taskNodesById
          dependsOnTaskId: 't1',
        } as any,
        {
          taskId: '',
          dependsOnTaskId: 't1',
        } as any,
      ];

      const taskNodesById = new Map<string, any>([
        ['t1', {}],
        ['t2', {}],
        ['t3', {}],
      ]);

      const criticalPath = ['t1', 't2'];

      const edges = mapEdges({
        dependencies,
        taskNodesById,
        criticalPath,
      });

      expect(edges.length).toBe(2);
      expect(edges[0].id).toBe('dep-1');
      expect(edges[0].isCriticalEdge).toBe(true);
      expect(edges[0].isAutoIdentified).toBe(true);
      expect(edges[0].reason).toBe('Blocking');

      expect(edges[1].id).toBe('t2-t3');
      expect(edges[1].relationship).toBe('finish-to-start');
      expect(edges[1].isCriticalEdge).toBe(false);
    });
  });
});
