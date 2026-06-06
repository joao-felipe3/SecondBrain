import { Logger } from '@nestjs/common';
import { DependencyType } from '../../schemas/task-dependency.schema';
import { TaskDependencyEdge, TaskNode } from '../../interfaces/cpm.interface';

const logger = new Logger('CPMPassesUtils');

export function normalizeRelationship(input?: string): DependencyType {
  const raw = String(input ?? '').trim();
  const lowered = raw.toLowerCase();

  if (
    lowered === DependencyType.FINISH_TO_START ||
    lowered === DependencyType.START_TO_START ||
    lowered === DependencyType.FINISH_TO_FINISH
  ) {
    return lowered as DependencyType;
  }

  const upper = raw.toUpperCase();
  if (upper === 'FINISH_TO_START') return DependencyType.FINISH_TO_START;
  if (upper === 'START_TO_START') return DependencyType.START_TO_START;
  if (upper === 'FINISH_TO_FINISH') return DependencyType.FINISH_TO_FINISH;

  return DependencyType.FINISH_TO_START;
}

export function forwardPass(
  tasks: TaskNode[],
  edgeMap: Map<string, TaskDependencyEdge[]>,
): { hasCycle: boolean; unprocessed: number } {
  const taskMap = new Map<string, TaskNode>();
  for (const t of tasks) taskMap.set(t.id, t);

  const indegree = new Map<string, number>();
  const dependents = new Map<string, Array<{ successorId: string; relationship: DependencyType }>>();
  const maxConstraintStart = new Map<string, number>();

  for (const t of tasks) {
    indegree.set(t.id, 0);
    dependents.set(t.id, []);
    maxConstraintStart.set(t.id, 0);
  }

  for (const t of tasks) {
    const deps = edgeMap.get(t.id) || [];
    for (const dep of deps) {
      if (!taskMap.has(dep.predecessorId)) continue;
      indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
      dependents.get(dep.predecessorId)!.push({
        successorId: t.id,
        relationship: dep.relationship,
      });
    }
  }

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
      const dependent = taskMap.get(dep.successorId);
      if (!dependent) continue;

      let candidateStart = t.earlyFinish || 0;
      if (dep.relationship === DependencyType.START_TO_START) {
        candidateStart = t.earlyStart || 0;
      } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
        candidateStart = (t.earlyFinish || 0) - (dependent.duration || 0);
      }

      const nextMax = Math.max(maxConstraintStart.get(dep.successorId) || 0, candidateStart);
      maxConstraintStart.set(dep.successorId, nextMax);

      const newDeg = (indegree.get(dep.successorId) || 0) - 1;
      indegree.set(dep.successorId, newDeg);
      if (newDeg === 0) queue.push(dep.successorId);
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

export function backwardPass(
  tasks: TaskNode[],
  projectDuration: number,
  edgeMap: Map<string, TaskDependencyEdge[]>,
): { hasCycle: boolean; unprocessed: number } {
  const taskMap = new Map<string, TaskNode>();
  for (const t of tasks) taskMap.set(t.id, t);

  const outdegree = new Map<string, number>();
  const predecessorBounds = new Map<string, { maxLateFinish: number; maxLateStart: number }>();

  for (const t of tasks) {
    outdegree.set(t.id, 0);
    predecessorBounds.set(t.id, {
      maxLateFinish: projectDuration,
      maxLateStart: projectDuration - t.duration,
    });
  }

  for (const t of tasks) {
    const deps = edgeMap.get(t.id) || [];
    for (const dep of deps) {
      if (!taskMap.has(dep.predecessorId)) continue;
      outdegree.set(dep.predecessorId, (outdegree.get(dep.predecessorId) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of outdegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const t = taskMap.get(id);
    if (!t) continue;
    const lateFinish = Math.min(
      predecessorBounds.get(id)?.maxLateFinish ?? projectDuration,
      projectDuration,
    );
    const lateStart = Math.min(
      predecessorBounds.get(id)?.maxLateStart ?? projectDuration - t.duration,
      lateFinish - t.duration,
    );
    t.lateFinish = lateFinish;
    t.lateStart = lateStart;
    processed++;

    for (const dep of edgeMap.get(id) || []) {
      const pred = taskMap.get(dep.predecessorId);
      if (!pred) continue;

      let candidateLateFinish = lateStart;
      let candidateLateStart = lateStart;

      if (dep.relationship === DependencyType.START_TO_START) {
        candidateLateStart = lateStart;
        candidateLateFinish = lateStart + pred.duration;
      } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
        candidateLateFinish = lateFinish;
        candidateLateStart = lateFinish - pred.duration;
      }

      const bounds = predecessorBounds.get(dep.predecessorId) || {
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

export function getDependencyEdges(task: TaskNode): TaskDependencyEdge[] {
  const normalized: TaskDependencyEdge[] = [];
  const seen = new Set<string>();

  const explicitEdges = Array.isArray(task.dependencyEdges) ? task.dependencyEdges : [];
  for (const edge of explicitEdges) {
    const predecessorId = String(edge?.predecessorId ?? '').trim();
    if (!predecessorId) continue;
    if (seen.has(predecessorId)) continue;
    seen.add(predecessorId);
    normalized.push({
      predecessorId,
      relationship: normalizeRelationship(edge?.relationship),
    });
  }

  const fallbackDeps = Array.isArray(task.dependencies) ? task.dependencies : [];
  for (const depId of fallbackDeps) {
    const predecessorId = String(depId ?? '').trim();
    if (!predecessorId) continue;
    if (seen.has(predecessorId)) continue;
    seen.add(predecessorId);
    normalized.push({
      predecessorId,
      relationship: DependencyType.FINISH_TO_START,
    });
  }

  return normalized;
}

export function buildEdgeMap(tasks: TaskNode[]): Map<string, TaskDependencyEdge[]> {
  const edgeMap = new Map<string, TaskDependencyEdge[]>();
  for (const task of tasks) {
    edgeMap.set(task.id, getDependencyEdges(task));
  }
  return edgeMap;
}
