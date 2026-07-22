import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TasksCompletionService } from '../../../../../src/tasks/services/workflow/completion.service';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { EVMProgressService } from '../../../../../src/projects/services/evm';
import { TasksMetricsService } from '../../../../../src/tasks/services/analysis/metrics.service';
import { DeviationDetectionService, AlertsService } from '../../../../../src/tasks/services/monitoring';
import { TasksRecurringService } from '../../../../../src/tasks/services/workflow/recurring.service';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';

describe('TasksCompletionService', () => {
  let service: TasksCompletionService;
  let mockTaskModel: {
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    findOne: jest.Mock;
    find?: jest.Mock;
  };
  let mockProjectsService: {
    incrementHoursWorked: jest.Mock;
  };
  let mockEvmProgressService: {
    recordProgress: jest.Mock;
  };
  let mockMetricsService: {
    applyEvmMetrics: jest.Mock;
  };
  let mockDeviationDetectionService: {
    generateDeviationAlert: jest.Mock;
  };
  let mockAlertsService: {
    createAlert: jest.Mock;
  };
  let mockTasksRecurringService: {
    normalizeRecurringRule: jest.Mock;
    calculateNextRecurringDate: jest.Mock;
    buildOccurrencePayload: jest.Mock;
  };
  let mockTasksWriteService: {
    createTaskCore: jest.Mock;
  };

  const validTaskId = new Types.ObjectId().toString();
  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockTaskModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      })),
    };

    mockProjectsService = {
      incrementHoursWorked: jest.fn().mockResolvedValue(undefined),
    };

    mockEvmProgressService = {
      recordProgress: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      applyEvmMetrics: jest.fn(),
    };

    mockDeviationDetectionService = {
      generateDeviationAlert: jest.fn().mockResolvedValue(null),
    };

    mockAlertsService = {
      createAlert: jest.fn().mockResolvedValue({ _id: 'alert-1' }),
    };

    mockTasksRecurringService = {
      normalizeRecurringRule: jest.fn().mockReturnValue({ frequency: 'daily', interval: 1 }),
      calculateNextRecurringDate: jest.fn().mockReturnValue(new Date('2026-05-01')),
      buildOccurrencePayload: jest.fn().mockReturnValue({ name: 'Next Occurrence' }),
    };

    mockTasksWriteService = {
      createTaskCore: jest.fn().mockResolvedValue({ _id: 'new-task-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksCompletionService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: EVMProgressService, useValue: mockEvmProgressService },
        { provide: TasksMetricsService, useValue: mockMetricsService },
        { provide: DeviationDetectionService, useValue: mockDeviationDetectionService },
        { provide: AlertsService, useValue: mockAlertsService },
        { provide: TasksRecurringService, useValue: mockTasksRecurringService },
        { provide: TasksWriteService, useValue: mockTasksWriteService },
      ],
    }).compile();

    service = module.get<TasksCompletionService>(TasksCompletionService);
  });

  describe('markAsConcluded', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.markAsConcluded('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lancar NotFoundException se tarefa nao for encontrada', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.markAsConcluded(validTaskId)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar tarefa inalterada se ja estiver concluida', async () => {
      const mockTask = { _id: validTaskId, isConcluded: true };
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.markAsConcluded(validTaskId);
      expect(result).toBe(mockTask);
    });

    it('deve marcar tarefa como concluida e atualizar metricas do projeto', async () => {
      const saveMock = jest.fn().mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve(this);
      });

      const mockTask = {
        _id: validTaskId,
        isConcluded: false,
        pomodorosDid: 1,
        pomodorosPlanned: 4,
        project: validProjectId,
        save: saveMock,
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      mockTaskModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ kanbanOrder: 2 }),
          }),
        }),
      });

      const result = await service.markAsConcluded(validTaskId);

      expect(result.isConcluded).toBe(true);
      expect(result.pomodorosDid).toBe(4);
      expect(mockProjectsService.incrementHoursWorked).toHaveBeenCalledWith(validProjectId, 1.5);
      expect(mockEvmProgressService.recordProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: validProjectId,
          completedHours: 1.5,
          source: 'completion',
        }),
      );
    });
  });

  describe('incrementPomodorosDid', () => {
    it('deve incrementar contagem de pomodoros e salvar', async () => {
      const saveMock = jest.fn().mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve(this);
      });

      const mockTask = {
        _id: validTaskId,
        pomodorosDid: 2,
        project: validProjectId,
        save: saveMock,
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.incrementPomodorosDid(validTaskId);

      expect(result.pomodorosDid).toBe(3);
      expect(mockMetricsService.applyEvmMetrics).toHaveBeenCalled();
      expect(mockProjectsService.incrementHoursWorked).toHaveBeenCalledWith(validProjectId, 0.5);
    });
  });

  describe('handleTaskCompletion', () => {
    it('deve retornar null se a tarefa nao existir', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.handleTaskCompletion(validTaskId);
      expect(result).toBeNull();
    });

    it('deve agendar proxima ocorrencia se a tarefa tiver regra recorrente', async () => {
      const mockTask = {
        _id: validTaskId,
        recurringRule: { frequency: 'daily', interval: 1 },
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.handleTaskCompletion(validTaskId);

      expect(result).toEqual(mockTask);
      expect(mockTasksRecurringService.normalizeRecurringRule).toHaveBeenCalledWith(mockTask.recurringRule);
      expect(mockTasksWriteService.createTaskCore).toHaveBeenCalledWith({ name: 'Next Occurrence' });
    });
  });

  describe('handleTaskSkipped', () => {
    it('deve atualizar estado para skipped e agendar proxima ocorrencia', async () => {
      const mockTask = {
        _id: validTaskId,
        recurringRule: { frequency: 'daily', interval: 1 },
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const updatedTask = {
        ...mockTask,
        recurringState: 'skipped',
        isConcluded: true,
        status: 'done',
      };

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedTask),
      });

      const result = await service.handleTaskSkipped(validTaskId);

      expect(result.recurringState).toBe('skipped');
      expect(mockTasksWriteService.createTaskCore).toHaveBeenCalled();
    });

    it('deve lancar NotFoundException se findByIdAndUpdate retornar null', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId }),
      });

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.handleTaskSkipped(validTaskId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleTaskDeferred', () => {
    it('deve lancar BadRequestException para nova data invalida', async () => {
      await expect(service.handleTaskDeferred(validTaskId, new Date('invalid-date'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve atualizar o prazo da tarefa', async () => {
      const newDeadline = new Date('2026-06-01');
      const mockTask = { _id: validTaskId, deadline: new Date('2026-05-01') };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...mockTask, deadline: newDeadline }),
      });

      const result = await service.handleTaskDeferred(validTaskId, newDeadline);
      expect(result.deadline).toEqual(newDeadline);
    });
  });

  describe('createDeviationAlertForTask', () => {
    it('deve retornar alertCreated: false se nao houver desvio', async () => {
      mockDeviationDetectionService.generateDeviationAlert.mockResolvedValue(null);

      const result = await service.createDeviationAlertForTask(validTaskId);
      expect(result).toEqual({ alertCreated: false });
    });

    it('deve criar alerta e retornar alertCreated: true se houver desvio', async () => {
      mockDeviationDetectionService.generateDeviationAlert.mockResolvedValue({
        message: 'Atraso detectado',
        recommendation: 'Ajustar prazo',
      });

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, project: validProjectId }),
      });

      const result = await service.createDeviationAlertForTask(validTaskId);
      expect(result.alertCreated).toBe(true);
      expect(mockAlertsService.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: 'Atraso detectado',
        }),
      );
    });
  });

  describe('moveTaskStatus', () => {
    it('deve rejeitar mover tarefa ja concluida para fora de done', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, isConcluded: true }),
      });

      await expect(service.moveTaskStatus(validTaskId, { status: 'doing' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve direcionar para markAsConcluded ao mover para done', async () => {
      const mockTask = { _id: validTaskId, isConcluded: true };
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.moveTaskStatus(validTaskId, { status: 'done' });
      expect(result).toBe(mockTask);
    });

    it('deve atualizar status no kanban para status diferente de done', async () => {
      const mockTask = { _id: validTaskId, isConcluded: false, status: 'todo', project: validProjectId };
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const updatedTask = { ...mockTask, status: 'doing', kanbanOrder: 1 };
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedTask),
      });

      const result = await service.moveTaskStatus(validTaskId, { status: 'doing', toOrder: 1 });
      expect(result.status).toBe('doing');
    });
  });
});
