import { DependencyType } from '../../../schemas/task-dependency.schema';
import {
  TaskDependencyEdge,
  TaskNode,
  PackageCriticality,
  CPMAnalysis,
  TaskMetrics,
} from '../../../interfaces/cpm.interface';
import { forwardPass, backwardPass, buildEdgeMap } from './cpm-passes.utils';

// ===========================================================================
// Re-exports
// ===========================================================================

export { normalizeRelationship } from './cpm-passes.utils';

// ===========================================================================
// CPM Analysis — Private Helpers
// ===========================================================================

function validateDependencies(
  tasksInHours: TaskNode[],
  edgeMap: Map<string, TaskDependencyEdge[]>,
  taskIds: Set<string>,
): {
  missingDependencyRefs: number;
  missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }>;
} {
  let missingDependencyRefs = 0;
  const missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }> = [];

  for (const t of tasksInHours) {
    for (const dep of edgeMap.get(t.id) ?? []) {
      if (!taskIds.has(dep.predecessorId)) {
        missingDependencyRefs++;
        if (missingDependencySamples.length < 5) {
          missingDependencySamples.push({ taskId: t.id, dependsOnTaskId: dep.predecessorId });
        }
      }
    }
  }

  return { missingDependencyRefs, missingDependencySamples };
}

function computeGraphDegrees(
  tasksInHours: TaskNode[],
  edgeMap: Map<string, TaskDependencyEdge[]>,
  taskIds: Set<string>,
): {
  indegree: Map<string, number>;
  outdegree: Map<string, number>;
  edgeCount: number;
  depSum: number;
} {
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  let edgeCount = 0;
  let depSum = 0;

  for (const t of tasksInHours) {
    indegree.set(t.id, 0);
    outdegree.set(t.id, 0);
  }

  for (const t of tasksInHours) {
    const deps = edgeMap.get(t.id) ?? [];
    depSum += deps.length;
    for (const dep of deps) {
      if (!taskIds.has(dep.predecessorId)) continue;
      edgeCount++;
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      outdegree.set(dep.predecessorId, (outdegree.get(dep.predecessorId) ?? 0) + 1);
    }
  }

  return { indegree, outdegree, edgeCount, depSum };
}

function buildSlackBuckets(tasksInHours: TaskNode[]): {
  negative: number;
  critical: number;
  nearCritical: number;
  lowSlack: number;
  comfortable: number;
} {
  const buckets = { negative: 0, critical: 0, nearCritical: 0, lowSlack: 0, comfortable: 0 };

  for (const t of tasksInHours) {
    const slack = typeof t.slack === 'number' ? t.slack : 0;
    if (slack < 0) buckets.negative++;
    else if (Math.abs(slack) < 0.1) buckets.critical++;
    else if (slack < 2) buckets.nearCritical++;
    else if (slack < 8) buckets.lowSlack++;
    else buckets.comfortable++;
  }

  return buckets;
}

// ===========================================================================
// CPM Analysis — Public Functions
// ===========================================================================

export function calculateCriticalPath(tasks: TaskNode[]): CPMAnalysis {
  if (tasks.length === 0) {
    return { criticalPath: [], projectDuration: 0, tasksByImpact: [], alerts: [] };
  }

  const tasksInHours = tasks.map((t) => ({ ...t, duration: t.duration / 60 }));
  const edgeMap = buildEdgeMap(tasksInHours);
  const taskIds = new Set(tasksInHours.map((t) => t.id));

  const { missingDependencyRefs, missingDependencySamples } = validateDependencies(
    tasksInHours,
    edgeMap,
    taskIds,
  );

  const forward = forwardPass(tasksInHours, edgeMap);
  const projectDuration = Math.max(...tasksInHours.map((t) => t.earlyFinish || 0));
  const backward = backwardPass(tasksInHours, projectDuration, edgeMap);

  const criticalTasks = tasksInHours.filter((t) => {
    if (typeof t.earlyStart !== 'number') t.earlyStart = 0;
    if (typeof t.earlyFinish !== 'number') t.earlyFinish = t.duration;
    if (typeof t.lateFinish !== 'number') t.lateFinish = projectDuration;
    if (typeof t.lateStart !== 'number') t.lateStart = (t.lateFinish ?? projectDuration) - t.duration;

    t.slack = t.lateStart - t.earlyStart;
    t.isCritical = Math.abs(t.slack) < 0.1;
    return t.isCritical;
  });

  const alerts = generateAlerts(tasksInHours, criticalTasks, {
    cycleDetected: forward.hasCycle || backward.hasCycle,
    unprocessedForward: forward.unprocessed,
    unprocessedBackward: backward.unprocessed,
    missingDependencyRefs,
  });

  const { indegree, outdegree, edgeCount, depSum } = computeGraphDegrees(tasksInHours, edgeMap, taskIds);

  const tasksByImpact = [...tasksInHours].sort((a, b) => {
    const slackDiff = (a.slack || 0) - (b.slack || 0);
    if (Math.abs(slackDiff) > 0.01) return slackDiff;

    const aInDegree = indegree.get(a.id) || 0;
    const bInDegree = indegree.get(b.id) || 0;
    if (aInDegree !== bInDegree) return bInDegree - aInDegree;

    if (a.duration !== b.duration) return (b.duration || 0) - (a.duration || 0);

    const byName = String(a.name || '').localeCompare(String(b.name || ''));
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });

  const criticalPathSequence = buildCriticalPathSequence(tasksInHours, projectDuration, edgeMap);

  const taskById = new Map<string, TaskNode>();
  for (const t of tasksInHours) taskById.set(t.id, t);

  const criticalChainDuration = criticalPathSequence.reduce(
    (sum, id) => sum + (taskById.get(id)?.duration ?? 0),
    0,
  );
  const totalWork = tasksInHours.reduce(
    (sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0),
    0,
  );
  const impliedParallelism = projectDuration > 0 ? totalWork / projectDuration : 0;
  const nearCriticalCount = tasksInHours.filter((t) => {
    const slack = typeof t.slack === 'number' ? t.slack : 0;
    return slack >= 0 && slack < 2;
  }).length;

  const startNodeCount = [...indegree.values()].filter((v) => v === 0).length;
  const endNodeCount = [...outdegree.values()].filter((v) => v === 0).length;
  const slackBuckets = buildSlackBuckets(tasksInHours);

  const topUnlockers = [...outdegree.entries()]
    .filter(([, deg]) => (deg ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 8)
    .map(([taskId, deg]) => ({
      taskId,
      taskName: taskById.get(taskId)?.name ?? taskId,
      outDegree: Number(deg ?? 0),
    }));

  const topBottlenecks = [...indegree.entries()]
    .filter(([, deg]) => (deg ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 8)
    .map(([taskId, deg]) => ({
      taskId,
      taskName: taskById.get(taskId)?.name ?? taskId,
      inDegree: Number(deg ?? 0),
    }));

  const effectiveCriticalPath =
    criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id);
  const packageCriticality = computePackageCriticality(tasksInHours, effectiveCriticalPath);

  const reliability: 'high' | 'medium' | 'low' =
    forward.hasCycle || backward.hasCycle ? 'low' : missingDependencyRefs > 0 ? 'medium' : 'high';

  return {
    criticalPath:
      criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id),
    projectDuration: Math.round(projectDuration * 100) / 100,
    tasksByImpact,
    alerts,
    packageCriticality,
    diagnostics: {
      taskCount: tasksInHours.length,
      criticalCount: criticalTasks.length,
      criticalPercent:
        tasksInHours.length > 0
          ? Math.round((criticalTasks.length / tasksInHours.length) * 1000) / 10
          : 0,
      criticalChainTaskCount: criticalPathSequence.length,
      criticalChainDuration: Math.round(criticalChainDuration * 100) / 100,
      nearCriticalCount,
      totalWork: Math.round(totalWork * 100) / 100,
      impliedParallelism: Math.round(impliedParallelism * 100) / 100,
      hasCycle: Boolean(forward.hasCycle || backward.hasCycle),
      unprocessedForward: forward.unprocessed,
      unprocessedBackward: backward.unprocessed,
      edgeCount,
      startNodeCount,
      endNodeCount,
      avgDependenciesPerTask:
        tasksInHours.length > 0 ? Math.round((depSum / tasksInHours.length) * 100) / 100 : 0,
      slackBuckets,
      topUnlockers,
      topBottlenecks,
      validation: {
        missingDependencyRefs,
        missingDependencySamples,
        reliability,
      },
    },
  };
}

export function getTaskMetrics(task: TaskNode): TaskMetrics {
  return {
    taskId: task.id,
    taskName: task.name,
    earlyStart: task.earlyStart ?? 0,
    earlyFinish: task.earlyFinish ?? 0,
    lateStart: task.lateStart ?? 0,
    lateFinish: task.lateFinish ?? 0,
    slack: task.slack ?? 0,
    isCritical: Boolean(task.isCritical),
  };
}

// ===========================================================================
// Package Criticality & Critical Path Sequence
// ===========================================================================

export function computePackageCriticality(
  tasks: TaskNode[],
  criticalPath: string[],
): PackageCriticality[] {
  const criticalPathSet = new Set(criticalPath);
  const grouped = new Map<string, { path?: string; tasks: TaskNode[] }>();

  for (const task of tasks) {
    const packageId = String(task.parentWbsNodeId || task.wbsPath || 'unassigned');
    const existing = grouped.get(packageId) || { path: task.wbsPath, tasks: [] };
    existing.tasks.push(task);
    if (!existing.path && task.wbsPath) existing.path = task.wbsPath;
    grouped.set(packageId, existing);
  }

  if (grouped.size === 0) return [];

  const byPackage = [...grouped.entries()].map(([packageId, group]) => {
    const totalTaskCount = group.tasks.length;
    const criticalTasks = group.tasks.filter((t) => Boolean(t.isCritical));
    const criticalTaskCount = criticalTasks.length;
    const criticalRatio = totalTaskCount > 0 ? criticalTaskCount / totalTaskCount : 0;

    let minSlack = Number.POSITIVE_INFINITY;
    for (const t of group.tasks) {
      if (typeof t.slack === 'number') minSlack = Math.min(minSlack, t.slack);
    }
    if (!Number.isFinite(minSlack)) minSlack = 0;

    const criticalDuration = criticalTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
    const criticalPathTaskCount = group.tasks.reduce(
      (count, task) => count + (criticalPathSet.has(task.id) ? 1 : 0),
      0,
    );

    return {
      packageId,
      packagePath: group.path,
      taskCount: totalTaskCount,
      criticalTaskCount,
      criticalRatio,
      minSlack,
      criticalDuration,
      criticalPathTaskCount,
      score: 0,
    };
  });

  const maxCriticalDuration = Math.max(...byPackage.map((item) => item.criticalDuration), 0);

  const scored = byPackage.map((item) => {
    const criticalRatioScore = item.criticalRatio * 100;
    const slackRiskScore = (1 - Math.min(1, Math.max(0, item.minSlack) / 8)) * 100;
    const durationScore =
      maxCriticalDuration > 0 ? (item.criticalDuration / maxCriticalDuration) * 100 : 0;
    const score = criticalRatioScore * 0.3 + slackRiskScore * 0.2 + durationScore * 0.5;

    return {
      packageId: item.packageId,
      packagePath: item.packagePath,
      taskCount: item.taskCount,
      criticalTaskCount: item.criticalTaskCount,
      criticalRatio: Math.round(item.criticalRatio * 1000) / 10,
      minSlack: Math.round(item.minSlack * 100) / 100,
      criticalDuration: Math.round(item.criticalDuration * 100) / 100,
      criticalPathTaskCount: item.criticalPathTaskCount,
      score: Math.round(score * 100) / 100,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.criticalRatio !== a.criticalRatio) return b.criticalRatio - a.criticalRatio;
    if (a.minSlack !== b.minSlack) return a.minSlack - b.minSlack;
    return a.packageId.localeCompare(b.packageId);
  });

  return scored;
}

export function buildCriticalPathSequence(
  tasks: TaskNode[],
  projectDuration: number,
  edgeMap: Map<string, TaskDependencyEdge[]>,
): string[] {
  const taskById = new Map<string, TaskNode>();
  for (const t of tasks) taskById.set(t.id, t);

  const eps = 0.11;

  let end: TaskNode | undefined;
  for (const t of tasks) {
    if (typeof t.earlyFinish !== 'number') continue;
    if (!end || (t.earlyFinish ?? 0) > (end.earlyFinish ?? 0)) end = t;
  }

  if (!end || typeof end.earlyFinish !== 'number') return [];
  if (projectDuration > 0 && Math.abs(end.earlyFinish - projectDuration) > eps) {
    const candidate = tasks.find(
      (t) =>
        typeof t.earlyFinish === 'number' && Math.abs((t.earlyFinish ?? 0) - projectDuration) <= eps,
    );
    if (candidate) end = candidate;
  }

  const path: string[] = [];
  const visited = new Set<string>();
  let cur: TaskNode | undefined = end;

  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    path.push(cur.id);

    const deps = edgeMap.get(cur.id) || [];
    if (deps.length === 0) break;

    const es = typeof cur.earlyStart === 'number' ? cur.earlyStart : 0;
    const ef = typeof cur.earlyFinish === 'number' ? cur.earlyFinish : es + (cur.duration || 0);
    let bestPred: TaskNode | undefined;
    let bestScore = -Infinity;

    for (const dep of deps) {
      const pred = taskById.get(dep.predecessorId);
      if (!pred || typeof pred.earlyFinish !== 'number') continue;

      const predES = typeof pred.earlyStart === 'number' ? pred.earlyStart : 0;
      const predEF =
        typeof pred.earlyFinish === 'number' ? pred.earlyFinish : predES + (pred.duration || 0);

      let aligns = false;
      let timelineRef = predEF;

      if (dep.relationship === DependencyType.START_TO_START) {
        aligns = Math.abs(predES - es) <= eps;
        timelineRef = predES;
      } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
        aligns = Math.abs(predEF - ef) <= eps;
        timelineRef = predEF;
      } else {
        aligns = Math.abs(predEF - es) <= eps;
        timelineRef = predEF;
      }

      const criticalBonus =
        Math.abs(Number(pred.slack ?? Number.POSITIVE_INFINITY)) < 0.1 ? 1_000_000_000 : 0;
      const alignmentBonus = aligns ? 1_000_000 : 0;
      const score = criticalBonus + alignmentBonus + timelineRef;

      if (score > bestScore) {
        bestScore = score;
        bestPred = pred;
      } else if (score === bestScore && bestPred && pred.id.localeCompare(bestPred.id) < 0) {
        bestPred = pred;
      }
    }

    if (!bestPred) break;
    cur = bestPred;
  }

  return path.reverse();
}

export function generateAlerts(
  tasks: TaskNode[],
  criticalTasks: TaskNode[],
  diagnostics: {
    cycleDetected: boolean;
    unprocessedForward: number;
    unprocessedBackward: number;
    missingDependencyRefs: number;
  },
): string[] {
  const alerts: string[] = [];

  if (diagnostics.cycleDetected) {
    alerts.push('Ciclo detectado nas dependências do projeto.');
  }
  if (diagnostics.missingDependencyRefs > 0) {
    alerts.push(`Há ${diagnostics.missingDependencyRefs} referências de dependência ausentes.`);
  }
  if (criticalTasks.length === tasks.length && tasks.length > 0) {
    alerts.push('Todas as tarefas estão críticas; o cronograma está sem folga.');
  } else if (criticalTasks.length > 0 && criticalTasks.length < tasks.length) {
    alerts.push('O cronograma possui tarefas com folga; revise o paralelismo e o caminho crítico.');
  }

  return alerts;
}
