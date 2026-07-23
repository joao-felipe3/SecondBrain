import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksHabitsService } from '../../../../../src/tasks/services/monitoring/habits.service';
import { BadRequestException } from '@nestjs/common';

describe('TasksHabitsService', () => {
  let service: TasksHabitsService;
  let mockTaskModel: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: validObjectId, recurringState: 'completed', deadline: new Date() },
            { _id: '507f1f77bcf86cd799439012', recurringState: 'completed', deadline: new Date() },
          ]),
        }),
        exec: jest.fn().mockResolvedValue([
          { _id: validObjectId, name: 'Habit 1', isRecurring: true, recurringState: 'completed', deadline: new Date() },
        ]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksHabitsService,
        {
          provide: getModelToken('Task'),
          useValue: mockTaskModel,
        },
      ],
    }).compile();

    service = module.get<TasksHabitsService>(TasksHabitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStreakData', () => {
    it('deve lançar BadRequestException para ID inválido', async () => {
      await expect(service.getStreakData('invalid')).rejects.toThrow(BadRequestException);
    });

    it('deve calcular streak e aderência para série de tarefas recorrentes', async () => {
      const result = await service.getStreakData(validObjectId);
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
      expect(result.aderencePercent).toBe(100);
    });
  });

  describe('getHabitsDashboard', () => {
    it('deve retornar métricas do dashboard de hábitos', async () => {
      const result = await service.getHabitsDashboard({ projectId: validObjectId });
      expect(result).toBeDefined();
    });
  });
});
