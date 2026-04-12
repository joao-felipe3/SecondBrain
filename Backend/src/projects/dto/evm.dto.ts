import { IsDateString, IsNumber, IsOptional } from 'class-validator'

export class RecordProjectProgressDto {
  @IsOptional()
  @IsDateString()
  date?: string

  @IsNumber()
  completedHours: number

  @IsNumber()
  plannedValue: number
}

export interface EVMForecast {
  estimatedDate: string | null
  variance: number
  remainingHours: number
  completionRate: number
  bac: number
  ev: number
  pv: number
}

export interface EVMCurve {
  plannedValue: number[]
  actualValue: number[]
  dates: string[]
}

export interface EVMDashboardManualVisibility {
  spi: boolean
  plannedVsEarned: boolean
  completedHours: boolean
  consistency: boolean
  planAdherence: boolean
  trend: boolean
  perceivedProgress: boolean
  remainingHours: boolean
}

export interface EVMDashboardPreferences {
  mode: 'auto' | 'manual'
  manualVisibility: EVMDashboardManualVisibility
}

export interface EVMMetricVisibility {
  visible: boolean
  reason: string
}

export interface EVMMetricRelevance {
  spi: EVMMetricVisibility
  plannedVsEarned: EVMMetricVisibility
  completedHours: EVMMetricVisibility
  consistency: EVMMetricVisibility
  planAdherence: EVMMetricVisibility
  trend: EVMMetricVisibility
  perceivedProgress: EVMMetricVisibility
  remainingHours: EVMMetricVisibility
}

export interface EVMMilestoneProgress {
  totalMilestones: number
  completedMilestones: number
  completionRate: number
  activeMilestoneLabel: string | null
}

export interface EVMPersonalMetrics {
  consistencyScore: number
  effortBalanceScore: number
  planAdherence: number
  completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente'
  perceivedValueScore: number
  actionHint: string
}

export interface EVMSummary {
  spi: number
  forecast: EVMForecast
  curve: EVMCurve
  totals: {
    completedHours: number
    entriesCount: number
  }
  personalMetrics: EVMPersonalMetrics
  milestoneProgress: EVMMilestoneProgress
  dashboardPreferences: EVMDashboardPreferences
  metricRelevance: EVMMetricRelevance
}
