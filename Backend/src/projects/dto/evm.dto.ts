import { IsDateString, IsNumber, IsOptional } from 'class-validator'

export class RecordProjectProgressDto {
  @IsOptional()
  @IsDateString()
  date?: string

  @IsNumber()
  completedHours: number

  @IsNumber()
  actualCost: number

  @IsNumber()
  plannedValue: number
}

export interface EVMForecast {
  estimatedCost: number
  estimatedDate: string | null
  variance: number
  eeac: number
  etc: number
  bac: number
  ev: number
  ac: number
  pv: number
}

export interface EVMCurve {
  plannedValue: number[]
  actualValue: number[]
  costValue: number[]
  dates: string[]
}

export interface EVMPersonalMetrics {
  consistencyScore: number
  planAdherence: number
  completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente'
  perceivedValueScore: number
  isCostRelevant: boolean
  actionHint: string
}

export interface EVMSummary {
  spi: number
  cpi: number
  forecast: EVMForecast
  curve: EVMCurve
  totals: {
    completedHours: number
    entriesCount: number
    actualCost: number
  }
  personalMetrics: EVMPersonalMetrics
}
