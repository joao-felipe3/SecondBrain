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
  mapTaskItems,
  mapDependencyItems,
} from '@src/projects/services/visualization/utils/gantt-helpers.util';
import { ProjectWaveDocument } from '@src/projects/schemas/project-wave.schema';
import { TaskDependency } from '@src/tasks/entities/task-dependency.entity';

describe('Gantt Helpers Util', () => {
  describe('round2', () => {
    it('should round numbers to 2 decimal places', () => {
      expect(round2(1.2345)).toBe(1.23);
      expect(round2(NaN)).toBe(0);
      expect(round2(Infinity)).toBe(0);
    });
  });

  describe('toMinutes', () => {
    it('should return pertExpectedMinutes if > 0', () => {
      expect(toMinutes({ pertExpectedMinutes: 90 } as any)).toBe(90);
    });

    it('should return pomodorosPlanned * 25 if pertExpectedMinutes absent', () => {
      expect(toMinutes({ pomodorosPlanned: 2 } as any)).toBe(50);
    });

    it('should fallback to 60', () => {
      expect(toMinutes({} as any)).toBe(60);
      expect(toMinutes({ pertExpectedMinutes: 0 } as any)).toBe(60);
    });
  });

  describe('mapWavesByTaskId', () => {
    it('should index waves by taskIds', () => {
      const waves = [
        {
          taskIds: ['t1', 't2'],
          waveNumber: 1,
        } as unknown as ProjectWaveDocument,
        {
          waveNumber: 2,
        } as unknown as ProjectWaveDocument, // no taskIds
      ];

      const mapped = mapWavesByTaskId(waves);
      expect(mapped.get('t1')).toBe(waves[0]);
      expect(mapped.get('t2')).toBe(waves[0]);
      expect(mapped.has('t3')).toBe(false);
    });
  });

  describe('calculateFallbackProjectStart', () => {
    it('should prioritize project.startDate', () => {
      const start = calculateFallbackProjectStart(
        { startDate: new Date('2026-01-01') } as any,
        { startDate: new Date('2026-02-01') } as any,
      );
      expect(start).toEqual(new Date('2026-01-01'));
    });

    it('should fallback to firstWave.startDate', () => {
      const start = calculateFallbackProjectStart(
        {} as any,
        { startDate: new Date('2026-02-01') } as any,
      );
      expect(start).toEqual(new Date('2026-02-01'));
    });

    it('should fallback to new Date() if both missing', () => {
      const start = calculateFallbackProjectStart({} as any);
      expect(start).toBeInstanceOf(Date);
    });
  });

  describe('mapMetricsByTaskId', () => {
    it('should map tasks by their ID', () => {
      const mapped = mapMetricsByTaskId([{ id: 't1', name: 'Task 1', duration: 60, dependencies: [] }]);
      expect(mapped.get('t1')?.duration).toBe(60);
    });
  });

  describe('getWaveBounds', () => {
    it('should return null start/end for null wave', () => {
      expect(getWaveBounds(null)).toEqual({ start: null, end: null });
    });

    it('should extract start and end from wave', () => {
      const wave = {
        startDate: '2026-01-01',
        endDate: '2026-01-10',
      } as any;
      const bounds = getWaveBounds(wave);
      expect(bounds.start).toEqual(new Date('2026-01-01'));
      expect(bounds.end).toEqual(new Date('2026-01-10'));
    });
  });

  describe('calculateEffectiveEnd', () => {
    it('should pick taskDeadline, capped by waveEnd', () => {
      const taskDeadline = new Date('2026-01-20');
      const waveEnd = new Date('2026-01-15');
      const end = calculateEffectiveEnd({
        taskDeadline,
        waveEnd,
        projectDeadline: null,
      });
      expect(end).toEqual(waveEnd);
    });

    it('should fallback to projectDeadline when taskDeadline and waveEnd are absent', () => {
      const projectDeadline = new Date('2026-01-30');
      const end = calculateEffectiveEnd({
        taskDeadline: null,
        waveEnd: null,
        projectDeadline,
      });
      expect(end).toEqual(projectDeadline);
    });

    it('should fallback to new Date() when all are absent', () => {
      const end = calculateEffectiveEnd({
        taskDeadline: null,
        waveEnd: null,
        projectDeadline: null,
      });
      expect(end).toBeInstanceOf(Date);
    });
  });

  describe('adjustWindowToBounds', () => {
    it('should clamp start to waveStart if start is before waveStart', () => {
      const adjusted = adjustWindowToBounds({
        start: new Date('2026-01-01'),
        end: new Date('2026-01-10'),
        waveStart: new Date('2026-01-03'),
        waveEnd: new Date('2026-01-15'),
        durationMs: 3600000,
      });
      expect(adjusted.startDate).toEqual(new Date('2026-01-03'));
    });

    it('should adjust if effectiveStart is after waveEnd', () => {
      const adjusted = adjustWindowToBounds({
        start: new Date('2026-01-20'),
        end: new Date('2026-01-25'),
        waveStart: new Date('2026-01-01'),
        waveEnd: new Date('2026-01-10'),
        durationMs: 3600000, // 1h
      });
      expect(adjusted.endDate).toEqual(new Date('2026-01-10'));
      expect(adjusted.startDate.getTime()).toBeLessThan(adjusted.endDate.getTime());
    });

    it('should prevent inverted start > end dates', () => {
      const adjusted = adjustWindowToBounds({
        start: new Date('2026-01-10'),
        end: new Date('2026-01-05'),
        waveStart: null,
        waveEnd: null,
        durationMs: 3600000,
      });
      expect(adjusted.startDate.getTime()).toBeLessThan(adjusted.endDate.getTime());
    });
  });

  describe('resolveWindowByDeadline', () => {
    it('should return ISO start and end dates', () => {
      const window = resolveWindowByDeadline({
        task: { deadline: new Date('2026-01-10') } as any,
        durationHours: 2,
        wave: null,
        project: { deadline: new Date('2026-01-20') } as any,
      });
      expect(window.startDate).toBeDefined();
      expect(window.endDate).toBeDefined();
    });
  });

  describe('buildTaskNodes', () => {
    it('should build nodes with dependencies', () => {
      const tasks = [
        { _id: 't1', name: 'Task 1', pertExpectedMinutes: 60 } as any,
        { id: 't2', name: 'Task 2', pomodorosPlanned: 2 } as any,
      ];
      const dependencies: TaskDependency[] = [
        { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FS' } as any,
        { taskId: '', dependsOnTaskId: 't1' } as any,
      ];
      const normalizeRel = jest.fn((r) => r || 'FS');

      const nodes = buildTaskNodes({
        tasks,
        dependencies,
        normalizeRelationship: normalizeRel,
      });

      expect(nodes.length).toBe(2);
      expect(nodes[1].dependencies).toContain('t1');
    });
  });

  describe('mapTaskItems & mapSingleTaskItem', () => {
    it('should map task items and sort by startDate and name', () => {
      const tasks = [
        { id: 't2', name: 'B Task', deadline: new Date('2026-01-10') } as any,
        { id: 't1', name: 'A Task', deadline: new Date('2026-01-10') } as any,
      ];

      const metricsById = new Map<string, any>();
      const waveByTaskId = new Map<string, any>();
      const project = { deadline: new Date('2026-01-20') } as any;

      const items = mapTaskItems({
        tasks,
        metricsById,
        waveByTaskId,
        project,
      });

      expect(items.length).toBe(2);
      expect(items[0].name).toBe('A Task'); // sorted alphabetically when same date
      expect(items[1].name).toBe('B Task');
    });
  });

  describe('mapDependencyItems', () => {
    it('should filter out invalid dependencies and map fields', () => {
      const dependencies: TaskDependency[] = [
        {
          id: 'dep-1',
          taskId: 't2',
          dependsOnTaskId: 't1',
          relationship: 'FS',
          reason: 'dep reason',
          isAutoIdentified: true,
        } as any,
        {
          taskId: '',
          dependsOnTaskId: 't1',
        } as any,
      ];

      const items = mapDependencyItems(dependencies);
      expect(items.length).toBe(1);
      expect(items[0].id).toBe('dep-1');
      expect(items[0].fromTaskId).toBe('t1');
      expect(items[0].toTaskId).toBe('t2');
      expect(items[0].isAutoIdentified).toBe(true);
      expect(items[0].reason).toBe('dep reason');
    });

    it('should generate fallback ID when id is missing', () => {
      const dependencies: TaskDependency[] = [
        {
          taskId: 't2',
          dependsOnTaskId: 't1',
        } as any,
      ];

      const items = mapDependencyItems(dependencies);
      expect(items[0].id).toBe('t2-t1');
    });
  });
});
