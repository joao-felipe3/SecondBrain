import { DependencyType } from '../../../schemas/task-dependency.schema';
import {
  TaskNodeResponseDto,
  FindEndNodeDto,
  EvaluateDependencyAlignmentDto,
  FindBestPredecessorDto,
  BuildCriticalPathSequenceDto,
} from '../../../dto/dependencies/cpm.dto';

function findEndNode({ tasks, projectDuration, eps }: FindEndNodeDto): TaskNodeResponseDto | undefined {
  let end: TaskNodeResponseDto | undefined;
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

function evaluateDependencyAlignment({ pred, cur, dep, eps }: EvaluateDependencyAlignmentDto): {
  aligns: boolean;
  timelineRef: number;
} {
  const es = typeof cur.earlyStart === 'number' ? cur.earlyStart : 0;
  const ef = typeof cur.earlyFinish === 'number' ? cur.earlyFinish : es + (cur.duration || 0);

  const predES = typeof pred.earlyStart === 'number' ? pred.earlyStart : 0;
  const predEF = typeof pred.earlyFinish === 'number' ? pred.earlyFinish : predES + (pred.duration || 0);

  let aligns = false;
  let timelineRef: number;

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
}: FindBestPredecessorDto): TaskNodeResponseDto | undefined {
  let bestPred: TaskNodeResponseDto | undefined;
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
}: BuildCriticalPathSequenceDto): string[] {
  const taskById = new Map<string, TaskNodeResponseDto>();
  for (const t of tasks) taskById.set(t.id, t);

  const eps = 0.11;
  const end = findEndNode({ tasks, projectDuration, eps });

  if (!end || typeof end.earlyFinish !== 'number') return [];

  const path: string[] = [];
  const visited = new Set<string>();
  let cur: TaskNodeResponseDto = end;

  while (!visited.has(cur.id)) {
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
