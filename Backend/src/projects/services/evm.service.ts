import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ProjectProgress, ProjectProgressDocument } from '../schemas/project-progress.schema'
import { ProjectWave, ProjectWaveDocument } from '../schemas/project-wave.schema'
import { ProjectDocument } from '../schemas/project.schema'
import type { EVMCurve, EVMForecast, EVMPersonalMetrics, EVMSummary } from '../dto/evm.dto'

@Injectable()
export class EVMService {
  constructor(
    @InjectModel(ProjectProgress.name)
    private readonly projectProgressModel: Model<ProjectProgressDocument>,
    @InjectModel(ProjectWave.name)
    private readonly projectWaveModel: Model<ProjectWaveDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async recordProgress(
    projectId: string,
    completedHours: number,
    actualCost: number,
    plannedValue: number,
    date?: string,
  ): Promise<ProjectProgress> {
    return this.projectProgressModel.create({
      projectId: new Types.ObjectId(projectId),
      date: date ? new Date(date) : new Date(),
      completedHours,
      actualCost,
      plannedValue,
    })
  }

  async getProgressEntries(projectId: string): Promise<ProjectProgress[]> {
    return this.projectProgressModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ date: 1, createdAt: 1 })
      .exec()
  }

  async deleteProgressEntry(projectId: string, entryId: string): Promise<boolean> {
    const result = await this.projectProgressModel
      .deleteOne({ _id: new Types.ObjectId(entryId), projectId: new Types.ObjectId(projectId) })
      .exec()

    return result.deletedCount > 0
  }

  async calculateSPI(projectId: string): Promise<number> {
    const metrics = await this.getCoreMetrics(projectId)
    if (metrics.pv <= 0) return 1
    return Number((metrics.ev / metrics.pv).toFixed(4))
  }

  async calculateCPI(projectId: string): Promise<number> {
    const metrics = await this.getCoreMetrics(projectId)
    if (metrics.ac <= 0 || metrics.ac < 100) return 1
    return Number((metrics.ev / metrics.ac).toFixed(4))
  }

  async forecastCompletion(projectId: string): Promise<EVMForecast> {
    const [entries, metrics, project, activeWaveContext] = await Promise.all([
      this.getProgressEntries(projectId),
      this.getCoreMetrics(projectId),
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ])

    const cpi = metrics.ac > 0 ? metrics.ev / metrics.ac : 1
    const safeCpi = cpi <= 0 ? 1 : cpi
    const etc = Math.max(0, (metrics.bac - metrics.ev) / safeCpi)
    const eeac = metrics.ac + etc
    const variance = eeac - metrics.bac

    const scopedEntries = this.scopeEntriesByWindow(entries, activeWaveContext.startDate, activeWaveContext.endDate)
    const estimatedDate = this.estimateCompletionDate(
      scopedEntries,
      project,
      metrics,
      activeWaveContext.startDate,
      activeWaveContext.endDate,
    )

    return {
      estimatedCost: Number(eeac.toFixed(2)),
      estimatedDate,
      variance: Number(variance.toFixed(2)),
      eeac: Number(eeac.toFixed(2)),
      etc: Number(etc.toFixed(2)),
      bac: Number(metrics.bac.toFixed(2)),
      ev: Number(metrics.ev.toFixed(2)),
      ac: Number(metrics.ac.toFixed(2)),
      pv: Number(metrics.pv.toFixed(2)),
    }
  }

  async getEVMCurve(projectId: string): Promise<EVMCurve> {
    const entries = await this.getProgressEntries(projectId)
    if (entries.length === 0) {
      return { plannedValue: [], actualValue: [], costValue: [], dates: [] }
    }

    const [project, activeWaveContext] = await Promise.all([
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ])

    const scopedEntries = this.scopeEntriesByWindow(entries, activeWaveContext.startDate, activeWaveContext.endDate)
    if (scopedEntries.length === 0) {
      return { plannedValue: [], actualValue: [], costValue: [], dates: [] }
    }

    const totalPV = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0)
    const plannedHours = Math.max(1, activeWaveContext.plannedHours)
    const bac = Math.max(1, totalPV, plannedHours)

    let cumulativeAC = 0
    let cumulativeHours = 0

    const plannedValue: number[] = []
    const actualValue: number[] = []
    const costValue: number[] = []
    const dates: string[] = []

    for (const entry of scopedEntries) {
      cumulativeAC += entry.actualCost || 0
      cumulativeHours += entry.completedHours || 0

      const progressRatio = Math.max(0, Math.min(1, cumulativeHours / plannedHours))
      const cumulativeEV = bac * progressRatio
      const scheduleRatio = this.getScheduleRatioByDates(
        activeWaveContext.startDate,
        activeWaveContext.endDate,
        new Date(entry.date),
      )
      const cumulativePV = scheduleRatio !== null
        ? bac * scheduleRatio
        : plannedValue.length > 0
          ? plannedValue[plannedValue.length - 1] + (entry.plannedValue || 0)
          : (entry.plannedValue || 0)

      plannedValue.push(Number(cumulativePV.toFixed(2)))
      actualValue.push(Number(cumulativeEV.toFixed(2)))
      costValue.push(Number(cumulativeAC.toFixed(2)))
      dates.push(new Date(entry.date).toISOString().slice(0, 10))
    }

    return {
      plannedValue,
      actualValue,
      costValue,
      dates,
    }
  }

  async getEVMSummary(projectId: string): Promise<EVMSummary> {
    const [spi, cpi, forecast, curve, entries, coreMetrics] = await Promise.all([
      this.calculateSPI(projectId),
      this.calculateCPI(projectId),
      this.forecastCompletion(projectId),
      this.getEVMCurve(projectId),
      this.getProgressEntries(projectId),
      this.getCoreMetrics(projectId),
    ])

    const completedHours = coreMetrics.completedHours
    const actualCost = coreMetrics.ac
    const personalMetrics = this.buildPersonalMetrics(entries, spi, cpi, coreMetrics)

    return {
      spi,
      cpi,
      forecast,
      curve,
      totals: {
        completedHours: Number(completedHours.toFixed(2)),
        entriesCount: entries.length,
        actualCost: Number(actualCost.toFixed(2)),
      },
      personalMetrics,
    }
  }

  private async getCoreMetrics(projectId: string): Promise<{
    pv: number
    ac: number
    ev: number
    bac: number
    completedHours: number
    plannedHours: number
  }> {
    const [entries, project, activeWaveContext] = await Promise.all([
      this.getProgressEntries(projectId),
      this.projectModel.findById(projectId).exec(),
      this.getActiveWaveContext(projectId),
    ])

    const scopedEntries = this.scopeEntriesByWindow(entries, activeWaveContext.startDate, activeWaveContext.endDate)

    const pv = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0)
    const ac = scopedEntries.reduce((sum, entry) => sum + (entry.actualCost || 0), 0)
    const completedHours = scopedEntries.reduce((sum, entry) => sum + (entry.completedHours || 0), 0)

    const plannedHours = Math.max(1, activeWaveContext.plannedHours)
    const bac = Math.max(1, pv, plannedHours)
    const progressRatio = Math.max(0, Math.min(1, completedHours / plannedHours))
    const scheduleRatio = this.getScheduleRatioByDates(activeWaveContext.startDate, activeWaveContext.endDate)
    const ev = bac * progressRatio
    const effectivePV = scheduleRatio !== null ? bac * scheduleRatio : pv

    return {
      pv: Number(effectivePV.toFixed(2)),
      ac,
      ev,
      bac,
      completedHours,
      plannedHours,
    }
  }

  private estimateCompletionDate(
    entries: ProjectProgress[],
    project: ProjectDocument | null,
    metrics: { completedHours: number; plannedHours: number },
    scopeStartDate: Date | null,
    scopeEndDate: Date | null,
  ): string | null {
    const baselineStart = scopeStartDate || (project?.startDate ? new Date(project.startDate) : null)
    const baselineEnd = scopeEndDate || (project?.deadline ? new Date(project.deadline) : null)
    if (!baselineStart) return null

    const startDate = new Date(baselineStart)
    const now = new Date()

    if (metrics.completedHours <= 0) {
      return baselineEnd ? new Date(baselineEnd).toISOString() : null
    }

    const elapsedMs = Math.max(1, now.getTime() - startDate.getTime())
    const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24))
    const hoursPerDay = metrics.completedHours / elapsedDays

    if (hoursPerDay <= 0) {
      return baselineEnd ? new Date(baselineEnd).toISOString() : null
    }

    const remainingHours = Math.max(0, metrics.plannedHours - metrics.completedHours)
    const remainingDays = remainingHours / hoursPerDay

    const estimateDate = new Date(now)
    estimateDate.setDate(estimateDate.getDate() + Math.ceil(remainingDays))

    return estimateDate.toISOString()
  }

  private buildPersonalMetrics(
    entries: ProjectProgress[],
    spi: number,
    cpi: number,
    coreMetrics: { pv: number; ac: number; ev: number; completedHours: number; plannedHours: number },
  ): EVMPersonalMetrics {
    const consistencyScore = this.calculateConsistencyScore(entries)
    const planAdherence = coreMetrics.pv > 0
      ? this.toBoundedScore((coreMetrics.ev / coreMetrics.pv) * 100)
      : 100

    const completionTrend = this.calculateCompletionTrend(entries)
    const completionRatio = Math.max(0, Math.min(1, coreMetrics.completedHours / Math.max(1, coreMetrics.plannedHours)))

    const actualCost = entries.reduce((sum, entry) => sum + (entry.actualCost || 0), 0)
    const isCostRelevant = actualCost >= 100

    const perceivedValueScore = this.toBoundedScore(
      (completionRatio * 100) * 0.45
      + consistencyScore * 0.3
      + planAdherence * 0.25,
    )

    const actionHint = this.buildActionHint({
      spi,
      cpi,
      consistencyScore,
      planAdherence,
      completionTrend,
      isCostRelevant,
    })

    return {
      consistencyScore,
      planAdherence,
      completionTrend,
      perceivedValueScore,
      isCostRelevant,
      actionHint,
    }
  }

  private calculateConsistencyScore(entries: ProjectProgress[]): number {
    if (entries.length <= 1) return 100

    const weeklyMap = new Map<string, number>()

    for (const entry of entries) {
      const date = new Date(entry.date)
      const weekKey = this.toWeekKey(date)
      const current = weeklyMap.get(weekKey) || 0
      weeklyMap.set(weekKey, current + (entry.completedHours || 0))
    }

    const weeklyHours = Array.from(weeklyMap.values())
    if (weeklyHours.length <= 1) return 100

    const avg = weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length
    if (avg <= 0) return 0

    const variance = weeklyHours.reduce((sum, value) => sum + (value - avg) ** 2, 0) / weeklyHours.length
    const stdDev = Math.sqrt(variance)
    const coefficient = stdDev / avg

    return this.toBoundedScore(100 - coefficient * 60)
  }

  private calculateCompletionTrend(
    entries: ProjectProgress[],
  ): 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente' {
    if (entries.length < 4) return 'insuficiente'

    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const splitIndex = Math.floor(sorted.length / 2)

    const firstHalf = sorted.slice(0, splitIndex)
    const secondHalf = sorted.slice(splitIndex)

    const firstAvg = firstHalf.reduce((sum, entry) => sum + (entry.completedHours || 0), 0) / Math.max(1, firstHalf.length)
    const secondAvg = secondHalf.reduce((sum, entry) => sum + (entry.completedHours || 0), 0) / Math.max(1, secondHalf.length)

    if (firstAvg <= 0 && secondAvg <= 0) return 'insuficiente'

    const deltaRatio = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 1

    if (deltaRatio > 0.1) return 'acelerando'
    if (deltaRatio < -0.1) return 'desacelerando'
    return 'estavel'
  }

  private buildActionHint(input: {
    spi: number
    cpi: number
    consistencyScore: number
    planAdherence: number
    completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente'
    isCostRelevant: boolean
  }): string {
    if (input.consistencyScore < 55) {
      return 'Padronize uma meta minima semanal de horas para recuperar consistencia.'
    }

    if (input.completionTrend === 'desacelerando') {
      return 'Seu ritmo esta caindo: reduza escopo da semana e priorize a proxima etapa critica.'
    }

    if (input.spi < 0.95) {
      return 'Voce esta abaixo do ritmo planejado: revise o plano da semana e ajuste prazos intermediarios.'
    }

    if (input.isCostRelevant && input.cpi < 0.95) {
      return 'O custo real esta acima do esperado: avalie alternativas mais simples e reduza retrabalho.'
    }

    if (!input.isCostRelevant && input.planAdherence < 90) {
      return 'Mesmo sem custo relevante, vale ajustar o plano para manter aderencia e previsibilidade.'
    }

    return 'Bom progresso: mantenha a cadencia atual e reavalie o plano no fechamento da semana.'
  }

  private toWeekKey(date: Date): string {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = target.getUTCDay() || 7
    target.setUTCDate(target.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  private toBoundedScore(value: number): number {
    return Number(Math.max(0, Math.min(100, value)).toFixed(1))
  }

  private getScheduleRatioByDates(
    startDate: Date | null,
    endDate: Date | null,
    atDate: Date = new Date(),
  ): number | null {
    if (!startDate || !endDate) return null

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null
    }

    const totalMs = end.getTime() - start.getTime()
    const elapsedMs = atDate.getTime() - start.getTime()
    const ratio = elapsedMs / totalMs

    return Math.max(0, Math.min(1, ratio))
  }

  private scopeEntriesByWindow(
    entries: ProjectProgress[],
    startDate: Date | null,
    endDate: Date | null,
  ): ProjectProgress[] {
    if (!startDate || !endDate) return entries

    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime()
    return entries.filter((entry) => {
      const current = new Date(entry.date).getTime()
      return current >= start && current <= end
    })
  }

  private async getActiveWaveContext(projectId: string): Promise<{
    startDate: Date | null
    endDate: Date | null
    plannedHours: number
  }> {
    const [project, waves] = await Promise.all([
      this.projectModel.findById(projectId).exec(),
      this.projectWaveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ])

    const fallbackPlannedHours = Math.max(1, project?.plannedHours || 1)
    if (waves.length === 0) {
      return {
        startDate: project?.startDate ? new Date(project.startDate) : null,
        endDate: project?.deadline ? new Date(project.deadline) : null,
        plannedHours: fallbackPlannedHours,
      }
    }

    const activeWave = waves.find((wave) => wave.status === 'active') || null
    if (!activeWave) {
      return {
        startDate: project?.startDate ? new Date(project.startDate) : null,
        endDate: project?.deadline ? new Date(project.deadline) : null,
        plannedHours: fallbackPlannedHours,
      }
    }

    const totalWaveDurationMs = waves.reduce((sum, wave) => {
      const duration = new Date(wave.endDate).getTime() - new Date(wave.startDate).getTime()
      return sum + Math.max(0, duration)
    }, 0)

    const activeWaveDurationMs = Math.max(
      0,
      new Date(activeWave.endDate).getTime() - new Date(activeWave.startDate).getTime(),
    )

    const plannedHours = totalWaveDurationMs > 0
      ? fallbackPlannedHours * (activeWaveDurationMs / totalWaveDurationMs)
      : fallbackPlannedHours / Math.max(1, waves.length)

    return {
      startDate: new Date(activeWave.startDate),
      endDate: new Date(activeWave.endDate),
      plannedHours: Math.max(1, plannedHours),
    }
  }
}
