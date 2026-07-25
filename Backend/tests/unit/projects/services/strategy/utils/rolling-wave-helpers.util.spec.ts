import {
  flattenWbsTree,
  estimateTaskHours,
  startOfDay,
  endOfDay,
  addDays,
  buildTaskScheduleMetrics,
  resolveGroupKey,
  buildBalancedWaveDurations,
  normalizeWavePlanShape,
  redistributeTasksAcrossWaves,
} from '@src/projects/services/strategy/utils/rolling-wave-helpers.util';

describe('rolling-wave-helpers.util', () => {
  describe('date and tree utilities', () => {
    it('should flatten nested WBS tree', () => {
      const tree = [
        {
          _id: '1',
          name: 'Parent',
          level: 1,
          children: [{ _id: '2', parentId: '1', name: 'Child', level: 2 }],
        },
      ];
      const flat = flattenWbsTree(tree);
      expect(flat.length).toBe(2);
      expect(flat[0].name).toBe('Parent');
      expect(flat[1].name).toBe('Child');
    });

    it('should estimate task hours correctly based on PERT or pomodoros or fallback', () => {
      expect(estimateTaskHours({ pertExpectedMinutes: 120 })).toBe(2);
      expect(estimateTaskHours({ pomodorosPlanned: 4 })).toBe(2);
      expect(estimateTaskHours({})).toBe(1);
    });

    it('should startOfDay, endOfDay, and addDays accurately', () => {
      const base = new Date('2026-05-15T14:30:00Z');
      const start = startOfDay(base);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);

      const end = endOfDay(base);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);

      const added = addDays(base, 2);
      expect(added.getDate()).toBe(17);
    });
  });

  describe('buildTaskScheduleMetrics', () => {
    it('should return empty object if no expected minutes can be computed', () => {
      expect(buildTaskScheduleMetrics({}, new Date())).toEqual({});
    });

    it('should compute EVM progress, PV, EV, SPI, and alert when applicable', () => {
      const task = {
        pertExpectedMinutes: 100,
        pomodorosPlanned: 4,
        pomodorosDid: 1,
        createdAt: new Date(Date.now() - 5000),
      };
      const deadline = new Date(Date.now() + 5000);
      const metrics = buildTaskScheduleMetrics(task, deadline);

      expect(metrics.evmProgress).toBe(0.25);
      expect(metrics.evmPlannedValueMinutes).toBeGreaterThanOrEqual(0);
      expect(metrics.evmEarnedValueMinutes).toBe(25);
    });
  });

  describe('resolveGroupKey', () => {
    it('should return parent WBS name if parent exists in WBS map', () => {
      const wbsMap = new Map([['node1', { id: 'node1', name: 'Sprint 1', level: 1 }]]);
      const key = resolveGroupKey({ parentWbsNodeId: 'node1' }, wbsMap, 0, 1000);
      expect(key).toBe('wbs:Sprint 1');
    });

    it('should return goal-based deadline range key if no WBS parent', () => {
      const keyShort = resolveGroupKey({ deadline: new Date(100) }, new Map(), 0, 1000);
      expect(keyShort).toBe('goal:Curto Prazo');

      const keyFallback = resolveGroupKey({}, new Map(), 0, 0);
      expect(keyFallback).toBe('goal:Execução Geral');
    });
  });

  describe('wave distribution and rebalancing', () => {
    it('should build balanced wave durations', () => {
      const durations = buildBalancedWaveDurations(10, 3);
      expect(durations).toEqual([4, 3, 3]);
    });

    it('should normalize wave plan shape', () => {
      const aiPlan: any = { waves: [{ name: 'W1' }] };
      const normalized = normalizeWavePlanShape(aiPlan, 2, 14);
      expect(normalized.waves.length).toBe(2);
      expect(normalized.waves[0].durationDays).toBe(7);
      expect(normalized.waves[1].durationDays).toBe(7);
    });

    it('should redistribute tasks across waves handling missing and overflow tasks', () => {
      const aiPlan: any = {
        waves: [
          { name: 'W1', taskIds: ['t1', 't2', 't3', 't4', 't5'] },
          { name: 'W2', taskIds: [] },
        ],
      };
      const allTaskIds = ['t1', 't2', 't3', 't4', 't5', 't6'];
      const result = redistributeTasksAcrossWaves(aiPlan, allTaskIds, 2, 14, 1, 4);

      expect(result.waves[0].taskIds.length).toBeLessThanOrEqual(4);
      expect(result.waves[1].taskIds.length).toBeGreaterThanOrEqual(1);
    });
  });
});
