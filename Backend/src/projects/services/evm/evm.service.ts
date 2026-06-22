import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { ProjectDocument } from '../../schemas/project.schema';
import type {
  EVMCurve,
  EVMForecast,
  EVMPersonalMetrics,
  EVMSummary,
} from '../../dto/evm.dto';
import {
  toFiniteNumber,
  toBoundedScore,
  getScheduleRatioByDates,
  scopeEntriesByWindow,
  estimateCompletionDate,
  buildPersonalMetrics,
  resolveMetricRelevance,
  buildEVMCurvePoints,
  calculateActiveWavePlannedHours,
} from './utils/evm-calculations.util';
import { EVMProgressService } from './evm-progress.service';

@Injectable()
export class EVMService {
  constructor(
    private readonly evmProgressService: EVMProgressService,
    @InjectModel(ProjectWave.name)
    private readonly projectWaveModel: Model<ProjectWaveDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
  ) { }

  private assertValidObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} invalido`);
    }
  }

  async calculateSPI(projectId: string): Promise<number> {
    this.assertValidObjectId(projectId, 'projectId');

    const metrics = await this.getCoreMetrics(projectId);
    if (metrics.pv <= 0) return 1;
    return Number((metrics.ev / metrics.pv).toFixed(4));
  }

  async forecastCompletion(projectId: string): Promise<EVMForecast> {
    this.assertValidObjectId(projectId, 'projectId');

    const [metrics, project, activeWaveContext] = await Promise.all([
      this.getCoreMetrics(projectId),
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ]);

    const completionRate = metrics.bac > 0 ? Math.max(0, Math.min(1, metrics.ev / metrics.bac)) : 0;
    const remainingHours = Math.max(0, metrics.plannedHours - metrics.completedHours);
    const variance = metrics.ev - metrics.pv;

    const estimatedDate = estimateCompletionDate(
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

    const entries = await this.evmProgressService.getProgressEntries(projectId);
    if (entries.length === 0) {
      return { plannedValue: [], actualValue: [], dates: [] };
    }

    const activeWaveContext = await this.getActiveWaveContext(projectId);

    const scopedEntries = scopeEntriesByWindow(
      entries,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );
    if (scopedEntries.length === 0) {
      return { plannedValue: [], actualValue: [], dates: [] };
    }

    return buildEVMCurvePoints(
      scopedEntries,
      activeWaveContext.plannedHours,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );
  }

  async getEVMSummary(projectId: string): Promise<EVMSummary> {
    this.assertValidObjectId(projectId, 'projectId');

    const [spi, forecast, curve, entries, coreMetrics, dashboardPreferences, milestoneProgress] =
      await Promise.all([
        this.calculateSPI(projectId),
        this.forecastCompletion(projectId),
        this.getEVMCurve(projectId),
        this.evmProgressService.getProgressEntries(projectId),
        this.getCoreMetrics(projectId),
        this.evmProgressService.getDashboardPreferences(projectId),
        this.getMilestoneProgress(projectId),
      ]);

    const completedHours = coreMetrics.completedHours;
    const personalMetrics = buildPersonalMetrics(entries, spi, coreMetrics);
    const metricRelevance = resolveMetricRelevance(
      {
        entriesCount: entries.length,
        spi,
        forecast,
        personalMetrics,
        dashboardPreferences,
      },
    );

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

  private async getCoreMetrics(projectId: string): Promise<{
    pv: number;
    ev: number;
    bac: number;
    completedHours: number;
    plannedHours: number;
  }> {
    const [entries, activeWaveContext] = await Promise.all([
      this.evmProgressService.getProgressEntries(projectId),
      this.getActiveWaveContext(projectId),
    ]);

    const scopedEntries = scopeEntriesByWindow(
      entries,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    );

    const pv = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0);
    const completedHours = scopedEntries.reduce((sum, entry) => sum + (entry.completedHours || 0), 0);

    const plannedHours = Math.max(1, toFiniteNumber(activeWaveContext.plannedHours, 1));
    const bac = Math.max(1, pv, plannedHours);
    const progressRatio = Math.max(0, Math.min(1, completedHours / plannedHours));
    const scheduleRatio = getScheduleRatioByDates(
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
      completionRate: toBoundedScore((completedMilestones / waves.length) * 100),
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

    const fallbackPlannedHours = Math.max(1, toFiniteNumber(project?.plannedHours, 1));
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

    const plannedHours = calculateActiveWavePlannedHours(fallbackPlannedHours, waves, activeWave);

    return {
      startDate: new Date(activeWave.startDate),
      endDate: new Date(activeWave.endDate),
      plannedHours,
    };
  }
}
