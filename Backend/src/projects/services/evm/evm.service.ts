import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectProgress, ProjectProgressDocument } from '../../schemas/project-progress.schema';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { ProjectDocument } from '../../schemas/project.schema';
import type {
  EVMCurve,
  EVMForecast,
  EVMDashboardManualVisibility,
  EVMDashboardPreferences,
  EVMDashboardPreferencesInput,
  EVMMetricRelevance,
  EVMPersonalMetrics,
  EVMSummary,
} from '../../dto/evm.dto';

@Injectable()
export class EVMService {
  private readonly defaultManualVisibility: EVMDashboardManualVisibility = {
    spi: true,
    plannedVsEarned: true,
    completedHours: true,
    consistency: true,
    planAdherence: true,
    trend: true,
    perceivedProgress: true,
    remainingHours: true,
  };

  constructor(
    @InjectModel(ProjectProgress.name)
    private readonly projectProgressModel: Model<ProjectProgressDocument>,
    @InjectModel(ProjectWave.name)
    private readonly projectWaveModel: Model<ProjectWaveDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  private toFiniteNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private assertValidObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} invalido`);
    }
  }

  async getDashboardPreferences(projectId: string): Promise<EVMDashboardPreferences> {
    this.assertValidObjectId(projectId, 'projectId');

    const project = await this.projectModel
      .findById(projectId)
      .select({ dashboardMetricPreferences: 1 })
      .lean()
      .exec();

    return this.normalizeDashboardPreferences((project as any)?.dashboardMetricPreferences);
  }

  async saveDashboardPreferences(
    projectId: string,
    input: EVMDashboardPreferencesInput | undefined,
  ): Promise<EVMDashboardPreferences> {
    this.assertValidObjectId(projectId, 'projectId');

    const current = await this.getDashboardPreferences(projectId);
    const normalizedInput = this.normalizeDashboardPreferences(input);

    const merged: EVMDashboardPreferences = {
      mode: normalizedInput.mode || current.mode,
      manualVisibility: {
        ...current.manualVisibility,
        ...normalizedInput.manualVisibility,
      },
    };

    await this.projectModel
      .findByIdAndUpdate(projectId, { $set: { dashboardMetricPreferences: merged } }, { new: true })
      .exec();

    return merged;
  }

  async recordProgress(
    projectId: string,
    completedHours: number,
    plannedValue: number,
    date?: string,
    metadata?: {
      source?: 'manual' | 'pomodoro' | 'completion';
      taskId?: string;
    },
  ): Promise<ProjectProgress> {
    this.assertValidObjectId(projectId, 'projectId');
    if (metadata?.taskId) {
      this.assertValidObjectId(metadata.taskId, 'taskId');
    }

    return this.projectProgressModel.create({
      projectId: new Types.ObjectId(projectId),
      date: date ? new Date(date) : new Date(),
      completedHours,
      plannedValue,
      source: metadata?.source || 'manual',
      taskId: metadata?.taskId ? new Types.ObjectId(metadata.taskId) : undefined,
    });
  }

  async getProgressEntries(projectId: string): Promise<ProjectProgress[]> {
    this.assertValidObjectId(projectId, 'projectId');

    return this.projectProgressModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ date: 1, createdAt: 1 })
      .exec();
  }

  async deleteProgressEntry(projectId: string, entryId: string): Promise<boolean> {
    this.assertValidObjectId(projectId, 'projectId');
    this.assertValidObjectId(entryId, 'entryId');

    const result = await this.projectProgressModel
      .deleteOne({
        _id: new Types.ObjectId(entryId),
        projectId: new Types.ObjectId(projectId),
      })
      .exec();

    return result.deletedCount > 0;
  }

  async calculateSPI(projectId: string): Promise<number> {
    this.assertValidObjectId(projectId, 'projectId');

    const metrics = await this.getCoreMetrics(projectId);
    if (metrics.pv <= 0) return 1;
    return Number((metrics.ev / metrics.pv).toFixed(4));
  }

  async forecastCompletion(projectId: string): Promise<EVMForecast> {
    this.assertValidObjectId(projectId, 'projectId');

    const [entries, metrics, project, activeWaveContext] = await Promise.all([
      this.getProgressEntries(projectId),
      this.getCoreMetrics(projectId),
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ]);

    const completionRate = metrics.bac > 0 ? Math.max(0, Math.min(1, metrics.ev / metrics.bac)) : 0;
    const remainingHours = Math.max(0, metrics.plannedHours - metrics.completedHours);
    const variance = metrics.ev - metrics.pv;

    const scopedEntries = this.scopeEntriesByWindow(
      entries,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );
    const estimatedDate = this.estimateCompletionDate(
      scopedEntries,
      project,
      metrics,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );

    return {
      estimatedDate,
      variance: Number(variance.toFixed(2)),
      remainingHours: Number(remainingHours.toFixed(2)),
      completionRate: Number((completionRate * 100).toFixed(2)),
      bac: Number(metrics.bac.toFixed(2)),
      ev: Number(metrics.ev.toFixed(2)),
      pv: Number(metrics.pv.toFixed(2)),
    };
  }

  async getEVMCurve(projectId: string): Promise<EVMCurve> {
    this.assertValidObjectId(projectId, 'projectId');

    const entries = await this.getProgressEntries(projectId);
    if (entries.length === 0) {
      return { plannedValue: [], actualValue: [], dates: [] };
    }

    const [project, activeWaveContext] = await Promise.all([
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ]);

    const scopedEntries = this.scopeEntriesByWindow(
      entries,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );
    if (scopedEntries.length === 0) {
      return { plannedValue: [], actualValue: [], dates: [] };
    }

    const totalPV = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0);
    const plannedHours = Math.max(1, activeWaveContext.plannedHours);
    const bac = Math.max(1, totalPV, plannedHours);

    let cumulativeHours = 0;
    const plannedValue: number[] = [];
    const actualValue: number[] = [];
    const dates: string[] = [];

    for (const entry of scopedEntries) {
      cumulativeHours += entry.completedHours || 0;

      const progressRatio = Math.max(0, Math.min(1, cumulativeHours / plannedHours));
      const cumulativeEV = bac * progressRatio;
      const scheduleRatio = this.getScheduleRatioByDates(
        activeWaveContext.startDate,
        activeWaveContext.endDate,
        new Date(entry.date),
      );
      const cumulativePV =
        scheduleRatio !== null
          ? bac * scheduleRatio
          : plannedValue.length > 0
            ? plannedValue[plannedValue.length - 1] + (entry.plannedValue || 0)
            : entry.plannedValue || 0;

      plannedValue.push(Number(cumulativePV.toFixed(2)));
      actualValue.push(Number(cumulativeEV.toFixed(2)));
      dates.push(new Date(entry.date).toISOString().slice(0, 10));
    }

    return {
      plannedValue,
      actualValue,
      dates,
    };
  }

  async getEVMSummary(projectId: string): Promise<EVMSummary> {
    this.assertValidObjectId(projectId, 'projectId');

    const [spi, forecast, curve, entries, coreMetrics, dashboardPreferences, milestoneProgress] =
      await Promise.all([
        this.calculateSPI(projectId),
        this.forecastCompletion(projectId),
        this.getEVMCurve(projectId),
        this.getProgressEntries(projectId),
        this.getCoreMetrics(projectId),
        this.getDashboardPreferences(projectId),
        this.getMilestoneProgress(projectId),
      ]);

    const completedHours = coreMetrics.completedHours;
    const personalMetrics = this.buildPersonalMetrics(entries, spi, coreMetrics);
    const metricRelevance = this.resolveMetricRelevance({
      entriesCount: entries.length,
      spi,
      forecast,
      personalMetrics,
      dashboardPreferences,
    });

    return {
      spi,
      forecast,
      curve,
      totals: {
        completedHours: Number(completedHours.toFixed(2)),
        entriesCount: entries.length,
      },
      personalMetrics,
      milestoneProgress,
      dashboardPreferences,
      metricRelevance,
    };
  }

  async getPersonalSummary(projectId: string): Promise<{
    consistencyScore: number;
    effortBalanceScore: number;
    planAdherence: number;
    completionTrend: EVMPersonalMetrics['completionTrend'];
    perceivedValueScore: number;
    actionHint: string;
    paceStatus: 'saudavel' | 'atencao' | 'critico';
    focusMessage: string;
  }> {
    this.assertValidObjectId(projectId, 'projectId');

    const summary = await this.getEVMSummary(projectId);
    const { personalMetrics, spi } = summary;

    let paceStatus: 'saudavel' | 'atencao' | 'critico' = 'saudavel';
    if (personalMetrics.consistencyScore < 50 || spi < 0.8) {
      paceStatus = 'critico';
    } else if (personalMetrics.consistencyScore < 70 || spi < 0.95) {
      paceStatus = 'atencao';
    }

    const focusMessage =
      paceStatus === 'critico'
        ? 'Reduza escopo da semana e ataque uma entrega critica por vez.'
        : paceStatus === 'atencao'
          ? 'Seu plano precisa de ajuste leve para manter previsibilidade.'
          : 'Ritmo saudavel: mantenha cadencia e revise no fechamento semanal.';

    return {
      ...personalMetrics,
      paceStatus,
      focusMessage,
    };
  }

  private normalizeDashboardPreferences(raw: any): EVMDashboardPreferences {
    const mode = raw?.mode === 'manual' ? 'manual' : 'auto';

    return {
      mode,
      manualVisibility: {
        ...this.defaultManualVisibility,
        ...(raw?.manualVisibility || {}),
      },
    };
  }

  private resolveMetricRelevance(input: {
    entriesCount: number;
    spi: number;
    forecast: EVMForecast;
    personalMetrics: EVMPersonalMetrics;
    dashboardPreferences: EVMDashboardPreferences;
  }): EVMMetricRelevance {
    const useManual = false;
    const manual = input.dashboardPreferences.manualVisibility;

    const fromManual = (
      key: keyof EVMDashboardManualVisibility,
      fallbackVisible: boolean,
      fallbackReason: string,
    ) => {
      if (!useManual) {
        return {
          visible: fallbackVisible,
          reason: fallbackReason,
        };
      }

      return {
        visible: Boolean(manual[key]),
        reason: 'Visibilidade definida manualmente pelo usuario.',
      };
    };

    const spiDelay = input.spi < 1;
    const needsScheduleAttention = spiDelay || input.personalMetrics.planAdherence < 95;

    return {
      spi: fromManual('spi', true, 'SPI e a metrica principal de ritmo da entrega.'),
      plannedVsEarned: fromManual(
        'plannedVsEarned',
        input.entriesCount > 0 && needsScheduleAttention,
        needsScheduleAttention
          ? 'PV x EV ajuda a decidir ajuste de plano na semana atual.'
          : 'Projeto em ritmo saudavel; PV x EV tem baixa prioridade agora.',
      ),
      completedHours: fromManual(
        'completedHours',
        input.entriesCount > 0,
        input.entriesCount > 0
          ? 'Horas concluidas mostram esforco real aplicado.'
          : 'Sem registros de progresso suficientes para horas concluidas.',
      ),
      consistency: fromManual(
        'consistency',
        input.entriesCount >= 2,
        input.entriesCount >= 2
          ? 'Consistencia semanal ajuda a prever estabilidade de execucao.'
          : 'Consistencia requer pelo menos 2 registros de progresso.',
      ),
      planAdherence: fromManual(
        'planAdherence',
        input.entriesCount > 0,
        input.entriesCount > 0
          ? 'Aderencia mostra alinhamento com o plano atual.'
          : 'Aderencia requer registros com PV/EV.',
      ),
      trend: fromManual(
        'trend',
        input.entriesCount >= 4,
        input.entriesCount >= 4
          ? 'Tendencia de evolucao orienta decisao de manter ou ajustar escopo.'
          : 'Tendencia precisa de ao menos 4 registros para comparacao confiavel.',
      ),
      perceivedProgress: fromManual(
        'perceivedProgress',
        input.entriesCount >= 2,
        input.entriesCount >= 2
          ? 'Progresso percebido combina cadencia, aderencia e esforco efetivo.'
          : 'Progresso percebido fica mais util apos multiplos registros.',
      ),
      remainingHours: fromManual(
        'remainingHours',
        input.forecast.remainingHours > 0,
        input.forecast.remainingHours > 0
          ? 'Horas restantes mostram carga de trabalho pendente.'
          : 'Nao ha carga pendente estimada para este ciclo.',
      ),
    };
  }

  private async getCoreMetrics(projectId: string): Promise<{
    pv: number;
    ev: number;
    bac: number;
    completedHours: number;
    plannedHours: number;
  }> {
    const [entries, project, activeWaveContext] = await Promise.all([
      this.getProgressEntries(projectId),
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ]);

    const scopedEntries = this.scopeEntriesByWindow(
      entries,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );

    const pv = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0);
    const completedHours = scopedEntries.reduce((sum, entry) => sum + (entry.completedHours || 0), 0);

    const plannedHours = Math.max(1, this.toFiniteNumber(activeWaveContext.plannedHours, 1));
    const bac = Math.max(1, pv, plannedHours);
    const progressRatio = Math.max(0, Math.min(1, completedHours / plannedHours));
    const scheduleRatio = this.getScheduleRatioByDates(
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );
    const ev = bac * progressRatio;
    const effectivePV = scheduleRatio !== null ? bac * scheduleRatio : pv;

    return {
      pv: Number(effectivePV.toFixed(2)),
      ev,
      bac,
      completedHours,
      plannedHours,
    };
  }

  private estimateCompletionDate(
    entries: ProjectProgress[],
    project: ProjectDocument | null,
    metrics: { completedHours: number; plannedHours: number },
    scopeStartDate: Date | null,
    scopeEndDate: Date | null,
  ): string | null {
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

  private buildPersonalMetrics(
    entries: ProjectProgress[],
    spi: number,
    coreMetrics: {
      pv: number;
      ev: number;
      completedHours: number;
      plannedHours: number;
    },
  ): EVMPersonalMetrics {
    const consistencyScore = this.calculateConsistencyScore(entries);
    const planAdherence =
      coreMetrics.pv > 0 ? this.toBoundedScore((coreMetrics.ev / coreMetrics.pv) * 100) : 100;
    const effortBalanceScore = this.calculateEffortBalanceScore(coreMetrics);

    const completionTrend = this.calculateCompletionTrend(entries);
    const completionRatio = Math.max(
      0,
      Math.min(1, coreMetrics.completedHours / Math.max(1, coreMetrics.plannedHours)),
    );

    const perceivedValueScore = this.toBoundedScore(
      completionRatio * 100 * 0.35 +
        consistencyScore * 0.25 +
        planAdherence * 0.25 +
        effortBalanceScore * 0.15,
    );

    const actionHint = this.buildActionHint({
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

  private calculateEffortBalanceScore(coreMetrics: {
    completedHours: number;
    plannedHours: number;
  }): number {
    const planned = Math.max(1, this.toFiniteNumber(coreMetrics.plannedHours, 1));
    const completed = this.toFiniteNumber(coreMetrics.completedHours, 0);
    const delta = Math.abs(completed - planned);
    const ratio = delta / planned;

    return this.toBoundedScore(100 - ratio * 100);
  }

  private calculateConsistencyScore(entries: ProjectProgress[]): number {
    if (entries.length <= 1) return 100;

    const weeklyMap = new Map<string, number>();

    for (const entry of entries) {
      const date = new Date(entry.date);
      const weekKey = this.toWeekKey(date);
      const current = weeklyMap.get(weekKey) || 0;
      weeklyMap.set(weekKey, current + (entry.completedHours || 0));
    }

    const weeklyHours = Array.from(weeklyMap.values());
    if (weeklyHours.length <= 1) return 100;

    const avg = weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length;
    if (avg <= 0) return 0;

    const variance =
      weeklyHours.reduce((sum, value) => sum + (value - avg) ** 2, 0) / weeklyHours.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avg;

    return this.toBoundedScore(100 - coefficient * 60);
  }

  private calculateCompletionTrend(
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

  private buildActionHint(input: {
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

  private toWeekKey(date: Date): string {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  private toBoundedScore(value: number): number {
    const finiteValue = this.toFiniteNumber(value, 0);
    return Number(Math.max(0, Math.min(100, finiteValue)).toFixed(1));
  }

  private getScheduleRatioByDates(
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

  private scopeEntriesByWindow(
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

  private async getMilestoneProgress(projectId: string): Promise<{
    totalMilestones: number;
    completedMilestones: number;
    completionRate: number;
    activeMilestoneLabel: string | null;
  }> {
    const waves = await this.projectWaveModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ waveNumber: 1 })
      .exec();

    if (waves.length === 0) {
      return {
        totalMilestones: 0,
        completedMilestones: 0,
        completionRate: 0,
        activeMilestoneLabel: null,
      };
    }

    const completedMilestones = waves.filter((wave) => wave.status === 'completed').length;
    const activeWave = waves.find((wave) => wave.status === 'active') || null;

    return {
      totalMilestones: waves.length,
      completedMilestones,
      completionRate: this.toBoundedScore((completedMilestones / waves.length) * 100),
      activeMilestoneLabel: activeWave ? `Onda ${activeWave.waveNumber}` : null,
    };
  }

  private async getActiveWaveContext(projectId: string): Promise<{
    startDate: Date | null;
    endDate: Date | null;
    plannedHours: number;
  }> {
    const [project, waves] = await Promise.all([
      this.projectModel.findById(projectId).exec(),
      this.projectWaveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ]);

    const fallbackPlannedHours = Math.max(1, this.toFiniteNumber(project?.plannedHours, 1));
    if (waves.length === 0) {
      return {
        startDate: project?.startDate ? new Date(project.startDate) : null,
        endDate: project?.deadline ? new Date(project.deadline) : null,
        plannedHours: fallbackPlannedHours,
      };
    }

    const activeWave = waves.find((wave) => wave.status === 'active') || null;
    if (!activeWave) {
      return {
        startDate: project?.startDate ? new Date(project.startDate) : null,
        endDate: project?.deadline ? new Date(project.deadline) : null,
        plannedHours: fallbackPlannedHours,
      };
    }

    const totalWaveDurationMs = waves.reduce((sum, wave) => {
      const duration = new Date(wave.endDate).getTime() - new Date(wave.startDate).getTime();
      return sum + Math.max(0, this.toFiniteNumber(duration, 0));
    }, 0);

    const activeDurationRaw =
      new Date(activeWave.endDate).getTime() - new Date(activeWave.startDate).getTime();
    const activeWaveDurationMs = Math.max(0, this.toFiniteNumber(activeDurationRaw, 0));

    const plannedHours =
      totalWaveDurationMs > 0
        ? fallbackPlannedHours * (activeWaveDurationMs / totalWaveDurationMs)
        : fallbackPlannedHours / Math.max(1, waves.length);

    return {
      startDate: new Date(activeWave.startDate),
      endDate: new Date(activeWave.endDate),
      plannedHours: Math.max(1, plannedHours),
    };
  }
}
