import { Types } from 'mongoose';
import { HttpException } from '@nestjs/common';
import { WaveAndRiskController } from '@src/projects/controllers/wave-and-risk.controller';

describe('WaveAndRiskController', () => {
  let controller: WaveAndRiskController;
  let mockWaveService: any;
  let mockRiskService: any;
  let mockEvmService: any;
  let mockEvmProgressService: any;
  let mockTasksService: any;
  let mockCpmService: any;
  let mockProjectModel: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockWaveService = {
      getWavesByProject: jest.fn().mockResolvedValue([{ id: 'w1' }]),
      createInitialWaves: jest.fn().mockResolvedValue([{ id: 'w1' }]),
      updateWaveStatus: jest.fn().mockResolvedValue({ id: 'w1', status: 'planned' }),
      advanceToNextWave: jest.fn().mockResolvedValue({ id: 'w2' }),
      replanTaskDeadlines: jest.fn().mockResolvedValue({ updatedCount: 5, waveCount: 2 }),
    };

    mockRiskService = {
      getRisksByProject: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      assessRisks: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      getRisksBySeverity: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      createRisk: jest.fn().mockResolvedValue({ id: 'r1' }),
      updateRisk: jest.fn().mockResolvedValue({ id: 'r1' }),
      deleteRisk: jest.fn().mockResolvedValue(true),
      getRiskStatistics: jest.fn().mockResolvedValue({ total: 1 }),
      getRiskInterventions: jest.fn().mockResolvedValue({
        summary: 'low risk',
        interventions: [{ recommendedAction: 'revisar', confidence: 0.9, description: 'Risco alto' }],
      }),
    };

    mockEvmService = {
      calculateSPI: jest.fn().mockResolvedValue(1.1),
      forecastCompletion: jest.fn().mockResolvedValue({ spi: 1.1 }),
      getEVMCurve: jest.fn().mockResolvedValue({ points: [] }),
      getEVMSummary: jest.fn().mockResolvedValue({ spi: 1.1 }),
      getPersonalSummary: jest.fn().mockResolvedValue({
        paceStatus: 'saudavel',
        actionHint: 'Manter cadência',
        consistencyScore: 90,
        planAdherence: 95,
      }),
    };

    mockEvmProgressService = {
      recordProgress: jest.fn().mockResolvedValue({ id: 'p1' }),
      getProgressEntries: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      deleteProgressEntry: jest.fn().mockResolvedValue(true),
      getDashboardPreferences: jest.fn().mockResolvedValue({ mode: 'auto' }),
      saveDashboardPreferences: jest.fn().mockResolvedValue({ mode: 'manual' }),
    };

    mockTasksService = {
      findByProjectId: jest.fn().mockResolvedValue([{ _id: 't1', name: 'Task 1', isConcluded: false }]),
    };

    mockCpmService = {
      getDependencies: jest
        .fn()
        .mockResolvedValue([{ taskId: 't2', dependsOnTaskId: 't1', relationship: 'FS' }]),
      calculateCriticalPath: jest.fn().mockReturnValue({ criticalPath: ['t1'], projectDuration: 100 }),
      normalizeRelationship: jest.fn().mockReturnValue('FINISH_TO_START'),
    };

    mockProjectModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: validProjId, name: 'Proj 1', tasks: [] }),
      }),
    };

    controller = new WaveAndRiskController(
      mockWaveService,
      mockRiskService,
      mockEvmService,
      mockEvmProgressService,
      mockTasksService,
      mockCpmService,
      mockProjectModel,
    );
  });

  describe('Rolling wave & risk endpoints', () => {
    it('should get waves, generate waves and replan deadlines', async () => {
      const waves = await controller.getWaves(validProjId);
      expect(waves.length).toBe(1);

      const generated = await controller.generateWaves(validProjId, {});
      expect(generated.length).toBe(1);

      const replanned = await controller.replanTaskDeadlines(validProjId);
      expect(replanned.updatedCount).toBe(5);
    });

    it('should throw HttpException when project not found in generateWaves', async () => {
      mockProjectModel.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(null),
      });

      await expect(controller.generateWaves(validProjId, {})).rejects.toThrow(HttpException);
    });

    it('should update wave and advance wave', async () => {
      const updated = await controller.updateWave(validProjId, 'w1', { status: 'planned' } as any);
      expect(updated).toBeDefined();

      const advanced = await controller.advanceWave(validProjId);
      expect(advanced).toBeDefined();
    });

    it('should CRUD risks and fetch risk stats/interventions', async () => {
      const risks = await controller.getRisks(validProjId);
      expect(risks.length).toBe(1);

      const assessed = await controller.assessRisks(validProjId, { projectDescription: 'Desc' });
      expect(assessed.length).toBe(1);

      const assessedFallback = await controller.assessRisks(validProjId, {});
      expect(assessedFallback.length).toBe(1);

      const bySev = await controller.getRisksBySeverity(validProjId, 'HIGH' as any);
      expect(bySev.length).toBe(1);

      const created = await controller.createRisk(validProjId, { title: 'Risk 1' } as any);
      expect(created).toBeDefined();

      const updated = await controller.updateRisk(validProjId, 'r1', { title: 'Updated' } as any);
      expect(updated).toBeDefined();

      const deleted = await controller.deleteRisk(validProjId, 'r1');
      expect(deleted.message).toBeDefined();

      const stats = await controller.getRiskStatistics(validProjId);
      expect(stats.total).toBe(1);

      const interventions = await controller.getRiskInterventions(validProjId);
      expect(interventions.interventions.length).toBe(1);
    });

    it('should handle EVM progress recording, fetching, deleting, and preferences', async () => {
      const rec = await controller.recordProgress(validProjId, {
        completedHours: 10,
        plannedValue: 10,
        date: '2026-01-01',
      });
      expect(rec).toBeDefined();

      const entries = await controller.getProgressEntries(validProjId);
      expect(entries.length).toBe(1);

      const del = await controller.deleteProgressEntry(validProjId, 'p1');
      expect(del.deleted).toBe(true);

      const prefs = await controller.getMetricPreferences(validProjId);
      expect(prefs.mode).toBe('auto');

      const savedPrefs = await controller.updateMetricPreferences(validProjId, { mode: 'manual' });
      expect(savedPrefs.mode).toBe('manual');
    });

    it('should calculate EVM metrics, curve, forecast, and summaries', async () => {
      const spi = await controller.getSPI(validProjId);
      expect(spi.spi).toBe(1.1);

      const curve = await controller.getCurve(validProjId);
      expect(curve).toBeDefined();

      const forecast = await controller.getForecast(validProjId);
      expect(forecast).toBeDefined();

      const summary = await controller.getEVMSummary(validProjId);
      expect(summary).toBeDefined();

      const personal = await controller.getPersonalEVMSummary(validProjId);
      expect(personal).toBeDefined();
    });

    it('should calculate next best action for high-confidence risk', async () => {
      const nextAction = await controller.getNextBestAction(validProjId);
      expect(nextAction.action).toBeDefined();
      expect(nextAction.action.type).toBe('risco');
    });

    it('should calculate next best action for critical task on critical path', async () => {
      mockRiskService.getRiskInterventions.mockResolvedValueOnce({
        summary: 'ok',
        interventions: [{ recommendedAction: 'monitorar', confidence: 0.5, description: '' }],
      });

      const nextAction = await controller.getNextBestAction(validProjId);
      expect(nextAction.action.type).toBe('caminho-critico');
      expect(nextAction.action.taskId).toBe('t1');
    });

    it('should calculate next best action for critical pace when no critical tasks', async () => {
      mockRiskService.getRiskInterventions.mockResolvedValueOnce({
        summary: 'ok',
        interventions: [],
      });
      mockCpmService.calculateCriticalPath.mockReturnValueOnce({
        criticalPath: [],
        projectDuration: 50,
      });
      mockEvmService.getPersonalSummary.mockResolvedValueOnce({
        paceStatus: 'critico',
        actionHint: 'Reduza escopo',
      });

      const nextAction = await controller.getNextBestAction(validProjId);
      expect(nextAction.action.type).toBe('ritmo');
      expect(nextAction.action.title).toBe('Replanejar semana');
    });

    it('should calculate next best action for standard pace', async () => {
      mockRiskService.getRiskInterventions.mockResolvedValueOnce({
        summary: 'ok',
        interventions: [],
      });
      mockCpmService.calculateCriticalPath.mockReturnValueOnce({
        criticalPath: [],
        projectDuration: 50,
      });
      mockEvmService.getPersonalSummary.mockResolvedValueOnce({
        paceStatus: 'saudavel',
        actionHint: 'Manter cadencia',
      });

      const nextAction = await controller.getNextBestAction(validProjId);
      expect(nextAction.action.type).toBe('ritmo');
      expect(nextAction.action.title).toBe('Manter cadencia semanal');
    });

    it('should handle error catch blocks with HttpException in controller methods', async () => {
      mockWaveService.getWavesByProject.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getWaves(validProjId)).rejects.toThrow(HttpException);

      mockWaveService.updateWaveStatus.mockRejectedValueOnce(new Error('err'));
      await expect(controller.updateWave(validProjId, 'w1', {} as any)).rejects.toThrow(HttpException);

      mockWaveService.advanceToNextWave.mockRejectedValueOnce(new Error('err'));
      await expect(controller.advanceWave(validProjId)).rejects.toThrow(HttpException);

      mockWaveService.replanTaskDeadlines.mockRejectedValueOnce(new Error('err'));
      await expect(controller.replanTaskDeadlines(validProjId)).rejects.toThrow(HttpException);

      mockRiskService.getRisksByProject.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getRisks(validProjId)).rejects.toThrow(HttpException);

      mockRiskService.assessRisks.mockRejectedValueOnce(new Error('err'));
      await expect(controller.assessRisks(validProjId, {})).rejects.toThrow(HttpException);

      mockRiskService.getRisksBySeverity.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getRisksBySeverity(validProjId, 'LOW' as any)).rejects.toThrow(
        HttpException,
      );

      mockRiskService.createRisk.mockRejectedValueOnce(new Error('err'));
      await expect(controller.createRisk(validProjId, {} as any)).rejects.toThrow(HttpException);

      mockRiskService.updateRisk.mockRejectedValueOnce(new Error('err'));
      await expect(controller.updateRisk(validProjId, 'r1', {} as any)).rejects.toThrow(HttpException);

      mockRiskService.deleteRisk.mockRejectedValueOnce(new Error('err'));
      await expect(controller.deleteRisk(validProjId, 'r1')).rejects.toThrow(HttpException);

      mockRiskService.getRiskStatistics.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getRiskStatistics(validProjId)).rejects.toThrow(HttpException);

      mockRiskService.getRiskInterventions.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getRiskInterventions(validProjId)).rejects.toThrow(HttpException);

      mockEvmProgressService.recordProgress.mockRejectedValueOnce(new Error('err'));
      await expect(controller.recordProgress(validProjId, {} as any)).rejects.toThrow(HttpException);

      mockEvmProgressService.getProgressEntries.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getProgressEntries(validProjId)).rejects.toThrow(HttpException);

      mockEvmProgressService.deleteProgressEntry.mockRejectedValueOnce(new Error('err'));
      await expect(controller.deleteProgressEntry(validProjId, 'p1')).rejects.toThrow(HttpException);

      mockEvmService.calculateSPI.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getSPI(validProjId)).rejects.toThrow(HttpException);

      mockEvmService.forecastCompletion.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getForecast(validProjId)).rejects.toThrow(HttpException);

      mockEvmService.getEVMCurve.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getCurve(validProjId)).rejects.toThrow(HttpException);

      mockEvmService.getEVMSummary.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getEVMSummary(validProjId)).rejects.toThrow(HttpException);

      mockEvmService.getPersonalSummary.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getPersonalEVMSummary(validProjId)).rejects.toThrow(HttpException);

      mockEvmProgressService.getDashboardPreferences.mockRejectedValueOnce(new Error('err'));
      await expect(controller.getMetricPreferences(validProjId)).rejects.toThrow(HttpException);

      mockEvmProgressService.saveDashboardPreferences.mockRejectedValueOnce(new Error('err'));
      await expect(controller.updateMetricPreferences(validProjId, {})).rejects.toThrow(HttpException);
    });
  });
});
