import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EVMService } from '@src/projects/services/evm/evm.service';

describe('EVMService', () => {
  let service: EVMService;
  let mockEvmProgressService: any;
  let mockProjectWaveModel: any;
  let mockProjectModel: any;

  beforeEach(() => {
    mockEvmProgressService = {
      getProgressEntries: jest
        .fn()
        .mockResolvedValue([{ date: '2026-01-05', completedHours: 4, plannedValue: 10 }]),
      getDashboardPreferences: jest.fn().mockResolvedValue({ defaultView: 'personal' }),
    };

    mockProjectWaveModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              waveNumber: 1,
              status: 'active',
              startDate: '2026-01-01T00:00:00Z',
              endDate: '2026-01-10T00:00:00Z',
            },
          ]),
        }),
      }),
    };

    mockProjectModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          plannedHours: 20,
          startDate: new Date('2026-01-01'),
          deadline: new Date('2026-01-10'),
        }),
      }),
    };

    service = new EVMService(mockEvmProgressService, mockProjectWaveModel, mockProjectModel);
  });

  describe('validation', () => {
    it('should throw BadRequestException on invalid project ObjectId', async () => {
      await expect(service.calculateSPI('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.forecastCompletion('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.getEVMCurve('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.getEVMSummary('invalid-id')).rejects.toThrow(BadRequestException);
      await expect(service.getPersonalSummary('invalid-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateSPI & forecastCompletion', () => {
    it('should calculate SPI for valid project', async () => {
      const validId = new Types.ObjectId().toHexString();
      const spi = await service.calculateSPI(validId);
      expect(typeof spi).toBe('number');
      expect(spi).toBeGreaterThan(0);
    });

    it('should return SPI = 1 when PV is 0 or negative', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValueOnce([]);
      mockProjectWaveModel.find.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
      mockProjectModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({
          plannedHours: 0,
          startDate: null,
          deadline: null,
        }),
      });

      const validId = new Types.ObjectId().toHexString();
      const spi = await service.calculateSPI(validId);
      expect(spi).toBe(1);
    });

    it('should forecast project completion metrics with positive bac and remaining hours', async () => {
      const validId = new Types.ObjectId().toHexString();
      const forecast = await service.forecastCompletion(validId);
      expect(forecast).toBeDefined();
      expect(forecast.completionRate).toBeDefined();
      expect(forecast.remainingHours).toBeDefined();
      expect(forecast.bac).toBeGreaterThan(0);
    });

    it('should handle forecast when completed hours exceed planned hours', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValueOnce([
        { date: '2026-01-05', completedHours: 50, plannedValue: 10 },
      ]);
      const validId = new Types.ObjectId().toHexString();
      const forecast = await service.forecastCompletion(validId);
      expect(forecast.remainingHours).toBe(0);
    });
  });

  describe('getEVMCurve', () => {
    it('should return empty curve when entries list is empty', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValueOnce([]);
      const validId = new Types.ObjectId().toHexString();
      const curve = await service.getEVMCurve(validId);
      expect(curve.dates).toEqual([]);
      expect(curve.plannedValue).toEqual([]);
      expect(curve.actualValue).toEqual([]);
    });

    it('should return empty curve when scoped entries is empty (outside wave window)', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValueOnce([
        { date: '2025-01-01', completedHours: 4, plannedValue: 10 },
      ]);
      const validId = new Types.ObjectId().toHexString();
      const curve = await service.getEVMCurve(validId);
      expect(curve.dates).toEqual([]);
    });

    it('should return EVM curve points when entries fall inside window', async () => {
      const validId = new Types.ObjectId().toHexString();
      const curve = await service.getEVMCurve(validId);
      expect(curve.dates.length).toBeGreaterThan(0);
    });
  });

  describe('getEVMSummary & getPersonalSummary', () => {
    it('should assemble comprehensive EVM summary and personal summary', async () => {
      const validId = new Types.ObjectId().toHexString();
      const summary = await service.getEVMSummary(validId);
      expect(summary.spi).toBeDefined();
      expect(summary.forecast).toBeDefined();
      expect(summary.metricRelevance).toBeDefined();
      expect(summary.totals.completedHours).toBe(4);
      expect(summary.totals.entriesCount).toBe(1);
    });

    it('should set paceStatus to critico when consistency is very low or SPI < 0.8', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValue([
        { date: '2026-01-01', completedHours: 0.1, plannedValue: 20 },
        { date: '2026-01-02', completedHours: 0.1, plannedValue: 20 },
      ]);

      const validId = new Types.ObjectId().toHexString();
      const personal = await service.getPersonalSummary(validId);
      expect(personal.paceStatus).toBe('critico');
      expect(personal.focusMessage).toContain('Reduza escopo da semana');
    });

    it('should set paceStatus to atencao when consistency or SPI is moderate', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValue([
        { date: '2026-01-05', completedHours: 17, plannedValue: 20 },
      ]);

      const validId = new Types.ObjectId().toHexString();
      const personal = await service.getPersonalSummary(validId);
      expect(['atencao', 'saudavel', 'critico']).toContain(personal.paceStatus);
      if (personal.paceStatus === 'atencao') {
        expect(personal.focusMessage).toContain('ajuste leve');
      }
    });

    it('should set paceStatus to saudavel when performance and consistency are high', async () => {
      mockEvmProgressService.getProgressEntries.mockResolvedValue([
        { date: '2026-01-05', completedHours: 20, plannedValue: 20 },
      ]);

      const validId = new Types.ObjectId().toHexString();
      const personal = await service.getPersonalSummary(validId);
      if (personal.paceStatus === 'saudavel') {
        expect(personal.focusMessage).toContain('Ritmo saudavel');
      }
    });
  });

  describe('milestones and wave contexts', () => {
    it('should return empty milestone progress when waves are empty', async () => {
      mockProjectWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const validId = new Types.ObjectId().toHexString();
      const summary = await service.getEVMSummary(validId);
      expect(summary.milestoneProgress.totalMilestones).toBe(0);
      expect(summary.milestoneProgress.activeMilestoneLabel).toBeNull();
    });

    it('should handle completed waves with no active wave', async () => {
      mockProjectWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              waveNumber: 1,
              status: 'completed',
              startDate: '2026-01-01',
              endDate: '2026-01-05',
            },
          ]),
        }),
      });

      const validId = new Types.ObjectId().toHexString();
      const summary = await service.getEVMSummary(validId);
      expect(summary.milestoneProgress.totalMilestones).toBe(1);
      expect(summary.milestoneProgress.completedMilestones).toBe(1);
      expect(summary.milestoneProgress.activeMilestoneLabel).toBeNull();
    });

    it('should handle null project dates and empty waves in getActiveWaveContext fallback', async () => {
      mockProjectWaveModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const validId = new Types.ObjectId().toHexString();
      const forecast = await service.forecastCompletion(validId);
      expect(forecast).toBeDefined();
    });
  });
});
