import { Types } from 'mongoose';
import { WaveTask } from '../../../interfaces/rolling-wave.interface';
import {
  estimateTaskHours,
  flattenWbsTree,
  resolveGroupKey,
} from './rolling-wave-helpers.util';

export interface DeterministicPartitionResult {
  adjustedDeadline: Date | null;
  waves: Array<{
    waveNumber: number;
    startDate: Date;
    endDate: Date;
    status: 'planned';
    taskIds: Types.ObjectId[];
    description: string;
  }>;
}

/**
 * Particiona tarefas deterministicamente com base em prazos e capacidade diária
 */
export function partitionTasksDeterministically(
  project: any,
  tasks: any[],
  wbsTree: any[],
  dailyCapacityHours: number,
  waveLengthDays: number,
  today: Date,
): DeterministicPartitionResult {
  const safeWaveLengthDays = Math.max(7, waveLengthDays);
  const dayMs = 24 * 60 * 60 * 1000;

  const deadline = new Date(project.deadline);
  const plannedTotalMs = deadline.getTime() - today.getTime();
  const plannedDurationDays = Math.max(1, Math.ceil(plannedTotalMs / dayMs));

  const totalTaskHours = tasks.reduce((sum, task) => sum + estimateTaskHours(task), 0);
  const requiredDaysByCapacity = Math.max(1, Math.ceil(totalTaskHours / dailyCapacityHours));

  const effectiveDurationDays = Math.max(plannedDurationDays, requiredDaysByCapacity);
  let adjustedDeadline: Date | null = null;

  if (effectiveDurationDays > plannedDurationDays) {
    adjustedDeadline = new Date(today.getTime() + effectiveDurationDays * dayMs);
  }

  const waveLengthMs = safeWaveLengthDays * dayMs;
  const waveCount = Math.max(1, Math.ceil(effectiveDurationDays / safeWaveLengthDays));

  const waveTaskIds = new Map<number, Types.ObjectId[]>();
  const waveUsedHours = new Array<number>(waveCount).fill(0);

  const wbsFlat = flattenWbsTree(wbsTree);
  const wbsById = new Map(wbsFlat.map((node) => [node.id, node]));

  const timelineRangeMs = Math.max(1, effectiveDurationDays * dayMs);
  const normalizedTasks: WaveTask[] = tasks.map((task: any) => {
    const id = String(task._id || task.id);
    const hours = estimateTaskHours(task);
    const deadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;
    const groupKey = resolveGroupKey(task, wbsById, today.getTime(), timelineRangeMs);
    return { id, hours, deadlineTime, groupKey };
  });

  const waveCapacityHours = safeWaveLengthDays * dailyCapacityHours;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const findWaveIndexWithCapacity = (preferredIndex: number, taskHours: number): number => {
    for (let idx = preferredIndex; idx >= 0; idx--) {
      if (waveUsedHours[idx] + taskHours <= waveCapacityHours) return idx;
    }
    for (let idx = preferredIndex + 1; idx < waveCount; idx++) {
      if (waveUsedHours[idx] + taskHours <= waveCapacityHours) return idx;
    }
    return waveCount - 1;
  };

  const pushToWave = (waveIndex: number, task: WaveTask) => {
    waveUsedHours[waveIndex] += task.hours;
    const bucket = waveTaskIds.get(waveIndex) || [];
    bucket.push(new Types.ObjectId(task.id));
    waveTaskIds.set(waveIndex, bucket);
  };

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
    const targetIndex = findWaveIndexWithCapacity(desiredIndex, task.hours);
    pushToWave(targetIndex, task);
  }

  const tasksWithoutDeadline = normalizedTasks
    .filter((t) => t.deadlineTime == null)
    .sort((a, b) => b.hours - a.hours);

  const findLeastLoadedWave = (taskHours: number): number => {
    let bestIdx = 0;
    let bestUsed = Number.POSITIVE_INFINITY;
    for (let idx = 0; idx < waveCount; idx++) {
      const score = waveUsedHours[idx];
      if (score < bestUsed) {
        bestUsed = score;
        bestIdx = idx;
      }
    }
    return bestIdx;
  };

  for (const task of tasksWithoutDeadline) {
    const preferredIndex = findLeastLoadedWave(task.hours);
    const targetIndex = findWaveIndexWithCapacity(preferredIndex, task.hours);
    pushToWave(targetIndex, task);
  }

  const waves: any[] = [];
  const currentDeadline = adjustedDeadline || deadline;

  for (let i = 1; i <= waveCount; i++) {
    const waveStartDate = new Date(today.getTime() + (i - 1) * waveLengthMs);
    const nominalEnd = new Date(waveStartDate.getTime() + waveLengthMs);
    const hardEnd = currentDeadline;
    const waveEndDate = nominalEnd > hardEnd ? hardEnd : nominalEnd;
    const taskIds = waveTaskIds.get(i - 1) || [];

    waves.push({
      waveNumber: i,
      startDate: waveStartDate,
      endDate: waveEndDate,
      status: 'planned',
      taskIds,
      description: `Wave ${i}`,
    });
  }

  return {
    adjustedDeadline,
    waves,
  };
}
