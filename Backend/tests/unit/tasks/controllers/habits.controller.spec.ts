import { Test, TestingModule } from '@nestjs/testing';
import { HabitsController } from '../../../../src/tasks/controllers/habits.controller';
import { TasksService } from '../../../../src/tasks/tasks.service';
import { GetHabitsDashboardDto } from '../../../../src/tasks/dto/monitoring/get-habits-dashboard.dto';

describe('HabitsController', () => {
  let controller: HabitsController;
  let tasksService: TasksService;

  const mockDashboardResponse = {
    totalHabits: 3,
    activeStreaks: 2,
    habits: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HabitsController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            getHabitsDashboard: jest.fn().mockResolvedValue(mockDashboardResponse),
          },
        },
      ],
    }).compile();

    controller = module.get<HabitsController>(HabitsController);
    tasksService = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHabitsDashboard', () => {
    it('deve retornar o dashboard de hábitos', async () => {
      const query: GetHabitsDashboardDto = { projectId: 'proj-123' };
      const result = await controller.getHabitsDashboard(query);

      expect(result).toEqual(mockDashboardResponse);
      expect(tasksService.getHabitsDashboard).toHaveBeenCalledWith(query);
    });
  });
});
