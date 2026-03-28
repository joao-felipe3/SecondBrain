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

export interface EVMPersonalMetrics {
  consistencyScore: number
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
}
