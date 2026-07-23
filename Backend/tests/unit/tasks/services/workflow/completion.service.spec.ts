import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksCompletionService } from '../../../../../src/tasks/services/workflow/completion.service';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { EVMProgressService } from '../../../../../src/projects/services/evm';
import { TasksMetricsService } from '../../../../../src/tasks/services/analysis/metrics.service';
import { DeviationDetectionService, AlertsService } from '../../../../../src/tasks/services/monitoring';
import { TasksRecurringService } from '../../../../../src/tasks/services/workflow/recurring.service';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';

describe('TasksCompletionService', () => {
  let service: TasksCompletionService;
  let taskModelMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    taskModelMock = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 1 }),
          }),
        }),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          isConcluded: false,
          pomodorosPlanned: 4,
          pomodorosDid: 2,
          project: validObjectId,
          save: jest.fn().mockResolvedValue({
            _id: validObjectId,
            isConcluded: true,
            status: 'completed',
            project: validObjectId,
          }),
        }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validObjectId, isConcluded: true }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksCompletionService,
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: ProjectsService, useValue: { recalculateAggregates: jest.fn().mockResolvedValue({}), incrementHoursWorked: jest.fn().mockResolvedValue({}) } },
        { provide: EVMProgressService, useValue: { recalculateProjectMetrics: jest.fn().mockResolvedValue({}) } },
        { provide: TasksMetricsService, useValue: { applyEvmMetrics: jest.fn() } },
        { provide: DeviationDetectionService, useValue: { checkTimeDeviation: jest.fn().mockResolvedValue(null), generateDeviationAlert: jest.fn().mockResolvedValue(null) } },
        { provide: AlertsService, useValue: { createAlert: jest.fn().mockResolvedValue({}) } },
        { provide: TasksRecurringService, useValue: { generateNextOccurrence: jest.fn().mockResolvedValue({}) } },
        { provide: TasksWriteService, useValue: { create: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<TasksCompletionService>(TasksCompletionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('markAsConcluded', () => {
    it('deve lançar BadRequestException para ID inválido', async () => {
      await expect(service.markAsConcluded('invalid')).rejects.toThrow(BadRequestException);
    });

    it('deve marcar tarefa como concluída se não concluída', async () => {
      const result = await service.markAsConcluded(validObjectId);

      expect(result).toBeDefined();
      expect(result.isConcluded).toBe(true);
    });
  });

  describe('incrementPomodorosDid', () => {
    it('deve incrementar pomodoros realizada', async () => {
      const result = await service.incrementPomodorosDid(validObjectId);

      expect(result).toBeDefined();
    });
  });
});
