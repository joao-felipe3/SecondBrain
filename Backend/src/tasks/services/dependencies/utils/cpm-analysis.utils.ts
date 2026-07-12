import {
  TaskNodeResponseDto,
  TaskDependencyEdgeDto,
  CPMAnalysisResponseDto,
  TaskMetricsResponseDto,
  ValidateDependenciesDto,
  ComputeGraphDegreesDto,
  CreateCPMDiagnosticsParamsDto,
  GraphDegreesDto,
  ValidateDependenciesResponseDto,
} from '../../../dto/dependencies/cpm.dto';
import { forwardPass, backwardPass, buildEdgeMap } from './cpm-passes.utils';
import { CPMDiagnosticsDto } from '../../../dto/dependencies/cpm-diagnostics.dto';
import { generateAlerts } from './cpm-alerts.utils';
import { computePackageCriticality } from './cpm-package.utils';
import { buildCriticalPathSequence } from './cpm-sequence.utils';

export { normalizeRelationship } from './cpm-passes.utils';

// ===========================================================================
// CPM Analysis — Private Helpers
// ===========================================================================

function validateDependencies({
  tasksInHours,
  edgeMap,
  taskIds,
}: ValidateDependenciesDto): ValidateDependenciesResponseDto {
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
}: ComputeGraphDegreesDto): GraphDegreesDto {
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

function initializeTasksInHours(tasks: TaskNodeResponseDto[]): TaskNodeResponseDto[] {
  return tasks.map((t) => ({ ...t, duration: t.duration / 60 }));
}

function calculateSlacksAndCriticalTasks(tasksInHours: TaskNodeResponseDto[], projectDuration: number): TaskNodeResponseDto[] {
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

function sortTasksByImpact(tasksInHours: TaskNodeResponseDto[], indegree: Map<string, number>): TaskNodeResponseDto[] {
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
  tasksInHours: TaskNodeResponseDto[],
  edgeMap: Map<string, TaskDependencyEdgeDto[]>,
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

function getEffectiveCriticalPath(criticalPathSequence: string[], criticalTasks: TaskNodeResponseDto[]): string[] {
  return criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id);
}

function createCPMDiagnostics(params: CreateCPMDiagnosticsParamsDto): CPMDiagnosticsDto {
  const { forward, backward, ...rest } = params;

  return new CPMDiagnosticsDto({
    ...rest,
    hasCycle: Boolean(forward.hasCycle || backward.hasCycle),
    unprocessedForward: forward.unprocessed,
    unprocessedBackward: backward.unprocessed,
  });
}

export function calculateCriticalPath(tasks: TaskNodeResponseDto[]): CPMAnalysisResponseDto {
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

export function getTaskMetrics(task: TaskNodeResponseDto): TaskMetricsResponseDto {
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
