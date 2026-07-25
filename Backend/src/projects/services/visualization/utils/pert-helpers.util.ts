import { TaskDocument } from '../../../../tasks/schemas/task.schema';
import { TaskDependency } from '../../../../tasks/entities/task-dependency.entity';
import { TaskNode } from '../../../../tasks/interfaces/cpm.interface';
import { PertDiagramNode, PertDiagramEdge } from '../../../dto/pert-diagram.dto';
import {
  BuildPertTaskNodesParams,
  MapPertNodesParams,
  MapPertEdgesParams,
} from '../../../interfaces/pert.interface';

export function round2(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

export function toMinutes(task: TaskDocument): number {
  if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
    return task.pertExpectedMinutes;
  }
  if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
    return task.pomodorosPlanned * 25;
  }
  return 60;
}

export function buildTaskNodes(params: BuildPertTaskNodesParams): TaskNode[] {
  const { tasks, dependencies, normalizeRelationship } = params;
  const taskNodes: TaskNode[] = tasks.map((task: TaskDocument) => ({
    id: task?._id?.toString?.() || String(task?.id || ''),
    name: String(task?.name || 'Task'),
    duration: toMinutes(task),
    dependencies: [],
    dependencyEdges: [],
    parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
    wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
  }));

  const nodeById = new Map<string, TaskNode>();
  for (const node of taskNodes) {
    nodeById.set(node.id, node);
  }

  for (const dep of dependencies) {
    const taskId = String(dep?.taskId || '').trim();
    const dependsOnTaskId = String(dep?.dependsOnTaskId || '').trim();
    if (!taskId || !dependsOnTaskId) continue;
    const node = nodeById.get(taskId);
    if (node) {
      node.dependencies.push(dependsOnTaskId);
      node.dependencyEdges?.push({
        predecessorId: dependsOnTaskId,
        relationship: normalizeRelationship(dep?.relationship),
      });
    }
  }

  return taskNodes;
}

export function computeTaskLevels(
  tasks: TaskDocument[],
  dependencies: TaskDependency[],
): Map<string, number> {
  const predecessorMap = new Map<string, Set<string>>();
  for (const task of tasks) {
    const id = task?._id?.toString?.() || String(task?.id || '');
    predecessorMap.set(id, new Set<string>());
  }

  for (const dep of dependencies) {
    const target = String(dep?.taskId || '').trim();
    const source = String(dep?.dependsOnTaskId || '').trim();
    if (!predecessorMap.has(target) || !predecessorMap.has(source)) continue;
    predecessorMap.get(target)!.add(source);
  }

  const levelMemo = new Map<string, number>();
  const computeLevel = (taskId: string, stack = new Set<string>()): number => {
    if (levelMemo.has(taskId)) return levelMemo.get(taskId)!;
    if (stack.has(taskId)) return 0;
    stack.add(taskId);
    const predecessors = Array.from(predecessorMap.get(taskId) || []);
    if (predecessors.length === 0) {
      levelMemo.set(taskId, 0);
      stack.delete(taskId);
      return 0;
    }

    const level = 1 + Math.max(...predecessors.map((id) => computeLevel(id, stack)));
    levelMemo.set(taskId, level);
    stack.delete(taskId);
    return level;
  };

  const taskLevels = new Map<string, number>();
  for (const task of tasks) {
    const id = task?._id?.toString?.() || String(task?.id || '');
    taskLevels.set(id, computeLevel(id));
  }
  return taskLevels;
}

export function mapNodes(params: MapPertNodesParams): PertDiagramNode[] {
  const { tasks, metricsById, taskLevels } = params;
  return tasks.map((task: TaskDocument) => {
    const id = task?._id?.toString?.() || String(task?.id || '');
    const metric = metricsById.get(id);
    const durationHours = round2(toMinutes(task) / 60);
    const earlyStart = round2(metric?.earlyStart ?? 0);
    const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
    const lateStart = round2(metric?.lateStart ?? earlyStart);
    const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
    const slack = round2(metric?.slack ?? 0);
    const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
    const level = taskLevels.get(id) ?? 0;
    return {
      id,
      name: String(task?.name || 'Task'),
      durationHours,
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      slack,
      isCritical: Boolean(metric?.isCritical),
      progress: round2(progress),
      isConcluded: Boolean(task?.isConcluded),
      priority: Number(task?.priority || 0),
      parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
      wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
      x: level,
      y: earlyStart,
    };
  });
}

export function mapEdges(params: MapPertEdgesParams): PertDiagramEdge[] {
  const { dependencies, taskNodesById, criticalPath } = params;
  const criticalSet = new Set(criticalPath || []);
  const edges: PertDiagramEdge[] = [];

  for (const dep of dependencies) {
    const source = String(dep?.dependsOnTaskId || '').trim();
    const target = String(dep?.taskId || '').trim();
    if (!source || !target || !taskNodesById.has(source) || !taskNodesById.has(target)) continue;

    edges.push({
      id: dep?.id || `${source}-${target}`,
      source,
      target,
      relationship: dep?.relationship || 'finish-to-start',
      reason: dep?.reason ? String(dep.reason) : undefined,
      isAutoIdentified: Boolean(dep?.isAutoIdentified),
      isCriticalEdge: criticalSet.has(source) && criticalSet.has(target),
    });
  }

  return edges;
}
