import { ReplanTaskDeadlinesResult } from '../../../interfaces/rolling-wave.interface';
import {
  startOfDay,
  endOfDay,
  addDays,
  estimateTaskHours,
  buildTaskScheduleMetrics,
} from './rolling-wave-helpers.util';

export interface ReplanCalculationResult {
  updatedCount: number;
  skippedConcludedCount: number;
  bulkOps: any[];
  summaries: ReplanTaskDeadlinesResult['summaries'];
}

/**
 * Calcula cronogramas ajustados para tarefas com base nas ondas do projeto
 */
export function calculateReplannedDeadlines(
  waves: any[],
  tasks: any[],
  now: Date,
): ReplanCalculationResult {
  const taskById = new Map(tasks.map((task: any) => [String(task._id), task]));
  const activeWaveIndex = waves.findIndex((wave) => wave.status === 'active');
  const firstPlannedWaveIndex = waves.findIndex((wave) => wave.status === 'planned');
  const anchorWaveIndex =
    activeWaveIndex >= 0 ? activeWaveIndex : firstPlannedWaveIndex >= 0 ? firstPlannedWaveIndex : 0;
  const dayMs = 24 * 60 * 60 * 1000;

  let cursor = startOfDay(now);
  let updatedCount = 0;
  let skippedConcludedCount = 0;
  const bulkOps: any[] = [];
  const summaries: ReplanTaskDeadlinesResult['summaries'] = [];

  for (let index = 0; index < waves.length; index++) {
    const wave = waves[index];
    const waveTasks = (wave.taskIds || [])
      .map((taskId: any) => taskById.get(String(taskId)))
      .filter(Boolean);

    const skippedConcludedTasks = waveTasks.filter((task) => Boolean(task?.isConcluded)).length;
    skippedConcludedCount += skippedConcludedTasks;

    const pendingTasks = waveTasks
      .filter((task) => !task?.isConcluded)
      .sort((left, right) => {
        const leftDeadline = left?.deadline
          ? new Date(left.deadline).getTime()
          : Number.POSITIVE_INFINITY;
        const rightDeadline = right?.deadline
          ? new Date(right.deadline).getTime()
          : Number.POSITIVE_INFINITY;
        if (leftDeadline !== rightDeadline) {
          return leftDeadline - rightDeadline;
        }

        const rightHours = estimateTaskHours(right);
        const leftHours = estimateTaskHours(left);
        if (rightHours !== leftHours) {
          return rightHours - leftHours;
        }

        const leftCreatedAt = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightCreatedAt = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
        return leftCreatedAt - rightCreatedAt;
      });

    if (pendingTasks.length === 0) {
      summaries.push({
        waveNumber: wave.waveNumber,
        updatedTasks: 0,
        skippedConcludedTasks,
        effectiveStartDate: null,
        effectiveEndDate: null,
      });
      continue;
    }

    const originalStart = startOfDay(new Date(wave.startDate));
    const originalEnd = endOfDay(new Date(wave.endDate));
    const originalDurationDays = Math.max(
      1,
      Math.ceil((startOfDay(originalEnd).getTime() - originalStart.getTime()) / dayMs) + 1,
    );

    const effectiveStart =
      index <= anchorWaveIndex
        ? startOfDay(cursor)
        : startOfDay(new Date(Math.max(cursor.getTime(), originalStart.getTime())));

    const effectiveEnd =
      originalEnd.getTime() >= effectiveStart.getTime()
        ? originalEnd
        : endOfDay(addDays(effectiveStart, Math.max(0, originalDurationDays - 1)));

    const availableDays = Math.max(
      1,
      Math.ceil(
        (startOfDay(effectiveEnd).getTime() - startOfDay(effectiveStart).getTime()) / dayMs,
      ) + 1,
    );
    const totalHours = pendingTasks.reduce(
      (sum, task) => sum + Math.max(0.25, estimateTaskHours(task)),
      0,
    );

    let cumulativeHours = 0;
    let waveUpdatedCount = 0;

    for (const task of pendingTasks) {
      cumulativeHours += Math.max(0.25, estimateTaskHours(task));

      const dayOffset = Math.min(
        availableDays - 1,
        Math.max(0, Math.ceil((cumulativeHours / totalHours) * availableDays) - 1),
      );
      const nextDeadline = endOfDay(addDays(effectiveStart, dayOffset));
      const currentDeadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;

      if (currentDeadlineTime === nextDeadline.getTime()) {
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: task._id },
          update: {
            $set: {
              deadline: nextDeadline,
              late: !task?.isConcluded && nextDeadline.getTime() < Date.now(),
              ...buildTaskScheduleMetrics(task, nextDeadline),
            },
          },
        },
      });
      updatedCount++;
      waveUpdatedCount++;
    }

    summaries.push({
      waveNumber: wave.waveNumber,
      updatedTasks: waveUpdatedCount,
      skippedConcludedTasks,
      effectiveStartDate: effectiveStart.toISOString(),
      effectiveEndDate: effectiveEnd.toISOString(),
    });

    cursor = startOfDay(addDays(effectiveEnd, 1));
  }

  return {
    updatedCount,
    skippedConcludedCount,
    bulkOps,
    summaries,
  };
}
