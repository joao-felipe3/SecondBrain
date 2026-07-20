import {
  WbsNodeFlat,
  AIPlanWave,
  AIPlan,
  DeterministicTaskInput,
  DeterministicWbsNodeInput,
} from '../../../interfaces/rolling-wave.interface';

type TaskMetricsInput = DeterministicTaskInput & {
  pomodorosDid?: number | null;
  createdAt?: Date | string;
  deadline?: Date | string | null;
  parentWbsNodeId?: string | null;
};

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function flattenWbsTree(
  nodes: DeterministicWbsNodeInput[],
  acc: WbsNodeFlat[] = [],
): WbsNodeFlat[] {
  for (const node of nodes || []) {
    acc.push({
      id: String(node._id || node.id),
      parentId: node.parentId ? String(node.parentId) : undefined,
      level: Number(node.level || 1),
      name: String(node.name || 'Pacote WBS'),
    });
    if (node.children?.length) {
      flattenWbsTree(node.children, acc);
    }
  }
  return acc;
}

export function estimateTaskHours(task: TaskMetricsInput): number {
  const expectedMinutes = task.pertExpectedMinutes;
  if (typeof expectedMinutes === 'number' && expectedMinutes > 0) {
    return expectedMinutes / 60;
  }

  const pomodorosPlanned = task.pomodorosPlanned;
  if (typeof pomodorosPlanned === 'number' && pomodorosPlanned > 0) {
    return pomodorosPlanned * 0.5;
  }
  return 1;
}

export function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function endOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildTaskScheduleMetrics(task: TaskMetricsInput, deadline: Date) {
  const expectedMinutesValue = task.pertExpectedMinutes;
  const pomodorosPlannedValue = task.pomodorosPlanned;
  const pomodorosDidValue = task.pomodorosDid;
  const createdAt = toDateOrNull(task.createdAt) || new Date();

  const expectedMinutes =
    typeof expectedMinutesValue === 'number' && expectedMinutesValue > 0
      ? expectedMinutesValue
      : typeof pomodorosPlannedValue === 'number' && pomodorosPlannedValue > 0
        ? pomodorosPlannedValue * 25
        : undefined;

  if (!expectedMinutes) {
    return {};
  }

  const pomodorosPlanned =
    typeof pomodorosPlannedValue === 'number' && pomodorosPlannedValue > 0
      ? pomodorosPlannedValue
      : Math.max(1, Math.round(expectedMinutes / 25));
  const pomodorosDid = typeof pomodorosDidValue === 'number' ? pomodorosDidValue : 0;
  const progress = Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));

  const totalDurationMs = deadline.getTime() - createdAt.getTime();
  const elapsedRatio =
    totalDurationMs <= 0
      ? 1
      : Math.max(0, Math.min(1, (Date.now() - createdAt.getTime()) / totalDurationMs));

  const plannedValue = expectedMinutes * elapsedRatio;
  const earnedValue = expectedMinutes * progress;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : progress > 0 ? 1 : 0;

  return {
    evmProgress: Number(progress.toFixed(2)),
    evmPlannedValueMinutes: Math.round(plannedValue),
    evmEarnedValueMinutes: Math.round(earnedValue),
    evmSchedulePerformanceIndex: Number(spi.toFixed(2)),
    evmAlert: spi > 0 && spi < 0.9 ? 'SPI abaixo de 0.9 (risco de atraso)' : undefined,
  };
}

export function resolveGroupKey(
  task: TaskMetricsInput,
  wbsById: Map<string, WbsNodeFlat>,
  startTime: number,
  totalRangeMs: number,
): string {
  const parentWbsNodeId = task.parentWbsNodeId ? String(task.parentWbsNodeId) : '';
  if (parentWbsNodeId && wbsById.has(parentWbsNodeId)) {
    const visited = new Set<string>();
    let cursor = wbsById.get(parentWbsNodeId);
    while (cursor?.parentId && wbsById.has(cursor.parentId) && !visited.has(cursor.parentId)) {
      visited.add(cursor.parentId);
      cursor = wbsById.get(cursor.parentId);
    }
    if (cursor?.name) {
      return `wbs:${cursor.name}`;
    }
  }

  const deadline = toDateOrNull(task.deadline);
  const deadlineTime = deadline?.getTime() || null;
  if (deadlineTime && totalRangeMs > 0) {
    const ratio = (deadlineTime - startTime) / totalRangeMs;
    if (ratio <= 0.33) return 'goal:Curto Prazo';
    if (ratio <= 0.66) return 'goal:Médio Prazo';
    return 'goal:Longo Prazo';
  }

  return 'goal:Execução Geral';
}

export function buildBalancedWaveDurations(totalDurationDays: number, waveCount: number): number[] {
  const safeWaveCount = Math.max(1, waveCount);
  const safeTotalDurationDays = Math.max(safeWaveCount, totalDurationDays);
  const baseDuration = Math.floor(safeTotalDurationDays / safeWaveCount);
  const remainder = safeTotalDurationDays % safeWaveCount;

  return Array.from({ length: safeWaveCount }, (_, index) => baseDuration + (index < remainder ? 1 : 0));
}

export function normalizeWavePlanShape(
  aiPlan: AIPlan,
  expectedWaveCount: number,
  totalDurationDays: number,
): AIPlan {
  const durations = buildBalancedWaveDurations(totalDurationDays, expectedWaveCount);
  const existingWaves = Array.isArray(aiPlan.waves) ? aiPlan.waves : [];

  const normalizedWaves: AIPlanWave[] = Array.from({ length: expectedWaveCount }, (_, index) => {
    const existingWave = existingWaves[index];

    return {
      waveNumber: index + 1,
      name: existingWave?.name?.trim() || `Wave ${index + 1}`,
      description: existingWave?.description?.trim() || `Execução balanceada da Wave ${index + 1}.`,
      durationDays: durations[index],
      focus: existingWave?.focus?.trim() || `Entrega incremental da Wave ${index + 1}`,
      wbsAllocation: existingWave?.wbsAllocation || {},
      taskIds: Array.isArray(existingWave?.taskIds) ? [...existingWave.taskIds] : [],
    };
  });

  return {
    ...aiPlan,
    waves: normalizedWaves,
  };
}

export function takeTaskForTransfer(
  waves: AIPlanWave[],
  donorIndex: number,
  recipientIndex: number,
): string | undefined {
  if (donorIndex < 0 || donorIndex >= waves.length || donorIndex === recipientIndex) {
    return undefined;
  }

  if (donorIndex < recipientIndex) {
    return waves[donorIndex].taskIds.pop();
  }

  return waves[donorIndex].taskIds.shift();
}

export function findBestDonorIndex(
  waves: AIPlanWave[],
  recipientIndex: number,
  minimumCountToKeep: number,
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSurplus = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < waves.length; index++) {
    if (index === recipientIndex) {
      continue;
    }

    const surplus = waves[index].taskIds.length - minimumCountToKeep;
    if (surplus <= 0) {
      continue;
    }

    const distance = Math.abs(index - recipientIndex);
    if (distance < bestDistance || (distance === bestDistance && surplus > bestSurplus)) {
      bestIndex = index;
      bestDistance = distance;
      bestSurplus = surplus;
    }
  }

  return bestIndex;
}

export function findBestRecipientIndex(
  waves: AIPlanWave[],
  donorIndex: number,
  maxTasksPerWave: number,
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let lowestCount = Number.POSITIVE_INFINITY;

  for (let index = 0; index < waves.length; index++) {
    if (index === donorIndex || waves[index].taskIds.length >= maxTasksPerWave) {
      continue;
    }

    const distance = Math.abs(index - donorIndex);
    const currentCount = waves[index].taskIds.length;
    if (currentCount < lowestCount || (currentCount === lowestCount && distance < bestDistance)) {
      bestIndex = index;
      bestDistance = distance;
      lowestCount = currentCount;
    }
  }

  return bestIndex;
}

function sanitizeAndDeduplicateWaveTasks(waves: AIPlanWave[], validTaskIdSet: Set<string>): Set<string> {
  const seenTaskIds = new Set<string>();
  for (const wave of waves) {
    const sanitizedTaskIds: string[] = [];
    for (const taskId of wave.taskIds || []) {
      if (!validTaskIdSet.has(taskId) || seenTaskIds.has(taskId)) {
        continue;
      }
      seenTaskIds.add(taskId);
      sanitizedTaskIds.push(taskId);
    }
    wave.taskIds = sanitizedTaskIds;
  }
  return seenTaskIds;
}

function distributeMissingTasks(
  waves: AIPlanWave[],
  allTaskIds: string[],
  seenTaskIds: Set<string>,
): void {
  const missingTaskIds: string[] = [];
  for (const taskId of allTaskIds) {
    if (!seenTaskIds.has(taskId)) {
      missingTaskIds.push(taskId);
      seenTaskIds.add(taskId);
    }
  }

  while (missingTaskIds.length > 0) {
    let targetIndex = 0;
    for (let index = 1; index < waves.length; index++) {
      if (waves[index].taskIds.length < waves[targetIndex].taskIds.length) {
        targetIndex = index;
      }
    }

    const taskId = missingTaskIds.shift();
    if (!taskId) {
      break;
    }
    waves[targetIndex].taskIds.push(taskId);
  }
}

function balanceWaveTasksUnderflow(
  waves: AIPlanWave[],
  minTasksPerWave: number,
  maxTasksPerWave: number,
): void {
  const recipientIndices = waves
    .map((wave, index) => ({ index, size: wave.taskIds.length }))
    .sort((left, right) => left.size - right.size || left.index - right.index)
    .map((item) => item.index);

  for (const recipientIndex of recipientIndices) {
    while (waves[recipientIndex].taskIds.length < minTasksPerWave) {
      let donorIndex = findBestDonorIndex(waves, recipientIndex, maxTasksPerWave);
      if (donorIndex < 0) {
        donorIndex = findBestDonorIndex(waves, recipientIndex, minTasksPerWave);
      }
      if (donorIndex < 0) {
        break;
      }

      const taskId = takeTaskForTransfer(waves, donorIndex, recipientIndex);
      if (!taskId) {
        break;
      }

      waves[recipientIndex].taskIds.push(taskId);
    }
  }
}

function balanceWaveTasksOverflow(waves: AIPlanWave[], maxTasksPerWave: number): void {
  for (let donorIndex = 0; donorIndex < waves.length; donorIndex++) {
    while (waves[donorIndex].taskIds.length > maxTasksPerWave) {
      const recipientIndex = findBestRecipientIndex(waves, donorIndex, maxTasksPerWave);
      if (recipientIndex < 0) {
        break;
      }

      const taskId = takeTaskForTransfer(waves, donorIndex, recipientIndex);
      if (!taskId) {
        break;
      }

      waves[recipientIndex].taskIds.push(taskId);
    }
  }
}

export function redistributeTasksAcrossWaves(
  aiPlan: AIPlan,
  allTaskIds: string[],
  expectedWaveCount: number,
  totalDurationDays: number,
  minTasksPerWave: number,
  maxTasksPerWave: number,
): AIPlan {
  const normalizedPlan = normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);
  const validTaskIdSet = new Set(allTaskIds);

  const seenTaskIds = sanitizeAndDeduplicateWaveTasks(normalizedPlan.waves, validTaskIdSet);

  distributeMissingTasks(normalizedPlan.waves, allTaskIds, seenTaskIds);

  balanceWaveTasksUnderflow(normalizedPlan.waves, minTasksPerWave, maxTasksPerWave);

  balanceWaveTasksOverflow(normalizedPlan.waves, maxTasksPerWave);

  return normalizedPlan;
}
