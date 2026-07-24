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
      getProgressEntries: jest.fn().mockResolvedValue([
        { date: '2026-01-01', completedHours: 4, plannedValue: 10 },
      ]),
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

    service = new EVMService(
      mockEvmProgressService,
      mockProjectWaveModel as any,
      mockProjectModel as any,
    );
  });

  describe('validation', () => {
    it('should throw BadRequestException on invalid project ObjectId', async () => {
      await expect(service.calculateSPI('invalid-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateSPI & forecastCompletion', () => {
    it('should calculate SPI for valid project', async () => {
      const validId = new Types.ObjectId().toHexString();
      const spi = await service.calculateSPI(validId);
      expect(typeof spi).toBe('number');
      expect(spi).toBeGreaterThan(0);
    });

    it('should forecast project completion metrics', async () => {
      const validId = new Types.ObjectId().toHexString();
      const forecast = await service.forecastCompletion(validId);
      expect(forecast).toBeDefined();
      expect(forecast.completionRate).toBeDefined();
      expect(forecast.remainingHours).toBeDefined();
    });
  });

  describe('getEVMCurve & getEVMSummary', () => {
    it('should return EVM curve points', async () => {
      const validId = new Types.ObjectId().toHexString();
      const curve = await service.getEVMCurve(validId);
      expect(curve.dates.length).toBeGreaterThan(0);
    });

    it('should assemble comprehensive EVM summary and personal summary', async () => {
      const validId = new Types.ObjectId().toHexString();
      const summary = await service.getEVMSummary(validId);
      expect(summary.spi).toBeDefined();
      expect(summary.forecast).toBeDefined();
      expect(summary.metricRelevance).toBeDefined();

      const personal = await service.getPersonalSummary(validId);
      expect(personal.paceStatus).toBeDefined();
      expect(personal.focusMessage).toBeDefined();
    });
  });
});
