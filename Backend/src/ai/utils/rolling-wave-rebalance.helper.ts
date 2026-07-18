import { Logger } from '@nestjs/common';
import { AIPlan } from '../../projects/interfaces/rolling-wave.interface';
import {
  normalizeWavePlanShape,
  redistributeTasksAcrossWaves,
} from '../../projects/services/strategy/utils/rolling-wave-helpers.util';

export function rebalanceWaveDistribution(params: {
  aiPlan: AIPlan;
  allTaskIds: string[];
  minTasksPerWave: number;
  maxTasksPerWave: number;
  expectedWaveCount: number;
  totalDurationDays: number;
  logger: Logger;
}): AIPlan {
  const {
    aiPlan,
    allTaskIds,
    minTasksPerWave,
    maxTasksPerWave,
    expectedWaveCount,
    totalDurationDays,
    logger,
  } = params;

  logger.debug(`[REBALANCE] Iniciando rebalanceamento de distribuição...`);

  const normalizedPlan = normalizeWavePlanShape(aiPlan, expectedWaveCount, totalDurationDays);

  // Coletar todas as tarefas alocadas do plano
  const allocatedTasks = new Set<string>();
  let duplicateTaskCount = 0;
  for (const wave of normalizedPlan.waves) {
    for (const tid of wave.taskIds) {
      if (allocatedTasks.has(tid)) {
        duplicateTaskCount++;
        continue;
      }
      allocatedTasks.add(tid);
    }
  }

  // Encontrar tarefas não alocadas
  const unallocatedTasks = allTaskIds.filter((tid) => !allocatedTasks.has(tid));
  logger.debug(
    `[REBALANCE] Tarefas alocadas: ${allocatedTasks.size}, não alocadas: ${unallocatedTasks.length}, duplicadas ignoradas: ${duplicateTaskCount}`,
  );

  logger.debug(
    `[REBALANCE] Redistribuindo ${allTaskIds.length} tarefas em ${expectedWaveCount} ondas.`,
  );

  const redistributedPlan = redistributeTasksAcrossWaves(
    normalizedPlan,
    allTaskIds,
    expectedWaveCount,
    totalDurationDays,
    minTasksPerWave,
    maxTasksPerWave,
  );

  // Log Final
  logger.debug(`[REBALANCE] Distribuição final:`);
  for (const wave of redistributedPlan.waves) {
    logger.debug(`  Wave ${wave.waveNumber}: ${wave.taskIds.length} tasks`);
  }

  const finalCounts = redistributedPlan.waves.map((w) => w.taskIds.length);
  const finalOutOfRangeCount = finalCounts.filter(
    (cnt) => cnt < minTasksPerWave || cnt > maxTasksPerWave,
  ).length;
  if (finalOutOfRangeCount > 0) {
    logger.warn(
      `[REBALANCE] ${finalOutOfRangeCount} ondas ainda ficaram fora do range alvo ${minTasksPerWave}-${maxTasksPerWave}, embora todas as tarefas tenham sido redistribuídas.`,
    );
  }

  return redistributedPlan;
}
