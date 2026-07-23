import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { TasksRecurringService } from '../../../../../src/tasks/services/workflow/recurring.service';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';

describe('TasksRecurringService', () => {
  let service: TasksRecurringService;
  let taskModelMock: any;
  let projectsServiceMock: any;
  let tasksWriteServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    taskModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: validObjectId, project: validObjectId },
            { _id: '507f1f77bcf86cd799439012', project: validObjectId },
          ]),
        }),
      }),
      findByIdAndDelete: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validObjectId }),
      }),
    };

    projectsServiceMock = {
      recalculateProjectStats: jest.fn().mockResolvedValue({}),
    };

    tasksWriteServiceMock = {
      createTaskCore: jest.fn().mockResolvedValue({ _id: validObjectId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksRecurringService,
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: TasksWriteService, useValue: tasksWriteServiceMock },
      ],
    }).compile();

    service = module.get<TasksRecurringService>(TasksRecurringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findRecurringSeries', () => {
    it('deve lançar BadRequestException se ID for inválido', async () => {
      await expect(service.findRecurringSeries('invalid')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar todas as tarefas da série recorrente', async () => {
      const result = await service.findRecurringSeries(validObjectId);
      expect(result).toHaveLength(2);
      expect(taskModelMock.find).toHaveBeenCalled();
    });
  });

  describe('deleteRecurringSeries', () => {
    it('deve deletar toda a série recorrente e recalcular estatísticas', async () => {
      const result = await service.deleteRecurringSeries(validObjectId);

      expect(result.deletedCount).toBe(2);
      expect(projectsServiceMock.recalculateProjectStats).toHaveBeenCalled();
    });
  });

  describe('calculateNextRecurringDate', () => {
    it('deve calcular a próxima data para regra diária', () => {
      const date = new Date('2026-01-01T10:00:00Z');
      const rule: any = { frequency: 'daily', interval: 1 };
      const nextDate = service.calculateNextRecurringDate(date, rule);

      expect(nextDate).toBeDefined();
    });
  });
});
