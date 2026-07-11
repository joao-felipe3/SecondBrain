import { Logger } from '@nestjs/common';
import { DependencyType } from '../../../schemas/task-dependency.schema';
import { TaskNodeResponseDto, TaskDependencyEdgeDto } from '../../../dto/dependencies/cpm.dto';

const logger = new Logger('CPMPassesUtils');

// ===========================================================================
// Dependency Normalization & Edge Extraction
// ===========================================================================

export function normalizeRelationship(input?: string): DependencyType {
  const normalized = String(input ?? '')
    .trim()
    .toLowerCase();
  const validTypes = Object.values(DependencyType) as string[];

  if (validTypes.includes(normalized)) {
    return normalized as DependencyType;
  }

  return DependencyType.FINISH_TO_START;
}

export function extractExplicitEdges(dependencyEdges: unknown, seen: Set<string>): TaskDependencyEdgeDto[] {
  const normalized: TaskDependencyEdgeDto[] = [];
  const edges = Array.isArray(dependencyEdges) ? dependencyEdges : [];

  for (const edge of edges) {
    const predecessorId = String(edge?.predecessorId ?? '').trim();
    if (!predecessorId || seen.has(predecessorId)) continue;

    seen.add(predecessorId);
    normalized.push({
      predecessorId,
      relationship: normalizeRelationship(edge?.relationship),
    });
  }

  return normalized;
}

export function extractFallbackEdges(dependencies: unknown, seen: Set<string>): TaskDependencyEdgeDto[] {
  const normalized: TaskDependencyEdgeDto[] = [];
  const deps = Array.isArray(dependencies) ? dependencies : [];

  for (const depId of deps) {
    const predecessorId = String(depId ?? '').trim();
    if (!predecessorId || seen.has(predecessorId)) continue;

    seen.add(predecessorId);
    normalized.push({
      predecessorId,
      relationship: DependencyType.FINISH_TO_START,
    });
  }

  return normalized;
}

export function getDependencyEdges(task: TaskNodeResponseDto): TaskDependencyEdgeDto[] {
  const seen = new Set<string>();
  const explicit = extractExplicitEdges(task.dependencyEdges, seen);
  const fallback = extractFallbackEdges(task.dependencies, seen);
  return [...explicit, ...fallback];
}

export function buildEdgeMap(tasks: TaskNodeResponseDto[]): Map<string, TaskDependencyEdgeDto[]> {
  const edgeMap = new Map<string, TaskDependencyEdgeDto[]>();
  for (const task of tasks) {
    edgeMap.set(task.id, getDependencyEdges(task));
  }
  return edgeMap;
}

// ===========================================================================
// Forward Pass (Early Start / Early Finish)
// ===========================================================================

export function buildForwardPassMaps(
  tasks: TaskNodeResponseDto[],
  edgeMap: Map<string, TaskDependencyEdgeDto[]>,
  taskMap: Map<string, TaskNodeResponseDto>,
): {
  indegree: Map<string, number>;
  dependents: Map<string, Array<{ successorId: string; relationship: DependencyType }>>;
  maxConstraintStart: Map<string, number>;
} {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, Array<{ successorId: string; relationship: DependencyType }>>();
  const maxConstraintStart = new Map<string, number>();

  for (const t of tasks) {
    indegree.set(t.id, 0);
    dependents.set(t.id, []);
    maxConstraintStart.set(t.id, 0);
  }

  for (const t of tasks) {
    for (const dep of edgeMap.get(t.id) ?? []) {
      if (!taskMap.has(dep.predecessorId)) continue;
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      dependents.get(dep.predecessorId)!.push({
        successorId: t.id,
        relationship: dep.relationship,
      });
    }
  }

  return { indegree, dependents, maxConstraintStart };
}

export function updateForwardSuccessor(
  predecessor: TaskNodeResponseDto,
  dep: { successorId: string; relationship: DependencyType },
  taskMap: Map<string, TaskNodeResponseDto>,
  indegree: Map<string, number>,
  maxConstraintStart: Map<string, number>,
  queue: string[],
): void {
  const dependent = taskMap.get(dep.successorId);
  if (!dependent) return;

  let candidateStart = predecessor.earlyFinish || 0;
  if (dep.relationship === DependencyType.START_TO_START) {
    candidateStart = predecessor.earlyStart || 0;
  } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
    candidateStart = (predecessor.earlyFinish || 0) - (dependent.duration || 0);
  }

  const nextMax = Math.max(maxConstraintStart.get(dep.successorId) || 0, candidateStart);
  maxConstraintStart.set(dep.successorId, nextMax);

  const newDeg = (indegree.get(dep.successorId) || 0) - 1;
  indegree.set(dep.successorId, newDeg);
  if (newDeg === 0) queue.push(dep.successorId);
}

export function forwardPass(
  tasks: TaskNodeResponseDto[],
  edgeMap: Map<string, TaskDependencyEdgeDto[]>,
): { hasCycle: boolean; unprocessed: number } {
  const taskMap = new Map<string, TaskNodeResponseDto>();
  for (const t of tasks) taskMap.set(t.id, t);

  const { indegree, dependents, maxConstraintStart } = buildForwardPassMaps(tasks, edgeMap, taskMap);

  const queue: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const t = taskMap.get(id);
    if (!t) continue;

    const es = Math.max(0, maxConstraintStart.get(id) || 0);
    t.earlyStart = es;
    t.earlyFinish = es + t.duration;
    processed++;

    for (const dep of dependents.get(id) || []) {
      updateForwardSuccessor(t, dep, taskMap, indegree, maxConstraintStart, queue);
    }
  }

  const hasCycle = processed < tasks.length;
  const unprocessed = Math.max(0, tasks.length - processed);
  if (hasCycle) {
    logger.warn(
      `Forward pass não processou todas as tarefas (unprocessed=${unprocessed}). Possível ciclo nas dependências.`,
    );
  }
  return { hasCycle, unprocessed };
}

// ===========================================================================
// Backward Pass (Late Start / Late Finish)
// ===========================================================================

function computeCandidateBounds(
  dep: TaskDependencyEdgeDto,
  pred: TaskNodeResponseDto,
  lateStart: number,
  lateFinish: number,
): { candidateLateFinish: number; candidateLateStart: number } {
  if (dep.relationship === DependencyType.START_TO_START) {
    return {
      candidateLateStart: lateStart,
      candidateLateFinish: lateStart + pred.duration,
    };
  }
  if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
    return {
      candidateLateFinish: lateFinish,
      candidateLateStart: lateFinish - pred.duration,
    };
  }
  // Default: FINISH_TO_START
  return {
    candidateLateFinish: lateStart,
    candidateLateStart: lateStart,
  };
}

export function buildBackwardPassMaps(
  tasks: TaskNodeResponseDto[],
  projectDuration: number,
  edgeMap: Map<string, TaskDependencyEdgeDto[]>,
  taskMap: Map<string, TaskNodeResponseDto>,
): {
  outdegree: Map<string, number>;
  predecessorBounds: Map<string, { maxLateFinish: number; maxLateStart: number }>;
} {
  const outdegree = new Map<string, number>();
  const predecessorBounds = new Map<string, { maxLateFinish: number; maxLateStart: number }>();

  for (const t of tasks) {
    outdegree.set(t.id, 0);
    predecessorBounds.set(t.id, {
      maxLateFinish: projectDuration,
      maxLateStart: projectDuration - t.duration,
    });

    for (const dep of edgeMap.get(t.id) ?? []) {
      if (!taskMap.has(dep.predecessorId)) continue;
      outdegree.set(dep.predecessorId, (outdegree.get(dep.predecessorId) ?? 0) + 1);
    }
  }

  return { outdegree, predecessorBounds };
}

export function updateBackwardPredecessor(
  successor: TaskNodeResponseDto,
  dep: TaskDependencyEdgeDto,
  taskMap: Map<string, TaskNodeResponseDto>,
  outdegree: Map<string, number>,
  predecessorBounds: Map<string, { maxLateFinish: number; maxLateStart: number }>,
  projectDuration: number,
  queue: string[],
): void {
  const pred = taskMap.get(dep.predecessorId);
  if (!pred) return;

  const lateFinish = successor.lateFinish ?? projectDuration;
  const lateStart = successor.lateStart ?? lateFinish - successor.duration;

  const { candidateLateFinish, candidateLateStart } = computeCandidateBounds(
    dep,
    pred,
    lateStart,
    lateFinish,
  );

  const bounds = predecessorBounds.get(dep.predecessorId) ?? {
    maxLateFinish: projectDuration,
    maxLateStart: projectDuration - pred.duration,
  };
  bounds.maxLateFinish = Math.min(bounds.maxLateFinish, candidateLateFinish);
  bounds.maxLateStart = Math.min(bounds.maxLateStart, candidateLateStart);
  predecessorBounds.set(dep.predecessorId, bounds);

  const newDeg = (outdegree.get(dep.predecessorId) || 0) - 1;
  outdegree.set(dep.predecessorId, newDeg);
  if (newDeg === 0) queue.push(dep.predecessorId);
}

export function backwardPass(
  tasks: TaskNodeResponseDto[],
  projectDuration: number,
  edgeMap: Map<string, TaskDependencyEdgeDto[]>,
): { hasCycle: boolean; unprocessed: number } {
  const taskMap = new Map<string, TaskNodeResponseDto>();
  for (const t of tasks) taskMap.set(t.id, t);

  const { outdegree, predecessorBounds } = buildBackwardPassMaps(
    tasks,
    projectDuration,
    edgeMap,
    taskMap,
  );

  const queue: string[] = [];
  for (const [id, deg] of outdegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const t = taskMap.get(id);
    if (!t) continue;

    const bounds = predecessorBounds.get(id);
    const lateFinish = Math.min(bounds?.maxLateFinish ?? projectDuration, projectDuration);
    const lateStart = Math.min(
      bounds?.maxLateStart ?? projectDuration - t.duration,
      lateFinish - t.duration,
    );

    t.lateFinish = lateFinish;
    t.lateStart = lateStart;
    processed++;

    for (const dep of edgeMap.get(id) || []) {
      updateBackwardPredecessor(t, dep, taskMap, outdegree, predecessorBounds, projectDuration, queue);
    }
  }

  const hasCycle = processed < tasks.length;
  const unprocessed = Math.max(0, tasks.length - processed);
  if (hasCycle) {
    logger.warn(
      `Backward pass não processou todas as tarefas (unprocessed=${unprocessed}). Possível ciclo nas dependências.`,
    );
  }
  return { hasCycle, unprocessed };
}
