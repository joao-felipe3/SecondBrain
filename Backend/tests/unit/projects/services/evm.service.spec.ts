import { EVMService, EVMProgressService } from '../../../../src/projects/services/evm';
import { ProjectWaveDocument } from '../../../../src/projects/schemas/project-wave.schema';
import { ProjectDocument } from '../../../../src/projects/schemas/project.schema';
import { ProjectProgress } from '../../../../src/projects/schemas/project-progress.schema';
import { Model, Types } from 'mongoose';

describe('EVMService', () => {
  let service: EVMService;
  let mockProgressService: jest.Mocked<EVMProgressService>;

  beforeEach(() => {
    mockProgressService = {
      getProgressEntries: jest.fn().mockResolvedValue([]),
      getDashboardPreferences: jest.fn(),
      saveDashboardPreferences: jest.fn(),
      recordProgress: jest.fn(),
      deleteProgressEntry: jest.fn(),
      normalizeDashboardPreferences: jest.fn(),
      defaultManualVisibility: {
        spi: true,
        plannedVsEarned: true,
        completedHours: true,
        consistency: true,
        planAdherence: true,
        trend: true,
        perceivedProgress: true,
        remainingHours: true,
      },
    } as unknown as jest.Mocked<EVMProgressService>;

    service = new EVMService(
      mockProgressService,
      {} as unknown as Model<ProjectWaveDocument>,
      {} as unknown as Model<ProjectDocument>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculateSPI should return EV/PV', async () => {
    jest.spyOn(service as unknown as { getCoreMetrics: jest.Mock }, 'getCoreMetrics').mockResolvedValue({
      pv: 50,
      ev: 45,
      bac: 50,
      completedHours: 10,
      plannedHours: 20,
    });

    const projectId = new Types.ObjectId().toString();
    const result = await service.calculateSPI(projectId);

    expect(result).toBe(0.9);
  });

  it('getEVMSummary should include personal metrics for personal projects', async () => {
    const projectId = new Types.ObjectId().toString();
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
    ];

    jest.spyOn(service, 'calculateSPI').mockResolvedValue(0.9);
    jest.spyOn(service, 'forecastCompletion').mockResolvedValue({
      estimatedDate: new Date('2026-04-10').toISOString(),
      variance: -5,
      remainingHours: 19,
      completionRate: 52.5,
      bac: 100,
      ev: 50,
      pv: 55,
    });
    jest.spyOn(service, 'getEVMCurve').mockResolvedValue({
      plannedValue: [20, 40, 60, 80],
      actualValue: [18, 35, 48, 55],
      dates: ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'],
    });
    mockProgressService.getProgressEntries.mockResolvedValue(entries as unknown as ProjectProgress[]);
    mockProgressService.getDashboardPreferences.mockResolvedValue({
      mode: 'auto',
      manualVisibility: {
        spi: true,
        plannedVsEarned: true,
        completedHours: true,
        consistency: true,
        planAdherence: true,
        trend: true,
        perceivedProgress: true,
        remainingHours: true,
      },
    });
    jest
      .spyOn(service as unknown as { getMilestoneProgress: jest.Mock }, 'getMilestoneProgress')
      .mockResolvedValue({
        totalMilestones: 0,
        completedMilestones: 0,
        overallPercent: 0,
        nextMilestone: null,
      });
    jest.spyOn(service as unknown as { getCoreMetrics: jest.Mock }, 'getCoreMetrics').mockResolvedValue({
      pv: 80,
      ev: 55,
      bac: 100,
      completedHours: 21,
      plannedHours: 40,
    });

    const summary = await service.getEVMSummary(projectId);

    expect(summary.totals.completedHours).toBe(21);
    expect(summary.personalMetrics).toBeDefined();
    expect(summary.personalMetrics.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(summary.personalMetrics.planAdherence).toBeGreaterThanOrEqual(0);
    expect(summary.personalMetrics.perceivedValueScore).toBeGreaterThanOrEqual(0);
    expect(summary.personalMetrics.completionTrend).toMatch(
      /acelerando|estavel|desacelerando|insuficiente/,
    );
    expect(typeof summary.personalMetrics.actionHint).toBe('string');
    expect(summary.personalMetrics.actionHint.length).toBeGreaterThan(5);
  });
});
