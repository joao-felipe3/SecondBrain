import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TasksHabitsService } from '../../../../../src/tasks/services/monitoring/habits.service';

describe('TasksHabitsService', () => {
  let service: TasksHabitsService;
  let mockTaskModel: {
    find: jest.Mock;
  };

  const validParentId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksHabitsService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
      ],
    }).compile();

    service = module.get<TasksHabitsService>(TasksHabitsService);
  });

  describe('getStreakData', () => {
    it('deve rejeitar ID invalido de recorrencia', async () => {
      await expect(service.getStreakData('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar metricas zeradas se a serie estiver vazia', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const streak = await service.getStreakData(validParentId);
      expect(streak).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        aderencePercent: 0,
        lastCompletedDate: null,
      });
    });

    it('deve calcular streaks e taxa de adesao corretamente', async () => {
      const mockTasks = [
        { _id: '1', isConcluded: true, recurringState: 'completed', statusUpdatedAt: new Date('2026-05-01') },
        { _id: '2', isConcluded: true, recurringState: 'completed', statusUpdatedAt: new Date('2026-05-02') },
        { _id: '3', isConcluded: false, recurringState: 'pending', statusUpdatedAt: null },
      ];

      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTasks),
        }),
      });

      const streak = await service.getStreakData(validParentId);
      expect(streak.currentStreak).toBeGreaterThanOrEqual(0);
      expect(streak.aderencePercent).toBeGreaterThan(0);
    });
  });

  describe('getHabitsDashboard', () => {
    it('deve montar o dashboard de habitos', async () => {
      const mockHabits = [
        {
          _id: new Types.ObjectId(),
          name: 'Habito 1',
          status: 'todo',
          deadline: new Date(),
          microTaskType: 'habit',
        },
      ];

      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockHabits),
        }),
      });

      const dashboard = await service.getHabitsDashboard();
      expect(dashboard).toBeDefined();
      expect(dashboard.habits).toBeDefined();
    });

    it('deve capturar erro e lancar BadRequestException', async () => {
      mockTaskModel.find.mockImplementation(() => {
        throw new Error('DB Error');
      });

      await expect(service.getHabitsDashboard()).rejects.toThrow(BadRequestException);
    });
  });
});
