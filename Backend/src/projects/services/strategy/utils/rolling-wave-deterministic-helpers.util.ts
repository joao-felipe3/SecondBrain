import { Types } from 'mongoose';
import {
  WaveTask,
  DeterministicPartitionResult,
  TimelineMetrics,
  PartitionTasksDeterministicDto,
  TimelineMetricsOptions,
  NormalizeTasksOptions,
  DeterministicWaveResult,
  WaveAssignerInterface,
  AllocateTasksWithDeadlineOptions,
  BuildWavesOptions,
} from '../../../interfaces/rolling-wave.interface';
import { estimateTaskHours, flattenWbsTree, resolveGroupKey } from './rolling-wave-helpers.util';

const DAY_MS = 24 * 60 * 60 * 1000;

function calculateTimelineMetrics(options: TimelineMetricsOptions): TimelineMetrics {
  const { project, tasks, dailyCapacityHours, waveLengthDays, today } = options;
  const safeWaveLengthDays = Math.max(7, waveLengthDays);

  if (!project?.deadline) {
    throw new Error('Project deadline is required to calculate timeline metrics.');
  }

  const deadline = new Date(project.deadline);
  if (isNaN(deadline.getTime())) {
    throw new Error(`Invalid project deadline date format: ${String(project.deadline)}`);
  }

  if (dailyCapacityHours <= 0) {
    throw new Error('Daily capacity hours must be greater than zero.');
  }

  const safeTasks = tasks || [];
  const plannedTotalMs = deadline.getTime() - today.getTime();
  const plannedDurationDays = Math.max(1, Math.ceil(plannedTotalMs / DAY_MS));

  const totalTaskHours = safeTasks.reduce((sum, task) => sum + estimateTaskHours(task), 0);
  const requiredDaysByCapacity = Math.max(1, Math.ceil(totalTaskHours / dailyCapacityHours));

  const effectiveDurationDays = Math.max(plannedDurationDays, requiredDaysByCapacity);
  let adjustedDeadline: Date | null = null;

  if (effectiveDurationDays > plannedDurationDays) {
    adjustedDeadline = new Date(today.getTime() + effectiveDurationDays * DAY_MS);
  }

  const waveLengthMs = safeWaveLengthDays * DAY_MS;
  const waveCount = Math.max(1, Math.ceil(effectiveDurationDays / safeWaveLengthDays));
  const waveCapacityHours = safeWaveLengthDays * dailyCapacityHours;

  return {
    safeWaveLengthDays,
    dayMs: DAY_MS,
    deadline,
    plannedDurationDays,
    effectiveDurationDays,
    adjustedDeadline,
    waveLengthMs,
    waveCount,
    waveCapacityHours,
  };
}

function normalizeTasks(options: NormalizeTasksOptions): WaveTask[] {
  const { tasks, wbsTree, today, effectiveDurationDays, dayMs } = options;
  const wbsFlat = flattenWbsTree(wbsTree);
  const wbsById = new Map(wbsFlat.map((node) => [node.id, node]));
  const timelineRangeMs = Math.max(1, effectiveDurationDays * dayMs);

  return tasks.map((task) => {
    const id = String(task._id || task.id);
    const hours = estimateTaskHours(task);
    const deadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;
    const groupKey = resolveGroupKey(task, wbsById, today.getTime(), timelineRangeMs);
    return { id, hours, deadlineTime, groupKey };
  });
}

class WaveAssigner implements WaveAssignerInterface {
  private waveTaskIds = new Map<number, Types.ObjectId[]>();
  private waveUsedHours: number[];

  constructor(
    private readonly waveCount: number,
    private readonly waveCapacityHours: number,
  ) {
    this.waveUsedHours = new Array<number>(waveCount).fill(0);
  }

  public getTaskIdsForWave(waveIndex: number): Types.ObjectId[] {
    return this.waveTaskIds.get(waveIndex) || [];
  }

  public getUsedHours(): number[] {
    return this.waveUsedHours;
  }

  public pushToWave(waveIndex: number, task: WaveTask) {
    this.waveUsedHours[waveIndex] += task.hours;
    const bucket = this.waveTaskIds.get(waveIndex) || [];
    bucket.push(new Types.ObjectId(task.id));
    this.waveTaskIds.set(waveIndex, bucket);
  }

  public findWaveIndexWithCapacity(preferredIndex: number, taskHours: number): number {
    for (let idx = preferredIndex; idx >= 0; idx--) {
      if (this.waveUsedHours[idx] + taskHours <= this.waveCapacityHours) return idx;
    }
    for (let idx = preferredIndex + 1; idx < this.waveCount; idx++) {
      if (this.waveUsedHours[idx] + taskHours <= this.waveCapacityHours) return idx;
    }
    return this.waveCount - 1;
  }

  public findLeastLoadedWave(): number {
    let bestIdx = 0;
    let bestUsed = Number.POSITIVE_INFINITY;
    for (let idx = 0; idx < this.waveCount; idx++) {
      const score = this.waveUsedHours[idx];
      if (score < bestUsed) {
        bestUsed = score;
        bestIdx = idx;
      }
    }
    return bestIdx;
  }
}

// Aloca tarefas com data de vencimento nas ondas correspondentes baseando-se no prazo
function allocateTasksWithDeadline(options: AllocateTasksWithDeadlineOptions): void {
  const { assigner, normalizedTasks, today, waveLengthMs, waveCount } = options;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const tasksWithDeadline = normalizedTasks
    .filter((t) => t.deadlineTime != null)
    .sort((a, b) => {
      const aDeadline = a.deadlineTime as number;
      const bDeadline = b.deadlineTime as number;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return b.hours - a.hours;
    });

  for (const task of tasksWithDeadline) {
    const desiredIndex = clamp(
      Math.floor(((task.deadlineTime as number) - today.getTime()) / waveLengthMs),
      0,
      waveCount - 1,
    );
    const targetIndex = assigner.findWaveIndexWithCapacity(desiredIndex, task.hours);
    assigner.pushToWave(targetIndex, task);
  }
}

// Aloca tarefas sem prazo definido priorizando as ondas menos carregadas
function allocateTasksWithoutDeadline(assigner: WaveAssigner, normalizedTasks: WaveTask[]): void {
  const tasksWithoutDeadline = normalizedTasks
    .filter((t) => t.deadlineTime == null)
    .sort((a, b) => b.hours - a.hours);

  for (const task of tasksWithoutDeadline) {
    const preferredIndex = assigner.findLeastLoadedWave();
    const targetIndex = assigner.findWaveIndexWithCapacity(preferredIndex, task.hours);
    assigner.pushToWave(targetIndex, task);
  }
}

// Constrói a estrutura final das ondas particionadas
function buildWaves(options: BuildWavesOptions): DeterministicWaveResult[] {
  const { assigner, waveCount, waveLengthMs, today, currentDeadline } = options;
  const waves: DeterministicWaveResult[] = [];
  for (let i = 1; i <= waveCount; i++) {
    const waveStartDate = new Date(today.getTime() + (i - 1) * waveLengthMs);
    const nominalEnd = new Date(waveStartDate.getTime() + waveLengthMs);
    const hardEnd = currentDeadline;
    const waveEndDate = nominalEnd > hardEnd ? hardEnd : nominalEnd;
    const taskIds = assigner.getTaskIdsForWave(i - 1);

    waves.push({
      waveNumber: i,
      startDate: waveStartDate,
      endDate: waveEndDate,
      status: 'planned',
      taskIds,
      description: `Wave ${i}`,
    });
  }
  return waves;
}

// Particiona tarefas deterministicamente com base em prazos e capacidade diária
export function partitionTasksDeterministically(
  options: PartitionTasksDeterministicDto,
): DeterministicPartitionResult {
  const { project, tasks, wbsTree, dailyCapacityHours, waveLengthDays, today } = options;
  const metrics = calculateTimelineMetrics({
    project,
    tasks,
    dailyCapacityHours,
    waveLengthDays,
    today,
  });

  const normalizedTasks = normalizeTasks({
    tasks,
    wbsTree,
    today,
    effectiveDurationDays: metrics.effectiveDurationDays,
    dayMs: metrics.dayMs,
  });

  const assigner = new WaveAssigner(metrics.waveCount, metrics.waveCapacityHours);

  // 1. Alocar tarefas com data de vencimento (deadline) definida
  allocateTasksWithDeadline({
    assigner,
    normalizedTasks,
    today,
    waveLengthMs: metrics.waveLengthMs,
    waveCount: metrics.waveCount,
  });

  // 2. Alocar tarefas sem data de vencimento
  allocateTasksWithoutDeadline(assigner, normalizedTasks);

  // 3. Estruturar o resultado com as informações das waves
  const currentDeadline = metrics.adjustedDeadline || metrics.deadline;
  const waves = buildWaves({
    assigner,
    waveCount: metrics.waveCount,
    waveLengthMs: metrics.waveLengthMs,
    today,
    currentDeadline,
  });

  return {
    adjustedDeadline: metrics.adjustedDeadline,
    waves,
  };
}
