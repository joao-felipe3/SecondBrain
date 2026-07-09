import { InferredDependency, InferenceTask } from '../../../interfaces/dependency-inference.interface';

const PHASE_ORDER = ['prepare', 'produce', 'test', 'consolidate', 'practice'];

function getTaskPhase(task: InferenceTask): string {
  const raw = String(task.microTaskType ?? '')
    .trim()
    .toLowerCase();
  return PHASE_ORDER.includes(raw) ? raw : 'produce';
}

function buildPhaseGates(tasks: InferenceTask[]): Map<string, InferenceTask> {
  const gateByPhase = new Map<string, InferenceTask>();
  for (const t of tasks) {
    const p = getTaskPhase(t);
    if (!gateByPhase.has(p)) gateByPhase.set(p, t);
  }
  return gateByPhase;
}

function buildInterPhaseDependencies(
  phasesPresent: string[],
  gateByPhase: Map<string, InferenceTask>,
): InferredDependency[] {
  const deps: InferredDependency[] = [];
  for (let i = 1; i < phasesPresent.length; i++) {
    const prevGate = gateByPhase.get(phasesPresent[i - 1])!;
    const gate = gateByPhase.get(phasesPresent[i])!;
    if (gate.id !== prevGate.id) {
      deps.push({
        taskId: gate.id,
        dependsOnTaskId: prevGate.id,
        relationship: 'FINISH_TO_START',
        reason: `Heurística: fase ${phasesPresent[i]} depende de ${phasesPresent[i - 1]}`,
        confidence: 0.55,
      });
    }
  }
  return deps;
}

function buildIntraPhaseDependencies(
  tasks: InferenceTask[],
  gateByPhase: Map<string, InferenceTask>,
): InferredDependency[] {
  const deps: InferredDependency[] = [];
  for (const t of tasks) {
    const p = getTaskPhase(t);
    const gate = gateByPhase.get(p);
    if (!gate || t.id === gate.id) continue;
    deps.push({
      taskId: t.id,
      dependsOnTaskId: gate.id,
      relationship: 'FINISH_TO_START',
      reason: `Heurística: task da fase ${p} depende do gate da fase`,
      confidence: 0.45,
    });
  }
  return deps;
}

export function inferHeuristicPhases(tasks: InferenceTask[]): InferredDependency[] {
  const normalized = (tasks || []).filter((t) => t?.id && t?.name);
  if (normalized.length < 2) return [];

  const gateByPhase = buildPhaseGates(normalized);
  const phasesPresent = PHASE_ORDER.filter((p) => gateByPhase.has(p));

  if (phasesPresent.length === 0) return [];

  const interDeps = buildInterPhaseDependencies(phasesPresent, gateByPhase);
  const intraDeps = buildIntraPhaseDependencies(normalized, gateByPhase);

  return [...interDeps, ...intraDeps];
}

export function filterInvalidAndSelfEdges(
  deps: InferredDependency[],
  validIds: Set<string>,
): InferredDependency[] {
  const seen = new Set<string>();
  const out: InferredDependency[] = [];
  for (const d of deps || []) {
    const taskId = String(d?.taskId || '').trim();
    const depId = String(d?.dependsOnTaskId || '').trim();
    if (!taskId || !depId || taskId === depId) continue;
    if (!validIds.has(taskId) || !validIds.has(depId)) continue;

    const key = `${taskId}<-${depId}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push({ ...d, taskId, dependsOnTaskId: depId });
  }
  return out;
}

function wouldCreateCycle({
  from,
  to,
  adj,
}: {
  from: string;
  to: string;
  adj: Map<string, Set<string>>;
}): boolean {
  const stack = [from];
  const visited = new Set<string>();

  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    if (visited.has(cur)) continue;

    visited.add(cur);
    const nexts = adj.get(cur);
    if (nexts) {
      for (const n of nexts) stack.push(n);
    }
  }
  return false;
}

export function keepAcyclic(taskIds: string[], deps: InferredDependency[]): InferredDependency[] {
  const nodes = new Set(taskIds);
  const adj = new Map<string, Set<string>>();
  for (const id of nodes) adj.set(id, new Set());

  const accepted: InferredDependency[] = [];
  for (const d of deps) {
    const { taskId, dependsOnTaskId: depId } = d;
    if (!nodes.has(taskId) || !nodes.has(depId)) continue;

    if (wouldCreateCycle({ from: taskId, to: depId, adj })) continue;

    adj.get(depId)!.add(taskId);
    accepted.push(d);
  }
  return accepted;
}

export function truncateText(input: unknown, maxLen: number): string | undefined {
  const s = String(input ?? '').trim();
  if (!s) return undefined;
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

export function previewText(input: unknown, maxLen: number): string {
  const s = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

export function normalizeDependencies(raw: Array<unknown>): InferredDependency[] {
  const out: InferredDependency[] = [];
  for (const item of raw || []) {
    if (Array.isArray(item)) {
      const taskId = String(item[0] ?? '').trim();
      const dependsOnTaskId = String(item[1] ?? '').trim();
      const relationship = item[2] ? String(item[2]).trim() : 'FINISH_TO_START';

      if (taskId && dependsOnTaskId) {
        out.push({ taskId, dependsOnTaskId, relationship });
      }
      continue;
    }

    if (item && typeof item === 'object') {
      const anyItem = item as Record<string, unknown>;
      out.push({
        taskId: String(anyItem.taskId ?? '').trim(),
        dependsOnTaskId: String(anyItem.dependsOnTaskId ?? '').trim(),
        relationship: anyItem.relationship ? String(anyItem.relationship).trim() : undefined,
        reason: anyItem.reason ? String(anyItem.reason) : undefined,
        confidence: typeof anyItem.confidence === 'number' ? anyItem.confidence : undefined,
      });
    }
  }
  return out;
}
