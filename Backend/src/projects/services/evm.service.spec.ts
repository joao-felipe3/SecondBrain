import { EVMService } from './evm.service'

describe('EVMService', () => {
  let service: EVMService

  beforeEach(() => {
    service = new EVMService({} as any, {} as any, {} as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('calculateSPI should return EV/PV', async () => {
    jest.spyOn(service as any, 'getCoreMetrics').mockResolvedValue({
      pv: 50,
      ev: 45,
      bac: 50,
      completedHours: 10,
      plannedHours: 20,
    })

    const result = await service.calculateSPI('project-1')

    expect(result).toBe(0.9)
  })

  it('getEVMSummary should include personal metrics for personal projects', async () => {
    const entries = [
      {
        date: new Date('2026-03-01').toISOString(),
        completedHours: 8,
        plannedValue: 20,
      },
      {
        date: new Date('2026-03-08').toISOString(),
        completedHours: 6,
        plannedValue: 20,
      },
      {
        date: new Date('2026-03-15').toISOString(),
        completedHours: 4,
        plannedValue: 20,
      },
      {
        date: new Date('2026-03-22').toISOString(),
        completedHours: 3,
        plannedValue: 20,
      },
    ]

    jest.spyOn(service, 'calculateSPI').mockResolvedValue(0.9)
    jest.spyOn(service, 'forecastCompletion').mockResolvedValue({
      estimatedDate: new Date('2026-04-10').toISOString(),
      variance: -5,
      remainingHours: 19,
      completionRate: 52.5,
      bac: 100,
      ev: 50,
      pv: 55,
    })
    jest.spyOn(service, 'getEVMCurve').mockResolvedValue({
      plannedValue: [20, 40, 60, 80],
      actualValue: [18, 35, 48, 55],
      dates: ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'],
    })
    jest.spyOn(service, 'getProgressEntries').mockResolvedValue(entries as any)
    jest.spyOn(service as any, 'getCoreMetrics').mockResolvedValue({
      pv: 80,
      ev: 55,
      bac: 100,
      completedHours: 21,
      plannedHours: 40,
    })

    const summary = await service.getEVMSummary('project-1')

    expect(summary.totals.completedHours).toBe(21)
    expect(summary.personalMetrics).toBeDefined()
    expect(summary.personalMetrics.consistencyScore).toBeGreaterThanOrEqual(0)
    expect(summary.personalMetrics.planAdherence).toBeGreaterThanOrEqual(0)
    expect(summary.personalMetrics.perceivedValueScore).toBeGreaterThanOrEqual(0)
    expect(summary.personalMetrics.completionTrend).toMatch(/acelerando|estavel|desacelerando|insuficiente/)
    expect(typeof summary.personalMetrics.actionHint).toBe('string')
    expect(summary.personalMetrics.actionHint.length).toBeGreaterThan(5)
  })
})
