import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DeviationDetectionService } from '../../../../../src/tasks/services/monitoring/deviation-detection.service';

describe('DeviationDetectionService', () => {
  let service: DeviationDetectionService;
  let mockTaskModel: {
    findById: jest.Mock;
  };

  const validTaskId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockTaskModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviationDetectionService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
      ],
    }).compile();

    service = module.get<DeviationDetectionService>(DeviationDetectionService);
  });

  describe('checkTimeDeviation', () => {
    it('deve lancar NotFoundException se tarefa nao existir', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.checkTimeDeviation(validTaskId)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar isDeviated: false se tempo esperado PERT for 0', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, pertExpectedMinutes: 0 }),
      });

      const result = await service.checkTimeDeviation(validTaskId);
      expect(result.isDeviated).toBe(false);
    });

    it('deve retornar isDeviated: false se o desvio for inferior a 25%', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: validTaskId, pertExpectedMinutes: 60, pomodorosDid: 2 }), // 60m actual vs 60m expected
      });

      const result = await service.checkTimeDeviation(validTaskId);
      expect(result.isDeviated).toBe(false);
    });

    it('deve retornar isDeviated: true com mensagem e recomendacao se o desvio for >= 25%', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: validTaskId, pertExpectedMinutes: 60, pomodorosDid: 4 }), // 120m actual vs 60m expected (100% over)
      });

      const result = await service.checkTimeDeviation(validTaskId);
      expect(result.isDeviated).toBe(true);
      expect(result.percentOver).toBe(100);
      expect(result.message).toContain('exceeded estimate');
    });
  });

  describe('generateDeviationAlert', () => {
    it('deve retornar null se nao houver desvio', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: validTaskId, pertExpectedMinutes: 60, pomodorosDid: 2 }),
      });

      const alert = await service.generateDeviationAlert(validTaskId);
      expect(alert).toBeNull();
    });

    it('deve retornar o resultado de desvio se houver desvio >= 25%', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: validTaskId, pertExpectedMinutes: 60, pomodorosDid: 4 }),
      });

      const alert = await service.generateDeviationAlert(validTaskId);
      expect(alert).not.toBeNull();
      expect(alert?.isDeviated).toBe(true);
    });
  });
});
