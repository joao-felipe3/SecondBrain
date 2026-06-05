import { Injectable } from '@nestjs/common';
import { CreateTaskDto } from '../../dto/create-task.dto';
import { TaskDocument } from '../../schemas/task.schema';

@Injectable()
export class TasksMetricsService {
  // ===========================================================================
  // 1. PERT Estimation Calculations & Application
  // ===========================================================================

  applyPertEstimates(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null): void {
    if (!this.hasPertInput(dto) && this.resolveBaseMinutes(dto, fallbackTask) === undefined) {
      return;
    }

    const baseMinutes = this.resolveBaseMinutes(dto, fallbackTask) ?? 0;
    const { optimistic, mostLikely, pessimistic } = this.calculatePertBounds(dto, baseMinutes);
    const { expected, variance } = this.calculateExpectedAndVariance(
      optimistic,
      mostLikely,
      pessimistic,
    );

    dto.pertOptimisticMinutes = optimistic;
    dto.pertMostLikelyMinutes = mostLikely;
    dto.pertPessimisticMinutes = pessimistic;
    dto.pertExpectedMinutes = Math.round(expected);
    dto.pertVariance = Number(variance.toFixed(2));
  }

  private hasPertInput(dto: Partial<CreateTaskDto>): boolean {
    return (
      dto.pertOptimisticMinutes !== undefined ||
      dto.pertMostLikelyMinutes !== undefined ||
      dto.pertPessimisticMinutes !== undefined
    );
  }

  private resolveBaseMinutes(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ): number | undefined {
    return (
      dto.pertMostLikelyMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      fallbackTask?.pertMostLikelyMinutes ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined)
    );
  }

  private calculatePertBounds(
    dto: Partial<CreateTaskDto>,
    baseMinutes: number,
  ): { optimistic: number; mostLikely: number; pessimistic: number } {
    const optimistic = Math.max(5, Math.round(dto.pertOptimisticMinutes ?? baseMinutes * 0.75));
    const mostLikely = Math.max(
      optimistic,
      Math.round(dto.pertMostLikelyMinutes ?? baseMinutes ?? optimistic),
    );
    const pessimistic = Math.max(
      mostLikely,
      Math.round(dto.pertPessimisticMinutes ?? (baseMinutes ?? mostLikely) * 1.5),
    );

    return { optimistic, mostLikely, pessimistic };
  }

  private calculateExpectedAndVariance(
    optimistic: number,
    mostLikely: number,
    pessimistic: number,
  ): { expected: number; variance: number } {
    const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
    const variance = Math.pow((pessimistic - optimistic) / 6, 2);
    return { expected, variance };
  }

  // ===========================================================================
  // 2. RTM Risk Analysis
  // ===========================================================================

  applyRtmRisk(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null): void {
    if (this.hasTraceabilityLinks(dto, fallbackTask)) {
      dto.rtmRisk = false;
      dto.rtmRiskReason = undefined;
      return;
    }

    dto.rtmRisk = true;
    dto.rtmRiskReason =
      'Ação sem vínculo com item da jornada pessoal (objetivo/hábito/etapa/ação) ou WBS.';
  }

  private hasTraceabilityLinks(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ): boolean {
    const requirementIds = dto.requirementIds ?? fallbackTask?.requirementIds ?? [];
    const journeyItemIds = dto.journeyItemIds ?? fallbackTask?.journeyItemIds ?? [];
    const hasWbsLink = Boolean(
      dto.parentWbsNodeId || fallbackTask?.parentWbsNodeId || dto.wbsPath || fallbackTask?.wbsPath,
    );

    return requirementIds.length > 0 || journeyItemIds.length > 0 || hasWbsLink;
  }

  // ===========================================================================
  // 3. EVM Metrics Calculations & Application
  // ===========================================================================

  applyEvmMetrics(dto: Partial<CreateTaskDto>, fallbackTask?: TaskDocument | null): void {
    const expectedMinutes = this.resolveExpectedMinutes(dto, fallbackTask);
    if (!expectedMinutes) return;

    const progress = this.calculateProgress(dto, fallbackTask, expectedMinutes);
    const elapsedRatio = this.calculateElapsedRatio(dto, fallbackTask);

    const plannedValue = expectedMinutes * elapsedRatio;
    const earnedValue = expectedMinutes * progress;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : progress > 0 ? 1 : 0;

    dto.evmProgress = Number(progress.toFixed(2));
    dto.evmPlannedValueMinutes = Math.round(plannedValue);
    dto.evmEarnedValueMinutes = Math.round(earnedValue);
    dto.evmSchedulePerformanceIndex = Number(spi.toFixed(2));
    dto.evmAlert = spi > 0 && spi < 0.9 ? 'SPI abaixo de 0.9 (risco de atraso)' : undefined;
  }

  private resolveExpectedMinutes(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ): number | undefined {
    return (
      dto.pertExpectedMinutes ??
      fallbackTask?.pertExpectedMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined)
    );
  }

  private calculateProgress(
    dto: Partial<CreateTaskDto>,
    fallbackTask: TaskDocument | null | undefined,
    expectedMinutes: number,
  ): number {
    const pomodorosPlanned =
      dto.pomodorosPlanned ??
      fallbackTask?.pomodorosPlanned ??
      Math.max(1, Math.round(expectedMinutes / 25));
    const pomodorosDid = dto.pomodorosDid ?? fallbackTask?.pomodorosDid ?? 0;
    return Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));
  }

  private calculateElapsedRatio(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ): number {
    const createdAt = fallbackTask?.createdAt ? new Date(fallbackTask.createdAt) : new Date();
    const deadline = dto.deadline
      ? new Date(dto.deadline)
      : fallbackTask?.deadline
        ? new Date(fallbackTask.deadline)
        : null;

    if (!deadline) return 0;

    const total = deadline.getTime() - createdAt.getTime();
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (Date.now() - createdAt.getTime()) / total));
  }

  // ===========================================================================
  // 4. Date Calculations
  // ===========================================================================

  calculateDeadline(createdAt: Date, expectedTimeMinutes: number): Date {
    const hoursNeeded = Math.ceil((expectedTimeMinutes * 1.1) / 60);
    const deadlineMs = createdAt.getTime() + hoursNeeded * 60 * 60 * 1000;
    return new Date(deadlineMs);
  }
}
