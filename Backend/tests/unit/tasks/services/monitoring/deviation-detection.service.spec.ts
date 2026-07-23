import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { DeviationDetectionService } from '../../../../../src/tasks/services/monitoring/deviation-detection.service';

describe('DeviationDetectionService', () => {
  let service: DeviationDetectionService;
  let mockTaskModel: any;

  beforeEach(async () => {
    mockTaskModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviationDetectionService,
        {
          provide: getModelToken('Task'),
          useValue: mockTaskModel,
        },
      ],
    }).compile();

    service = module.get<DeviationDetectionService>(DeviationDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkTimeDeviation', () => {
    it('deve lançar NotFoundException se a tarefa não for encontrada', async () => {
      mockTaskModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.checkTimeDeviation('t-none')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar isDeviated false se PERT expectedTime não estiver definido ou <= 0', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ pertExpectedMinutes: 0, pomodorosDid: 2 }),
      });

      const result = await service.checkTimeDeviation('t-1');

      expect(result.isDeviated).toBe(false);
      expect(result.actualMinutes).toBe(60);
      expect(result.message).toBe('Missing PERT expected time');
    });

    it('deve calcular desvio e retornar isDeviated true se percentOver >= 25%', async () => {
      // 4 pomodoros = 120min reais. Esperado: 60min. Percentual acima = 100%
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ pertExpectedMinutes: 60, pomodorosDid: 4 }),
      });

      const result = await service.checkTimeDeviation('t-1');

      expect(result.isDeviated).toBe(true);
      expect(result.percentOver).toBe(100);
      expect(result.actualMinutes).toBe(120);
      expect(result.expectedMinutes).toBe(60);
      expect(result.message).toContain('exceeded estimate by 100%');
    });

    it('deve retornar isDeviated false se o desvio for inferior a 25%', async () => {
      // 2 pomodoros = 60min reais. Esperado: 60min. Percentual acima = 0%
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ pertExpectedMinutes: 60, pomodorosDid: 2 }),
      });

      const result = await service.checkTimeDeviation('t-1');

      expect(result.isDeviated).toBe(false);
      expect(result.percentOver).toBe(0);
    });
  });

  describe('generateDeviationAlert', () => {
    it('deve retornar null se a tarefa não apresentou desvio', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ pertExpectedMinutes: 60, pomodorosDid: 1 }),
      });

      const result = await service.generateDeviationAlert('t-1');

      expect(result).toBeNull();
    });

    it('deve retornar o resultado de desvio se houver desvio', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ pertExpectedMinutes: 60, pomodorosDid: 5 }),
      });

      const result = await service.generateDeviationAlert('t-1');

      expect(result).not.toBeNull();
      expect(result?.isDeviated).toBe(true);
    });
  });
});
