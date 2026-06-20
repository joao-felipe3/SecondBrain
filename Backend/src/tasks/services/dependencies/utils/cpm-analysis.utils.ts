import { DependencyType } from '../../../schemas/task-dependency.schema';
import {
  TaskDependencyEdge,
  TaskNode,
  PackageCriticality,
  CPMAnalysis,
  TaskMetrics,
  ValidateDependenciesParams,
  ComputeGraphDegreesParams,
  FindEndNodeParams,
  EvaluateAlignmentParams,
  FindBestPredecessorParams,
  BuildCriticalPathParams,
  GenerateAlertsParams,
  CreateCPMDiagnosticsParams,
  GroupedPackageTasks,
  RawPackageMetrics,
} from '../../../interfaces/cpm.interface';
import { forwardPass, backwardPass, buildEdgeMap } from './cpm-passes.utils';
import { CPMDiagnosticsDto } from '../../../dto/analysis/cpm-diagnostics.dto';

// ===========================================================================
// Re-exports
// ===========================================================================

export { normalizeRelationship } from './cpm-passes.utils';

// ===========================================================================
// CPM Analysis — Private Helpers
// ===========================================================================

function validateDependencies({
  tasksInHours,
  edgeMap,
  taskIds,
}: ValidateDependenciesParams): {
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

function computeGraphDegrees({
  tasksInHours,
  edgeMap,
  taskIds,
}: ComputeGraphDegreesParams): {
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

function initializeTasksInHours(tasks: TaskNode[]): TaskNode[] {
  return tasks.map((t) => ({ ...t, duration: t.duration / 60 }));
}

function calculateSlacksAndCriticalTasks(tasksInHours: TaskNode[], projectDuration: number): TaskNode[] {
  return tasksInHours.filter((t) => {
    if (typeof t.earlyStart !== 'number') t.earlyStart = 0;
    if (typeof t.earlyFinish !== 'number') t.earlyFinish = t.duration;
    if (typeof t.lateFinish !== 'number') t.lateFinish = projectDuration;
    if (typeof t.lateStart !== 'number') {
      t.lateStart = (t.lateFinish ?? projectDuration) - t.duration;
    }

    t.slack = t.lateStart - t.earlyStart;
    t.isCritical = Math.abs(t.slack) < 0.1;
    return t.isCritical;
  });
}

function sortTasksByImpact(tasksInHours: TaskNode[], indegree: Map<string, number>): TaskNode[] {
  return [...tasksInHours].sort((a, b) => {
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
}

// ===========================================================================
// CPM Analysis — Public Functions
// ===========================================================================

function runCPMPasses(
  tasksInHours: TaskNode[],
  edgeMap: Map<string, TaskDependencyEdge[]>,
): {
  forward: { hasCycle: boolean; unprocessed: number };
  projectDuration: number;
  backward: { hasCycle: boolean; unprocessed: number };
} {
  const forward = forwardPass(tasksInHours, edgeMap);
  const projectDuration = Math.max(...tasksInHours.map((t) => t.earlyFinish || 0));
  const backward = backwardPass(tasksInHours, projectDuration, edgeMap);
  return { forward, projectDuration, backward };
}

function getEffectiveCriticalPath(criticalPathSequence: string[], criticalTasks: TaskNode[]): string[] {
  return criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id);
}

function createCPMDiagnostics(params: CreateCPMDiagnosticsParams): CPMDiagnosticsDto {
  return new CPMDiagnosticsDto({
    tasksInHours: params.tasksInHours,
    criticalTasks: params.criticalTasks,
    criticalPathSequence: params.criticalPathSequence,
    projectDuration: params.projectDuration,
    indegree: params.indegree,
    outdegree: params.outdegree,
    edgeCount: params.edgeCount,
    depSum: params.depSum,
    hasCycle: Boolean(params.forward.hasCycle || params.backward.hasCycle),
    unprocessedForward: params.forward.unprocessed,
    unprocessedBackward: params.backward.unprocessed,
    missingDependencyRefs: params.missingDependencyRefs,
    missingDependencySamples: params.missingDependencySamples,
  });
}

export function calculateCriticalPath(tasks: TaskNode[]): CPMAnalysis {
  if (tasks.length === 0) {
    return { criticalPath: [], projectDuration: 0, tasksByImpact: [], alerts: [] };
  }

  const tasksInHours = initializeTasksInHours(tasks);
  const edgeMap = buildEdgeMap(tasksInHours);
  const taskIds = new Set(tasksInHours.map((t) => t.id));

  const { missingDependencyRefs, missingDependencySamples } = validateDependencies({
    tasksInHours,
    edgeMap,
    taskIds,
  });

  const { forward, projectDuration, backward } = runCPMPasses(tasksInHours, edgeMap);

  const criticalTasks = calculateSlacksAndCriticalTasks(tasksInHours, projectDuration);

  const alerts = generateAlerts({
    tasks: tasksInHours,
    criticalTasks,
    diagnostics: {
      cycleDetected: forward.hasCycle || backward.hasCycle,
      unprocessedForward: forward.unprocessed,
      unprocessedBackward: backward.unprocessed,
      missingDependencyRefs,
    },
  });

  const { indegree, outdegree, edgeCount, depSum } = computeGraphDegrees({
    tasksInHours,
    edgeMap,
    taskIds,
  });

  const tasksByImpact = sortTasksByImpact(tasksInHours, indegree);

  const criticalPathSequence = buildCriticalPathSequence({
    tasks: tasksInHours,
    projectDuration,
    edgeMap,
  });

  const effectiveCriticalPath = getEffectiveCriticalPath(criticalPathSequence, criticalTasks);
  const packageCriticality = computePackageCriticality(tasksInHours, effectiveCriticalPath);

  const diagnostics = createCPMDiagnostics({
    tasksInHours,
    criticalTasks,
    criticalPathSequence,
    projectDuration,
    indegree,
    outdegree,
    edgeCount,
    depSum,
    forward,
    backward,
    missingDependencyRefs,
    missingDependencySamples,
  });

  return {
    criticalPath: effectiveCriticalPath,
    projectDuration: Math.round(projectDuration * 100) / 100,
    tasksByImpact,
    alerts,
    packageCriticality,
    diagnostics,
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
  const grouped = groupTasksByPackage(tasks);

  if (grouped.size === 0) return [];

  const byPackage = [...grouped.entries()].map(([packageId, group]) =>
    calculateRawPackageMetrics(packageId, group, criticalPathSet),
  );

  const scored = computeScoresAndFormat(byPackage);
  sortPackageCriticalityList(scored);

  return scored;
}

function groupTasksByPackage(tasks: TaskNode[]): Map<string, GroupedPackageTasks> {
  const grouped = new Map<string, GroupedPackageTasks>();

  for (const task of tasks) {
    const packageId = String(task.parentWbsNodeId || task.wbsPath || 'unassigned');
    const existing = grouped.get(packageId) || { path: task.wbsPath, tasks: [] };
    existing.tasks.push(task);
    if (!existing.path && task.wbsPath) existing.path = task.wbsPath;
    grouped.set(packageId, existing);
  }

  return grouped;
}

function calculateRawPackageMetrics(
  packageId: string,
  group: GroupedPackageTasks,
  criticalPathSet: Set<string>,
): RawPackageMetrics {
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
  };
}

function computeScoresAndFormat(
  rawMetrics: RawPackageMetrics[],
): PackageCriticality[] {
  const maxCriticalDuration = Math.max(...rawMetrics.map((item) => item.criticalDuration), 0);

  return rawMetrics.map((item) => {
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
}

function sortPackageCriticalityList(list: PackageCriticality[]): void {
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.criticalRatio !== a.criticalRatio) return b.criticalRatio - a.criticalRatio;
    if (a.minSlack !== b.minSlack) return a.minSlack - b.minSlack;
    return a.packageId.localeCompare(b.packageId);
  });
}

function findEndNode({ tasks, projectDuration, eps }: FindEndNodeParams): TaskNode | undefined {
  let end: TaskNode | undefined;
  for (const t of tasks) {
    if (typeof t.earlyFinish !== 'number') continue;
    if (!end || (t.earlyFinish ?? 0) > (end.earlyFinish ?? 0)) end = t;
  }

  if (!end || typeof end.earlyFinish !== 'number') return undefined;

  if (projectDuration > 0 && Math.abs(end.earlyFinish - projectDuration) > eps) {
    const candidate = tasks.find(
      (t) =>
        typeof t.earlyFinish === 'number' && Math.abs((t.earlyFinish ?? 0) - projectDuration) <= eps,
    );
    if (candidate) end = candidate;
  }

  return end;
}

function evaluateDependencyAlignment({
  pred,
  cur,
  dep,
  eps,
}: EvaluateAlignmentParams): { aligns: boolean; timelineRef: number } {
  const es = typeof cur.earlyStart === 'number' ? cur.earlyStart : 0;
  const ef = typeof cur.earlyFinish === 'number' ? cur.earlyFinish : es + (cur.duration || 0);

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

  return { aligns, timelineRef };
}

function findBestPredecessor({
  cur,
  deps,
  taskById,
  eps,
}: FindBestPredecessorParams): TaskNode | undefined {
  let bestPred: TaskNode | undefined;
  let bestScore = -Infinity;

  for (const dep of deps) {
    const pred = taskById.get(dep.predecessorId);
    if (!pred || typeof pred.earlyFinish !== 'number') continue;

    const { aligns, timelineRef } = evaluateDependencyAlignment({ pred, cur, dep, eps });

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

  return bestPred;
}

export function buildCriticalPathSequence({
  tasks,
  projectDuration,
  edgeMap,
}: BuildCriticalPathParams): string[] {
  const taskById = new Map<string, TaskNode>();
  for (const t of tasks) taskById.set(t.id, t);

  const eps = 0.11;
  const end = findEndNode({ tasks, projectDuration, eps });

  if (!end || typeof end.earlyFinish !== 'number') return [];

  const path: string[] = [];
  const visited = new Set<string>();
  let cur: TaskNode | undefined = end;

  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    path.push(cur.id);

    const deps = edgeMap.get(cur.id) || [];
    if (deps.length === 0) break;

    const bestPred = findBestPredecessor({ cur, deps, taskById, eps });
    if (!bestPred) break;
    cur = bestPred;
  }

  return path.reverse();
}

export function generateAlerts({
  tasks,
  criticalTasks,
  diagnostics,
}: GenerateAlertsParams): string[] {
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
