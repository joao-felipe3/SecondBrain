import {
  CPMDiagnosticsDto,
  SlackBucketsDto,
  TopUnlockerDto,
  TopBottleneckDto,
  MissingDependencySampleDto,
  CPMValidationDto,
} from '@src/tasks/dto/dependencies/cpm-diagnostics.dto';
import { TaskNode } from '@src/tasks/interfaces/cpm.interface';

describe('CPMDiagnosticsDto', () => {
  it('should instantiate sub-DTOs with default property behavior', () => {
    const slack = new SlackBucketsDto();
    slack.negative = 1;
    slack.critical = 2;
    slack.nearCritical = 3;
    slack.lowSlack = 4;
    slack.comfortable = 5;
    expect(slack.negative).toBe(1);

    const unlocker = new TopUnlockerDto();
    unlocker.taskId = 't1';
    unlocker.taskName = 'Task 1';
    unlocker.outDegree = 3;
    expect(unlocker.outDegree).toBe(3);

    const bottleneck = new TopBottleneckDto();
    bottleneck.taskId = 't2';
    bottleneck.taskName = 'Task 2';
    bottleneck.inDegree = 4;
    expect(bottleneck.inDegree).toBe(4);

    const sample = new MissingDependencySampleDto();
    sample.taskId = 't1';
    sample.dependsOnTaskId = 't_missing';
    expect(sample.dependsOnTaskId).toBe('t_missing');

    const validation = new CPMValidationDto();
    validation.missingDependencyRefs = 1;
    validation.missingDependencySamples = [sample];
    validation.reliability = 'medium';
    expect(validation.reliability).toBe('medium');
  });

  it('should calculate complete metrics with high reliability, no cycles and no missing deps', () => {
    const tasks: TaskNode[] = [
      {
        id: 't1',
        name: 'Task 1',
        duration: 2,
        earlyStart: 0,
        earlyFinish: 2,
        lateStart: 0,
        lateFinish: 2,
        slack: 0,
        isCritical: true,
        dependencies: [],
      },
      {
        id: 't2',
        name: 'Task 2',
        duration: 3,
        earlyStart: 2,
        earlyFinish: 5,
        lateStart: 2,
        lateFinish: 5,
        slack: 0.05,
        isCritical: true,
        dependencies: ['t1'],
      },
      {
        id: 't3',
        name: 'Task 3',
        duration: 1,
        earlyStart: 0,
        earlyFinish: 1,
        lateStart: 0.5,
        lateFinish: 1.5,
        slack: 0.5,
        isCritical: false,
        dependencies: [],
      },
      {
        id: 't4',
        name: 'Task 4',
        duration: 4,
        earlyStart: 0,
        earlyFinish: 4,
        lateStart: 3,
        lateFinish: 7,
        slack: 3,
        isCritical: false,
        dependencies: [],
      },
      {
        id: 't5',
        name: 'Task 5',
        duration: 2,
        earlyStart: 0,
        earlyFinish: 2,
        lateStart: 10,
        lateFinish: 12,
        slack: 10,
        isCritical: false,
        dependencies: ['t1', 't3', 't4'],
      },
      {
        id: 't6',
        name: 'Task 6',
        duration: 1,
        earlyStart: 5,
        earlyFinish: 6,
        lateStart: 3,
        lateFinish: 4,
        slack: -1,
        isCritical: false,
        dependencies: [],
      },
    ];

    const indegree = new Map<string, number>([
      ['t1', 0],
      ['t2', 2],
      ['t3', 1],
      ['t4', 0],
      ['t5', 3],
      ['t6', 0],
    ]);

    const outdegree = new Map<string, number>([
      ['t1', 3],
      ['t2', 0],
      ['t3', 1],
      ['t4', 2],
      ['t5', 0],
      ['t6', 0],
    ]);

    const dto = new CPMDiagnosticsDto({
      tasksInHours: tasks,
      criticalTasks: [tasks[0], tasks[1]],
      criticalPathSequence: ['t1', 't2'],
      projectDuration: 5,
      indegree,
      outdegree,
      edgeCount: 6,
      depSum: 6,
      hasCycle: false,
      unprocessedForward: 0,
      unprocessedBackward: 0,
      missingDependencyRefs: 0,
      missingDependencySamples: [],
    });

    expect(dto.taskCount).toBe(6);
    expect(dto.criticalCount).toBe(2);
    expect(dto.criticalPercent).toBe(33.3);
    expect(dto.criticalChainTaskCount).toBe(2);
    expect(dto.criticalChainDuration).toBe(5); // 2 + 3
    expect(dto.totalWork).toBe(13); // 2 + 3 + 1 + 4 + 2 + 1
    expect(dto.impliedParallelism).toBe(2.6); // 13 / 5
    expect(dto.validation.reliability).toBe('high');
    expect(dto.validation.missingDependencyRefs).toBe(0);
    expect(dto.slackBuckets.negative).toBe(1); // t6 (-1)
    expect(dto.slackBuckets.critical).toBe(2); // t1 (0) e t2 (0.05 < 0.1)
    expect(dto.slackBuckets.nearCritical).toBe(1); // t3 (0.5 >= 0.1 && < 2)
    expect(dto.slackBuckets.lowSlack).toBe(1); // t4 (3 >= 2 && < 8)
    expect(dto.slackBuckets.comfortable).toBe(1); // t5 (10 >= 8)
    expect(dto.startNodeCount).toBe(3); // t1, t4, t6
    expect(dto.endNodeCount).toBe(3); // t2, t5, t6
    expect(dto.avgDependenciesPerTask).toBe(1); // 6 / 6
    expect(dto.topUnlockers.length).toBeGreaterThan(0);
    expect(dto.topBottlenecks.length).toBeGreaterThan(0);
    expect(dto.topUnlockers[0].taskId).toBe('t1');
    expect(dto.topUnlockers[0].outDegree).toBe(3);
  });

  it('should set reliability to low when hasCycle is true', () => {
    const dto = new CPMDiagnosticsDto({
      tasksInHours: [],
      criticalTasks: [],
      criticalPathSequence: [],
      projectDuration: 0,
      indegree: new Map(),
      outdegree: new Map(),
      edgeCount: 0,
      depSum: 0,
      hasCycle: true,
      unprocessedForward: 2,
      unprocessedBackward: 2,
      missingDependencyRefs: 0,
      missingDependencySamples: [],
    });

    expect(dto.validation.reliability).toBe('low');
    expect(dto.impliedParallelism).toBe(0);
    expect(dto.criticalPercent).toBe(0);
    expect(dto.avgDependenciesPerTask).toBe(0);
  });

  it('should set reliability to medium when missingDependencyRefs > 0 and no cycle', () => {
    const dto = new CPMDiagnosticsDto({
      tasksInHours: [{ id: 't1', duration: undefined, slack: undefined, dependencies: [] } as any],
      criticalTasks: [],
      criticalPathSequence: ['non_existent_id'],
      projectDuration: 10,
      indegree: new Map([['t_unknown', 5]]),
      outdegree: new Map([['t_unknown', 2]]),
      edgeCount: 1,
      depSum: 1,
      hasCycle: false,
      unprocessedForward: 0,
      unprocessedBackward: 0,
      missingDependencyRefs: 1,
      missingDependencySamples: [{ taskId: 't1', dependsOnTaskId: 'ghost' }],
    });

    expect(dto.validation.reliability).toBe('medium');
    expect(dto.validation.missingDependencySamples.length).toBe(1);
    expect(dto.validation.missingDependencySamples[0].dependsOnTaskId).toBe('ghost');
    // Task name fallback to taskId when not found in map
    expect(dto.topUnlockers[0].taskName).toBe('t_unknown');
    expect(dto.topBottlenecks[0].taskName).toBe('t_unknown');
    // Undefined duration should sum 0
    expect(dto.totalWork).toBe(0);
    expect(dto.criticalChainDuration).toBe(0);
  });

  it('should handle missingDependencySamples as undefined or empty', () => {
    const dto = new CPMDiagnosticsDto({
      tasksInHours: [],
      criticalTasks: [],
      criticalPathSequence: [],
      projectDuration: 0,
      indegree: new Map(),
      outdegree: new Map(),
      edgeCount: 0,
      depSum: 0,
      hasCycle: false,
      unprocessedForward: 0,
      unprocessedBackward: 0,
      missingDependencyRefs: 0,
      missingDependencySamples: undefined as any,
    });

    expect(dto.validation.missingDependencySamples).toEqual([]);
  });
});
