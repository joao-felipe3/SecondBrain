import { InferredDependency, InferenceTask } from '../../../interfaces/dependency-inference.interface';

export function inferHeuristicPhases(tasks: InferenceTask[]): InferredDependency[] {
  const normalized = (tasks || []).filter((t) => t?.id && t?.name);
  if (normalized.length < 2) return [];

  const phaseOrder = ['prepare', 'produce', 'test', 'consolidate', 'practice'];
  const phaseOf = (t: InferenceTask) => {
    const raw = String(t.microTaskType ?? '')
      .trim()
      .toLowerCase();
    if (phaseOrder.includes(raw)) return raw;
    return 'produce';
  };

  const gateByPhase = new Map<string, InferenceTask>();
  for (const t of normalized) {
    const p = phaseOf(t);
    if (!gateByPhase.has(p)) gateByPhase.set(p, t);
  }

  const phasesPresent = phaseOrder.filter((p) => gateByPhase.has(p));
  if (phasesPresent.length === 0) return [];

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

  for (const t of normalized) {
    const p = phaseOf(t);
    const gate = gateByPhase.get(p);
    if (!gate) continue;
    if (t.id === gate.id) continue;
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

export function filterInvalidAndSelfEdges(
  deps: InferredDependency[],
  validIds: Set<string>,
): InferredDependency[] {
  const seen = new Set<string>();
  const out: InferredDependency[] = [];
  for (const d of deps || []) {
    const taskId = String(d?.taskId || '').trim();
    const depId = String(d?.dependsOnTaskId || '').trim();
    if (!taskId || !depId) continue;
    if (taskId === depId) continue;
    if (!validIds.has(taskId) || !validIds.has(depId)) continue;
    const key = `${taskId}<-${depId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, taskId, dependsOnTaskId: depId });
  }
  return out;
}

export function keepAcyclic(taskIds: string[], deps: InferredDependency[]): InferredDependency[] {
  const nodes = new Set(taskIds);
  const adj = new Map<string, Set<string>>();
  for (const id of nodes) adj.set(id, new Set());

  const wouldCreateCycle = (from: string, to: string) => {
    const start = from;
    const target = to;
    const stack = [start];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const nexts = adj.get(cur);
      if (!nexts) continue;
      for (const n of nexts) stack.push(n);
    }
    return false;
  };

  const accepted: InferredDependency[] = [];
  for (const d of deps) {
    const taskId = d.taskId;
    const depId = d.dependsOnTaskId;
    if (!nodes.has(taskId) || !nodes.has(depId)) continue;

    if (wouldCreateCycle(taskId, depId)) continue;
    adj.get(depId)!.add(taskId);
    accepted.push(d);
  }
  return accepted;
}

export function truncateText(input: unknown, maxLen: number): string | undefined {
  const s = String(input ?? '').trim();
  if (!s) return undefined;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

export function previewText(input: unknown, maxLen: number): string {
  const s = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

export function normalizeDependencies(raw: Array<unknown>): InferredDependency[] {
  const out: InferredDependency[] = [];
  for (const item of raw || []) {
    if (Array.isArray(item)) {
      const taskId = String(item[0] ?? '').trim();
      const dependsOnTaskId = String(item[1] ?? '').trim();
      const relationship = item[2] ? String(item[2]).trim() : 'FINISH_TO_START';
      if (!taskId || !dependsOnTaskId) continue;
      out.push({ taskId, dependsOnTaskId, relationship });
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
