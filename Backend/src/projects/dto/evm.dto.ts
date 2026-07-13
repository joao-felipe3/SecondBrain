import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { ProjectDocument } from '../schemas/project.schema';
import { ProjectProgress } from '../schemas/project-progress.schema';
import { ProjectWave } from '../schemas/project-wave.schema';

export class RecordProjectProgressDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNumber()
  completedHours: number;

  @IsNumber()
  plannedValue: number;
}

export interface EVMForecast {
  estimatedDate: string | null;
  variance: number;
  remainingHours: number;
  completionRate: number;
  bac: number;
  ev: number;
  pv: number;
}

export interface EVMCurve {
  plannedValue: number[];
  actualValue: number[];
  dates: string[];
}

export interface EVMDashboardManualVisibility {
  spi: boolean;
  plannedVsEarned: boolean;
  completedHours: boolean;
  consistency: boolean;
  planAdherence: boolean;
  trend: boolean;
  perceivedProgress: boolean;
  remainingHours: boolean;
}

export interface EVMDashboardPreferences {
  mode: 'auto' | 'manual';
  manualVisibility: EVMDashboardManualVisibility;
}

export type EVMDashboardPreferencesInput = {
  mode?: EVMDashboardPreferences['mode'];
  manualVisibility?: Partial<EVMDashboardManualVisibility>;
};

export interface EVMMetricVisibility {
  visible: boolean;
  reason: string;
}

export interface EVMMetricRelevance {
  spi: EVMMetricVisibility;
  plannedVsEarned: EVMMetricVisibility;
  completedHours: EVMMetricVisibility;
  consistency: EVMMetricVisibility;
  planAdherence: EVMMetricVisibility;
  trend: EVMMetricVisibility;
  perceivedProgress: EVMMetricVisibility;
  remainingHours: EVMMetricVisibility;
}

export interface EVMMilestoneProgress {
  totalMilestones: number;
  completedMilestones: number;
  completionRate: number;
  activeMilestoneLabel: string | null;
}

export interface EVMPersonalMetrics {
  consistencyScore: number;
  effortBalanceScore: number;
  planAdherence: number;
  completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente';
  perceivedValueScore: number;
  actionHint: string;
}

export interface EVMSummary {
  spi: number;
  forecast: EVMForecast;
  curve: EVMCurve;
  totals: {
    completedHours: number;
    entriesCount: number;
  };
  personalMetrics: EVMPersonalMetrics;
  milestoneProgress: EVMMilestoneProgress;
  dashboardPreferences: EVMDashboardPreferences;
  metricRelevance: EVMMetricRelevance;
}

export interface EstimateCompletionDateParamsDto {
  project: ProjectDocument | null;
  metrics: { completedHours: number; plannedHours: number };
  scopeStartDate: Date | null;
  scopeEndDate: Date | null;
}

export interface BuildPersonalMetricsParamsDto {
  entries: ProjectProgress[];
  spi: number;
  coreMetrics: {
    pv: number;
    ev: number;
    completedHours: number;
    plannedHours: number;
  };
}

export interface BuildEVMCurvePointsParamsDto {
  scopedEntries: ProjectProgress[];
  plannedHours: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface RecordProgressParamsDto {
  projectId: string;
  completedHours: number;
  plannedValue: number;
  date?: string;
  source?: 'manual' | 'pomodoro' | 'completion';
  taskId?: string;
}

export interface EVMPersonalSummaryDto {
  consistencyScore: number;
  effortBalanceScore: number;
  planAdherence: number;
  completionTrend: EVMPersonalMetrics['completionTrend'];
  perceivedValueScore: number;
  actionHint: string;
  paceStatus: 'saudavel' | 'atencao' | 'critico';
  focusMessage: string;
}

export interface EVMCoreMetricsDto {
  pv: number;
  ev: number;
  bac: number;
  completedHours: number;
  plannedHours: number;
}

export interface EVMActiveWaveContextDto {
  startDate: Date | null;
  endDate: Date | null;
  plannedHours: number;
}
