import { Types } from 'mongoose';
import { DeterministicTaskInput } from '../../../interfaces/rolling-wave.interface';

export type TaskMetricsInput = DeterministicTaskInput & {
  pomodorosDid?: number | null;
  createdAt?: Date | string;
  deadline?: Date | string | null;
  parentWbsNodeId?: string | Types.ObjectId | null;
};

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
