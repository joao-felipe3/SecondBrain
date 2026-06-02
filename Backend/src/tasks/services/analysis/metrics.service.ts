import { Injectable } from '@nestjs/common';
import { CreateTaskDto } from '../../dto/create-task.dto';
import { TaskDocument } from '../../schemas/task.schema';

@Injectable()
export class TasksMetricsService {
  applyPertEstimates(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null) {
    const hasAnyPert =
      dto.pertOptimisticMinutes !== undefined ||
      dto.pertMostLikelyMinutes !== undefined ||
      dto.pertPessimisticMinutes !== undefined;

    const baseMinutes =
      dto.pertMostLikelyMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      fallbackTask?.pertMostLikelyMinutes ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined);

    if (!hasAnyPert && baseMinutes === undefined) return;

    const optimistic = Math.max(5, Math.round(dto.pertOptimisticMinutes ?? (baseMinutes ?? 0) * 0.75));
    const mostLikely = Math.max(
      optimistic,
      Math.round(dto.pertMostLikelyMinutes ?? baseMinutes ?? optimistic),
    );
    const pessimistic = Math.max(
      mostLikely,
      Math.round(dto.pertPessimisticMinutes ?? (baseMinutes ?? mostLikely) * 1.5),
    );
    const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
    const variance = Math.pow((pessimistic - optimistic) / 6, 2);

    dto.pertOptimisticMinutes = optimistic;
    dto.pertMostLikelyMinutes = mostLikely;
    dto.pertPessimisticMinutes = pessimistic;
    dto.pertExpectedMinutes = Math.round(expected);
    dto.pertVariance = Number(variance.toFixed(2));
  }

  applyRtmRisk(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null) {
    const requirementIds = dto.requirementIds ?? fallbackTask?.requirementIds ?? [];
    const journeyItemIds =
      dto.journeyItemIds ?? ((fallbackTask as any)?.journeyItemIds as string[] | undefined) ?? [];
    const hasWbsLink = Boolean(
      dto.parentWbsNodeId || fallbackTask?.parentWbsNodeId || dto.wbsPath || fallbackTask?.wbsPath,
    );

    if (requirementIds.length > 0 || journeyItemIds.length > 0 || hasWbsLink) {
      dto.rtmRisk = false;
      dto.rtmRiskReason = undefined;
      return;
    }

    dto.rtmRisk = true;
    dto.rtmRiskReason =
      'Ação sem vínculo com item da jornada pessoal (objetivo/hábito/etapa/ação) ou WBS.';
  }

  applyEvmMetrics(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null) {
    const expectedMinutes =
      dto.pertExpectedMinutes ??
      fallbackTask?.pertExpectedMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined);

    if (!expectedMinutes) return;

    const pomodorosPlanned =
      dto.pomodorosPlanned ??
      fallbackTask?.pomodorosPlanned ??
      Math.max(1, Math.round(expectedMinutes / 25));
    const pomodorosDid = dto.pomodorosDid ?? fallbackTask?.pomodorosDid ?? 0;
    const progress = Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));

    const createdAt = fallbackTask?.createdAt ? new Date(fallbackTask.createdAt) : new Date();
    const deadline = dto.deadline
      ? new Date(dto.deadline)
      : fallbackTask?.deadline
        ? new Date(fallbackTask.deadline)
        : null;
    const elapsedRatio = deadline
      ? (() => {
          const total = deadline.getTime() - createdAt.getTime();
          if (total <= 0) return 1;
          return Math.max(0, Math.min(1, (Date.now() - createdAt.getTime()) / total));
        })()
      : 0;

    const plannedValue = expectedMinutes * elapsedRatio;
    const earnedValue = expectedMinutes * progress;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : progress > 0 ? 1 : 0;

    dto.evmProgress = Number(progress.toFixed(2));
    dto.evmPlannedValueMinutes = Math.round(plannedValue);
    dto.evmEarnedValueMinutes = Math.round(earnedValue);
    dto.evmSchedulePerformanceIndex = Number(spi.toFixed(2));
    dto.evmAlert = spi > 0 && spi < 0.9 ? 'SPI abaixo de 0.9 (risco de atraso)' : undefined;
  }

  calculateDeadline(createdAt: Date, expectedTimeMinutes: number): Date {
    const hoursNeeded = Math.ceil((expectedTimeMinutes * 1.1) / 60);
    const deadlineMs = createdAt.getTime() + hoursNeeded * 60 * 60 * 1000;
    return new Date(deadlineMs);
  }
}
