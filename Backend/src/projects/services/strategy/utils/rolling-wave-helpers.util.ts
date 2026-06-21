import { WbsNodeFlat, AIPlanWave, AIPlan } from '../../../interfaces/rolling-wave.interface';

export function flattenWbsTree(nodes: any[], acc: WbsNodeFlat[] = []): WbsNodeFlat[] {
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

export function estimateTaskHours(task: any): number {
  if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
    return task.pertExpectedMinutes / 60;
  }
  if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
    return task.pomodorosPlanned * 0.5;
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

export function buildTaskScheduleMetrics(task: any, deadline: Date) {
  const expectedMinutes =
    typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0
      ? task.pertExpectedMinutes
      : typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0
        ? task.pomodorosPlanned * 25
        : undefined;

  if (!expectedMinutes) {
    return {};
  }

  const pomodorosPlanned =
    typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0
      ? task.pomodorosPlanned
      : Math.max(1, Math.round(expectedMinutes / 25));
  const pomodorosDid = typeof task?.pomodorosDid === 'number' ? task.pomodorosDid : 0;
  const progress = Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));

  const createdAt = task?.createdAt ? new Date(task.createdAt) : new Date();
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
  task: any,
  wbsById: Map<string, WbsNodeFlat>,
  startTime: number,
  totalRangeMs: number,
): string {
  const parentWbsNodeId = task?.parentWbsNodeId ? String(task.parentWbsNodeId) : '';
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

  const deadline = task?.deadline ? new Date(task.deadline) : null;
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

  return Array.from(
    { length: safeWaveCount },
    (_, index) => baseDuration + (index < remainder ? 1 : 0),
  );
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
  const seenTaskIds = new Set<string>();

  for (const wave of normalizedPlan.waves) {
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

  const missingTaskIds: string[] = [];
  for (const taskId of allTaskIds) {
    if (!seenTaskIds.has(taskId)) {
      missingTaskIds.push(taskId);
      seenTaskIds.add(taskId);
    }
  }

  while (missingTaskIds.length > 0) {
    let targetIndex = 0;
    for (let index = 1; index < normalizedPlan.waves.length; index++) {
      if (
        normalizedPlan.waves[index].taskIds.length < normalizedPlan.waves[targetIndex].taskIds.length
      ) {
        targetIndex = index;
      }
    }

    const taskId = missingTaskIds.shift();
    if (!taskId) {
      break;
    }
    normalizedPlan.waves[targetIndex].taskIds.push(taskId);
  }

  const recipientIndices = normalizedPlan.waves
    .map((wave, index) => ({ index, size: wave.taskIds.length }))
    .sort((left, right) => left.size - right.size || left.index - right.index)
    .map((item) => item.index);

  for (const recipientIndex of recipientIndices) {
    while (normalizedPlan.waves[recipientIndex].taskIds.length < minTasksPerWave) {
      let donorIndex = findBestDonorIndex(normalizedPlan.waves, recipientIndex, maxTasksPerWave);
      if (donorIndex < 0) {
        donorIndex = findBestDonorIndex(normalizedPlan.waves, recipientIndex, minTasksPerWave);
      }
      if (donorIndex < 0) {
        break;
      }

      const taskId = takeTaskForTransfer(normalizedPlan.waves, donorIndex, recipientIndex);
      if (!taskId) {
        break;
      }

      normalizedPlan.waves[recipientIndex].taskIds.push(taskId);
    }
  }

  for (let donorIndex = 0; donorIndex < normalizedPlan.waves.length; donorIndex++) {
    while (normalizedPlan.waves[donorIndex].taskIds.length > maxTasksPerWave) {
      const recipientIndex = findBestRecipientIndex(
        normalizedPlan.waves,
        donorIndex,
        maxTasksPerWave,
      );
      if (recipientIndex < 0) {
        break;
      }

      const taskId = takeTaskForTransfer(normalizedPlan.waves, donorIndex, recipientIndex);
      if (!taskId) {
        break;
      }

      normalizedPlan.waves[recipientIndex].taskIds.push(taskId);
    }
  }

  return normalizedPlan;
}

export function sanitizeJSON(jsonString: string): string {
  try {
    let result = jsonString;

    const chars: string[] = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < result.length; i++) {
      const char = result[i];

      if (escapeNext) {
        chars.push(char);
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        chars.push(char);
        escapeNext = true;
        continue;
      }

      if (char === '"' && (i === 0 || result[i - 1] !== '\\')) {
        inString = !inString;
        chars.push(char);
        continue;
      }

      if (inString && (char === '\n' || char === '\r')) {
        chars.push(' ');
        continue;
      }

      chars.push(char);
    }

    result = chars.join('');
    result = result.replace(/,\s*}/g, '}');
    result = result.replace(/,\s*]/g, ']');

    result = result.replace(/"([^"]*?)(['"])([^"]*?)"/g, (match, prefix, quote, suffix) => {
      if (quote === "'") {
        return match;
      }
      return match;
    });

    return result;
  } catch (e) {
    return jsonString;
  }
}

export function extractAndValidateJSON<T extends Record<string, any>>(
  responseText: string,
  requiredFields: string[],
  logger?: { warn: (msg: string) => void },
): T | null {
  try {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^[\s\n]*```/gm, '')
      .replace(/```[\s\n]*$/gm, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      logger?.warn(`[JSON_EXTRACT] Nenhum JSON encontrado na resposta`);
      return null;
    }

    let jsonString = cleaned.substring(jsonStart, jsonEnd + 1);

    if (!jsonString.endsWith('}')) {
      logger?.warn(
        `[JSON_INCOMPLETE] JSON não termina com "}" - truncado?\nEnd: ...${jsonString.substring(Math.max(0, jsonString.length - 100))}`,
      );
      return null;
    }

    jsonString = sanitizeJSON(jsonString);

    const parsedAny: any = JSON.parse(jsonString);

    for (const field of requiredFields) {
      if (!(field in parsedAny)) {
        logger?.warn(`[JSON_MISSING_FIELD] Campo obrigatório ausente: ${field}`);
        return null;
      }
    }

    return parsedAny as T;
  } catch (e: any) {
    logger?.warn(`[JSON_PARSE_ERROR] ${e.message}\nResponse: ${responseText.substring(0, 400)}`);
    return null;
  }
}
