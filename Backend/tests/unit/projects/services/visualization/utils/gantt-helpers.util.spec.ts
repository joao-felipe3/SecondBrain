import {
  round2,
  toMinutes,
  mapWavesByTaskId,
  calculateFallbackProjectStart,
  mapMetricsByTaskId,
  getWaveBounds,
  calculateEffectiveEnd,
  adjustWindowToBounds,
  resolveWindowByDeadline,
  buildTaskNodes,
  mapSingleTaskItem,
  mapTaskItems,
  mapDependencyItems,
} from '@src/projects/services/visualization/utils/gantt-helpers.util';

describe('GanttHelpersUtil', () => {
  describe('round2 & toMinutes', () => {
    it('should round numbers correctly', () => {
      expect(round2(1.2345)).toBe(1.23);
      expect(round2(NaN)).toBe(0);
    });

    it('should compute task minutes from pert or pomodoro', () => {
      expect(toMinutes({ pertExpectedMinutes: 90 } as any)).toBe(90);
      expect(toMinutes({ pomodorosPlanned: 3 } as any)).toBe(75);
      expect(toMinutes({} as any)).toBe(60);
    });
  });

  describe('wave and date helpers', () => {
    it('should map waves by task id', () => {
      const wave: any = { taskIds: ['t1', 't2'] };
      const map = mapWavesByTaskId([wave]);
      expect(map.get('t1')).toBe(wave);
      expect(map.get('t2')).toBe(wave);
    });

    it('should calculate fallback project start date', () => {
      const p1: any = { startDate: '2026-01-01' };
      expect(calculateFallbackProjectStart(p1).toISOString()).toContain('2026-01-01');

      const p2: any = {};
      const w1: any = { startDate: '2026-02-01' };
      expect(calculateFallbackProjectStart(p2, w1).toISOString()).toContain('2026-02-01');
    });

    it('should map metrics by task id', () => {
      const tasks: any[] = [{ id: 't1', name: 'Task 1' }];
      const map = mapMetricsByTaskId(tasks);
      expect(map.get('t1')).toBe(tasks[0]);
    });

    it('should get wave bounds', () => {
      const wave: any = { startDate: '2026-01-01', endDate: '2026-02-01' };
      const bounds = getWaveBounds(wave);
      expect(bounds.start).toBeDefined();
      expect(bounds.end).toBeDefined();

      const emptyBounds = getWaveBounds(null);
      expect(emptyBounds.start).toBeNull();
    });

    it('should calculate effective end and adjust window to bounds', () => {
      const taskDeadline = new Date('2026-05-01');
      const waveEnd = new Date('2026-06-01');
      const end = calculateEffectiveEnd({ taskDeadline, waveEnd, projectDeadline: null });
      expect(end).toEqual(taskDeadline);

      const adjusted = adjustWindowToBounds({
        start: new Date('2026-01-01'),
        end: new Date('2026-01-02'),
        waveStart: new Date('2026-01-05'),
        waveEnd: new Date('2026-01-10'),
        durationMs: 86400000,
      });
      expect(adjusted.startDate).toBeDefined();
    });
  });

  describe('mapping tasks and dependencies for Gantt', () => {
    it('should build task nodes with dependencies', () => {
      const tasks: any[] = [{ _id: 't1', name: 'Task 1' }];
      const dependencies: any[] = [{ taskId: 't1', dependsOnTaskId: 't0' }];
      const nodes = buildTaskNodes({
        tasks,
        dependencies,
        normalizeRelationship: (r) => (r as any) || 'FS',
      });
      expect(nodes.length).toBe(1);
    });

    it('should map single task item & task items list', () => {
      const task: any = { _id: 't1', name: 'Task 1', deadline: '2026-03-01' };
      const project: any = { deadline: '2026-12-31' };
      const item = mapSingleTaskItem({ task, metric: undefined, wave: null, project });
      expect(item.id).toBe('t1');

      const items = mapTaskItems({
        tasks: [task],
        metricsById: new Map(),
        waveByTaskId: new Map(),
        project,
      });

      expect(items.length).toBe(1);
    });

    it('should map dependency items', () => {
      const deps: any[] = [
        { id: 'd1', taskId: 't2', dependsOnTaskId: 't1', relationship: 'finish-to-start' },
      ];

      const mapped = mapDependencyItems(deps);
      expect(mapped.length).toBe(1);
      expect(mapped[0].fromTaskId).toBe('t1');
      expect(mapped[0].toTaskId).toBe('t2');
    });
  });
});
