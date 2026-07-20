import { Types } from 'mongoose';
import { AnyBulkWriteOperation } from 'mongoose';
import {
  ReplanTaskDeadlinesResult,
  ReplanCalculationResult,
  WaveDates,
  PendingTasksResult,
  ReplanTaskInput,
  CalculateReplannedDeadlinesDto,
  CalculateEffectiveWaveDatesOptions,
  GenerateBulkOpsForPendingTasksOptions,
  BuildTaskUpdateOpOptions,
  ProcessWaveReplanOptions,
  WaveReplanResult,
  WaveReplanSummary,
  BuildWaveSummaryOptions,
} from '../../../interfaces/rolling-wave.interface';
import { TaskDocument } from '../../../../tasks/schemas/task.schema';
import {
  startOfDay,
  endOfDay,
  addDays,
  estimateTaskHours,
  buildTaskScheduleMetrics,
} from './rolling-wave-helpers.util';

function sortPendingTasks(tasks: ReplanTaskInput[]): ReplanTaskInput[] {
  return [...tasks].sort((left, right) => {
    const leftDeadline = left?.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
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
}

function calculateEffectiveWaveDates(options: CalculateEffectiveWaveDatesOptions): WaveDates {
  const { wave, index, anchorWaveIndex, cursor, dayMs } = options;
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

  return { effectiveStart, effectiveEnd };
}

function buildUpdateOperationForTask(
  options: BuildTaskUpdateOpOptions,
): AnyBulkWriteOperation<TaskDocument> | null {
  const { task, cumulativeHours, totalHours, availableDays, effectiveStart } = options;
  const dayOffset = Math.min(
    availableDays - 1,
    Math.max(0, Math.ceil((cumulativeHours / totalHours) * availableDays) - 1),
  );
  const nextDeadline = endOfDay(addDays(effectiveStart, dayOffset));
  const currentDeadlineTime = task?.deadline ? new Date(task.deadline).getTime() : null;

  if (currentDeadlineTime === nextDeadline.getTime()) {
    return null;
  }

  return {
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
  };
}

function generateBulkOpsForPendingTasks(
  options: GenerateBulkOpsForPendingTasksOptions,
): PendingTasksResult {
  const { pendingTasks, effectiveStart, effectiveEnd, dayMs } = options;
  const availableDays = Math.max(
    1,
    Math.ceil((startOfDay(effectiveEnd).getTime() - startOfDay(effectiveStart).getTime()) / dayMs) + 1,
  );
  const totalHours = pendingTasks.reduce(
    (sum, task) => sum + Math.max(0.25, estimateTaskHours(task)),
    0,
  );

  const bulkOps: AnyBulkWriteOperation<TaskDocument>[] = [];
  let cumulativeHours = 0;
  let waveUpdatedCount = 0;

  for (const task of pendingTasks) {
    cumulativeHours += Math.max(0.25, estimateTaskHours(task));

    const op = buildUpdateOperationForTask({
      task,
      cumulativeHours,
      totalHours,
      availableDays,
      effectiveStart,
    });

    if (op) {
      bulkOps.push(op);
      waveUpdatedCount++;
    }
  }

  return { waveUpdatedCount, bulkOps };
}

function categorizeWaveTasks(
  taskIds: Array<string | Types.ObjectId>,
  taskById: Map<string, ReplanTaskInput>,
) {
  const waveTasks = taskIds
    .map((taskId) => taskById.get(String(taskId)))
    .filter((task): task is ReplanTaskInput => !!task);

  const skippedConcludedTasks = waveTasks.filter((task) => !!task.isConcluded).length;
  const pendingTasks = sortPendingTasks(waveTasks.filter((task) => !task.isConcluded));

  return { skippedConcludedTasks, pendingTasks };
}

function buildWaveSummary(options: BuildWaveSummaryOptions): WaveReplanSummary {
  const { waveNumber, updatedTasks, skippedConcludedTasks, startDate, endDate } = options;
  return {
    waveNumber,
    updatedTasks,
    skippedConcludedTasks,
    effectiveStartDate: startDate ? startDate.toISOString() : null,
    effectiveEndDate: endDate ? endDate.toISOString() : null,
  };
}

function processSingleWaveReplan(options: ProcessWaveReplanOptions): WaveReplanResult {
  const { wave, taskById, anchorWaveIndex, index, cursor, dayMs } = options;
  const { skippedConcludedTasks, pendingTasks } = categorizeWaveTasks(wave.taskIds || [], taskById);

  if (pendingTasks.length === 0) {
    return {
      waveUpdatedCount: 0,
      skippedConcludedTasks,
      bulkOps: [],
      summary: buildWaveSummary({
        waveNumber: wave.waveNumber,
        updatedTasks: 0,
        skippedConcludedTasks,
        startDate: null,
        endDate: null,
      }),
      nextCursor: cursor,
    };
  }

  const { effectiveStart, effectiveEnd } = calculateEffectiveWaveDates({
    wave,
    index,
    anchorWaveIndex,
    cursor,
    dayMs,
  });

  const { waveUpdatedCount, bulkOps } = generateBulkOpsForPendingTasks({
    pendingTasks,
    effectiveStart,
    effectiveEnd,
    dayMs,
  });

  return {
    waveUpdatedCount,
    skippedConcludedTasks,
    bulkOps,
    summary: buildWaveSummary({
      waveNumber: wave.waveNumber,
      updatedTasks: waveUpdatedCount,
      skippedConcludedTasks,
      startDate: effectiveStart,
      endDate: effectiveEnd,
    }),
    nextCursor: startOfDay(addDays(effectiveEnd, 1)),
  };
}

export function calculateReplannedDeadlines(
  options: CalculateReplannedDeadlinesDto,
): ReplanCalculationResult {
  const { waves, tasks, now } = options;
  const taskById = new Map(tasks.map((task) => [String(task._id), task]));
  const activeWaveIndex = waves.findIndex((wave) => wave.status === 'active');
  const firstPlannedWaveIndex = waves.findIndex((wave) => wave.status === 'planned');
  const anchorWaveIndex =
    activeWaveIndex >= 0 ? activeWaveIndex : firstPlannedWaveIndex >= 0 ? firstPlannedWaveIndex : 0;
  const dayMs = 24 * 60 * 60 * 1000;

  let cursor = startOfDay(now);
  let updatedCount = 0;
  let skippedConcludedCount = 0;
  const bulkOps: AnyBulkWriteOperation<TaskDocument>[] = [];
  const summaries: ReplanTaskDeadlinesResult['summaries'] = [];

  for (let index = 0; index < waves.length; index++) {
    const wave = waves[index];
    const result: WaveReplanResult = processSingleWaveReplan({
      wave,
      taskById,
      anchorWaveIndex,
      index,
      cursor,
      dayMs,
    });

    for (const operation of result.bulkOps) {
      bulkOps.push(operation);
    }
    updatedCount += result.waveUpdatedCount;
    skippedConcludedCount += result.skippedConcludedTasks;
    summaries.push(result.summary);
    cursor = result.nextCursor;
  }

  return {
    updatedCount,
    skippedConcludedCount,
    bulkOps,
    summaries,
  };
}
