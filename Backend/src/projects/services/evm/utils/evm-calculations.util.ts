import { ProjectProgress } from '../../../schemas/project-progress.schema';
import type {
  EVMPersonalMetrics,
  EstimateCompletionDateParamsDto,
  BuildPersonalMetricsParamsDto,
} from '../../../dto/evm.dto';

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoundedScore(value: number): number {
  const finiteValue = toFiniteNumber(value, 0);
  return Number(Math.max(0, Math.min(100, finiteValue)).toFixed(1));
}

export function toWeekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getScheduleRatioByDates(
  startDate: Date | null,
  endDate: Date | null,
  atDate: Date = new Date(),
): number | null {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = atDate.getTime() - start.getTime();
  const ratio = elapsedMs / totalMs;

  return Math.max(0, Math.min(1, ratio));
}

export function scopeEntriesByWindow(
  entries: ProjectProgress[],
  startDate: Date | null,
  endDate: Date | null,
): ProjectProgress[] {
  if (!startDate || !endDate) return entries;

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return entries.filter((entry) => {
    const current = new Date(entry.date).getTime();
    return current >= start && current <= end;
  });
}

export function estimateCompletionDate(dto: EstimateCompletionDateParamsDto): string | null {
  const { project, metrics, scopeStartDate, scopeEndDate } = dto;
  const baselineStart = scopeStartDate || (project?.startDate ? new Date(project.startDate) : null);
  const baselineEnd = scopeEndDate || (project?.deadline ? new Date(project.deadline) : null);
  if (!baselineStart) return null;

  const startDate = new Date(baselineStart);
  const now = new Date();

  if (metrics.completedHours <= 0) {
    return baselineEnd ? new Date(baselineEnd).toISOString() : null;
  }

  const elapsedMs = Math.max(1, now.getTime() - startDate.getTime());
  const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));
  const hoursPerDay = metrics.completedHours / elapsedDays;

  if (hoursPerDay <= 0) {
    return baselineEnd ? new Date(baselineEnd).toISOString() : null;
  }

  const remainingHours = Math.max(0, metrics.plannedHours - metrics.completedHours);
  const remainingDays = remainingHours / hoursPerDay;

  const estimateDate = new Date(now);
  estimateDate.setDate(estimateDate.getDate() + Math.ceil(remainingDays));

  return estimateDate.toISOString();
}

export function calculateEffortBalanceScore(coreMetrics: {
  completedHours: number;
  plannedHours: number;
}): number {
  const planned = Math.max(1, toFiniteNumber(coreMetrics.plannedHours, 1));
  const completed = toFiniteNumber(coreMetrics.completedHours, 0);
  const delta = Math.abs(completed - planned);
  const ratio = delta / planned;

  return toBoundedScore(100 - ratio * 100);
}

export function calculateConsistencyScore(entries: ProjectProgress[]): number {
  if (entries.length <= 1) return 100;

  const weeklyMap = new Map<string, number>();

  for (const entry of entries) {
    const date = new Date(entry.date);
    const weekKey = toWeekKey(date);
    const current = weeklyMap.get(weekKey) || 0;
    weeklyMap.set(weekKey, current + (entry.completedHours || 0));
  }

  const weeklyHours = Array.from(weeklyMap.values());
  if (weeklyHours.length <= 1) return 100;

  const avg = weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length;
  if (avg <= 0) return 0;

  const variance = weeklyHours.reduce((sum, value) => sum + (value - avg) ** 2, 0) / weeklyHours.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = stdDev / avg;

  return toBoundedScore(100 - coefficient * 60);
}

export function calculateCompletionTrend(
  entries: ProjectProgress[],
): 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente' {
  if (entries.length < 4) return 'insuficiente';

  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const splitIndex = Math.floor(sorted.length / 2);

  const firstHalf = sorted.slice(0, splitIndex);
  const secondHalf = sorted.slice(splitIndex);

  const firstAvg =
    firstHalf.reduce((sum, entry) => sum + (entry.completedHours || 0), 0) /
    Math.max(1, firstHalf.length);
  const secondAvg =
    secondHalf.reduce((sum, entry) => sum + (entry.completedHours || 0), 0) /
    Math.max(1, secondHalf.length);

  if (firstAvg <= 0 && secondAvg <= 0) return 'insuficiente';

  const deltaRatio = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 1;

  if (deltaRatio > 0.1) return 'acelerando';
  if (deltaRatio < -0.1) return 'desacelerando';
  return 'estavel';
}

export function buildActionHint(input: {
  spi: number;
  consistencyScore: number;
  effortBalanceScore: number;
  planAdherence: number;
  completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente';
}): string {
  if (input.effortBalanceScore < 55) {
    return 'Seu esforco real esta desequilibrado com o plano. Reestime carga da semana antes de adicionar novas tarefas.';
  }

  if (input.consistencyScore < 55) {
    return 'Padronize uma meta minima semanal de horas para recuperar consistencia.';
  }

  if (input.completionTrend === 'desacelerando') {
    return 'Seu ritmo esta caindo: reduza escopo da semana e priorize a proxima etapa critica.';
  }

  if (input.spi < 0.95) {
    return 'Voce esta abaixo do ritmo planejado: revise o plano da semana e ajuste prazos intermediarios.';
  }

  if (input.planAdherence < 90) {
    return 'Seu ritmo oscila em relacao ao plano. Reforce checkpoints curtos para ganhar previsibilidade.';
  }

  return 'Bom progresso: mantenha a cadencia atual e reavalie o plano no fechamento da semana.';
}

export function buildPersonalMetrics(dto: BuildPersonalMetricsParamsDto): EVMPersonalMetrics {
  const { entries, spi, coreMetrics } = dto;
  const consistencyScore = calculateConsistencyScore(entries);
  const planAdherence =
    coreMetrics.pv > 0 ? toBoundedScore((coreMetrics.ev / coreMetrics.pv) * 100) : 100;
  const effortBalanceScore = calculateEffortBalanceScore(coreMetrics);

  const completionTrend = calculateCompletionTrend(entries);
  const completionRatio = Math.max(
    0,
    Math.min(1, coreMetrics.completedHours / Math.max(1, coreMetrics.plannedHours)),
  );

  const perceivedValueScore = toBoundedScore(
    completionRatio * 100 * 0.35 +
      consistencyScore * 0.25 +
      planAdherence * 0.25 +
      effortBalanceScore * 0.15,
  );

  const actionHint = buildActionHint({
    spi,
    consistencyScore,
    effortBalanceScore,
    planAdherence,
    completionTrend,
  });

  return {
    consistencyScore,
    effortBalanceScore,
    planAdherence,
    completionTrend,
    perceivedValueScore,
    actionHint,
  };
}
