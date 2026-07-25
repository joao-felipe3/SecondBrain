import { ProjectDocument } from '../../../schemas/project.schema';
import { TaskDocument } from '../../../../tasks/schemas/task.schema';
import { ProjectWaveDocument } from '../../../schemas/project-wave.schema';
import { TaskDependency } from '../../../../tasks/entities/task-dependency.entity';
import { TaskNode } from '../../../../tasks/interfaces/cpm.interface';
import { GanttTaskItem, GanttDependencyItem, GanttTimeWindow } from '../../../dto/gantt.dto';
import {
  EffectiveEndParams,
  AdjustWindowBoundsParams,
  ResolveWindowParams,
  BuildTaskNodesParams,
  MapSingleTaskItemParams,
  MapTaskItemsParams,
} from '../../../interfaces/gantt.interface';

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

export function mapWavesByTaskId(waves: ProjectWaveDocument[]): Map<string, ProjectWaveDocument> {
  const waveByTaskId = new Map<string, ProjectWaveDocument>();
  for (const wave of waves) {
    for (const taskId of wave.taskIds || []) {
      waveByTaskId.set(String(taskId), wave);
    }
  }
  return waveByTaskId;
}

export function calculateFallbackProjectStart(
  project: ProjectDocument,
  firstWave?: ProjectWaveDocument,
): Date {
  return project.startDate
    ? new Date(project.startDate)
    : firstWave?.startDate
      ? new Date(firstWave.startDate)
      : new Date();
}

export function mapMetricsByTaskId(tasksByImpact: TaskNode[]): Map<string, TaskNode> {
  const metricsById = new Map<string, TaskNode>();
  for (const metric of tasksByImpact) {
    metricsById.set(metric.id, metric);
  }
  return metricsById;
}

export function getWaveBounds(wave: ProjectWaveDocument | null): {
  start: Date | null;
  end: Date | null;
} {
  return {
    start: wave?.startDate ? new Date(wave.startDate) : null,
    end: wave?.endDate ? new Date(wave.endDate) : null,
  };
}

export function calculateEffectiveEnd(params: EffectiveEndParams): Date {
  const { taskDeadline, waveEnd, projectDeadline } = params;
  let end = taskDeadline || waveEnd || projectDeadline || new Date();
  if (waveEnd && end.getTime() > waveEnd.getTime()) {
    end = new Date(waveEnd);
  }
  return end;
}

export function adjustWindowToBounds(params: AdjustWindowBoundsParams): {
  startDate: Date;
  endDate: Date;
} {
  const { start, end, waveStart, waveEnd, durationMs } = params;
  let effectiveStart = new Date(start);
  let effectiveEnd = new Date(end);

  if (waveStart && effectiveStart.getTime() < waveStart.getTime()) {
    effectiveStart = new Date(waveStart);
  }

  if (waveEnd && effectiveStart.getTime() > waveEnd.getTime()) {
    const fallbackStart = Math.max(
      waveStart?.getTime() || waveEnd.getTime() - durationMs,
      waveEnd.getTime() - durationMs,
    );
    effectiveStart = new Date(fallbackStart);
    effectiveEnd = new Date(waveEnd);
  }

  if (effectiveStart.getTime() > effectiveEnd.getTime()) {
    effectiveStart = new Date(effectiveEnd.getTime() - durationMs);
  }

  return { startDate: effectiveStart, endDate: effectiveEnd };
}

export function resolveWindowByDeadline(params: ResolveWindowParams): GanttTimeWindow {
  const { task, durationHours, wave, project } = params;
  const { start: waveStart, end: waveEnd } = getWaveBounds(wave);

  const taskDeadline = task?.deadline ? new Date(task.deadline) : null;
  const projectDeadline = project.deadline ? new Date(project.deadline) : null;
  const durationMs = Math.max(1, durationHours) * 60 * 60 * 1000;

  const effectiveEnd = calculateEffectiveEnd({ taskDeadline, waveEnd, projectDeadline });
  const initialStart = new Date(effectiveEnd.getTime() - durationMs);

  const adjusted = adjustWindowToBounds({
    start: initialStart,
    end: effectiveEnd,
    waveStart,
    waveEnd,
    durationMs,
  });

  return {
    startDate: adjusted.startDate.toISOString(),
    endDate: adjusted.endDate.toISOString(),
  };
}

export function buildTaskNodes(params: BuildTaskNodesParams): TaskNode[] {
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
  for (const node of taskNodes) nodeById.set(node.id, node);

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

export function mapSingleTaskItem(params: MapSingleTaskItemParams): GanttTaskItem {
  const { task, metric, wave, project } = params;
  const id = task?._id?.toString?.() || String(task?.id || '');
  const durationHours = round2(toMinutes(task) / 60);
  const earlyStart = round2(metric?.earlyStart ?? 0);
  const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
  const lateStart = round2(metric?.lateStart ?? earlyStart);
  const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
  const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));

  const timelineWindow = resolveWindowByDeadline({
    task,
    durationHours,
    wave,
    project,
  });

  return {
    id,
    name: String(task?.name || 'Task'),
    startDate: timelineWindow.startDate,
    endDate: timelineWindow.endDate,
    durationHours,
    earlyStart,
    earlyFinish,
    lateStart,
    lateFinish,
    slack: round2(metric?.slack ?? 0),
    isCritical: Boolean(metric?.isCritical),
    progress: round2(progress),
    isConcluded: Boolean(task?.isConcluded),
    priority: Number(task?.priority || 0),
    parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
    wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
  };
}

export function mapTaskItems(params: MapTaskItemsParams): GanttTaskItem[] {
  const { tasks, metricsById, waveByTaskId, project } = params;
  return tasks
    .map((task: TaskDocument) => {
      const id = task?._id?.toString?.() || String(task?.id || '');
      const metric = metricsById.get(id);
      const wave = waveByTaskId.get(id) || null;

      return mapSingleTaskItem({
        task,
        metric,
        wave,
        project,
      });
    })
    .sort((a, b) => {
      const left = new Date(a.startDate).getTime();
      const right = new Date(b.startDate).getTime();
      return left - right || a.name.localeCompare(b.name);
    });
}

export function mapDependencyItems(dependencies: TaskDependency[]): GanttDependencyItem[] {
  return dependencies
    .map((dep: TaskDependency) => ({
      id: dep?.id || `${dep.taskId}-${dep.dependsOnTaskId}`,
      fromTaskId: String(dep?.dependsOnTaskId || ''),
      toTaskId: String(dep?.taskId || ''),
      relationship: dep?.relationship || 'finish-to-start',
      reason: dep?.reason ? String(dep.reason) : undefined,
      isAutoIdentified: Boolean(dep?.isAutoIdentified),
    }))
    .filter((dep) => dep.fromTaskId && dep.toTaskId);
}
