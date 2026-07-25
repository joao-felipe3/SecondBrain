import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TasksRecurringService } from '../../../../../src/tasks/services/workflow/recurring.service';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';
import { CreateMicroTaskDto } from '../../../../../src/tasks/dto/task/create-micro-task.dto';

describe('TasksRecurringService', () => {
  let service: TasksRecurringService;
  let mockTaskModel: {
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let mockProjectsService: {
    recalculateProjectStats: jest.Mock;
  };
  let mockTasksWriteService: {
    createMicroTask: jest.Mock;
    createTaskCore: jest.Mock;
  };

  const validParentId = new Types.ObjectId().toString();
  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    mockProjectsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue(undefined),
    };

    mockTasksWriteService = {
      createMicroTask: jest.fn(),
      createTaskCore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksRecurringService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: TasksWriteService, useValue: mockTasksWriteService },
      ],
    }).compile();

    service = module.get<TasksRecurringService>(TasksRecurringService);
  });

  describe('Utility Methods', () => {
    it('deve normalizar a regra de recorrencia', () => {
      const rule = { frequency: 'daily', interval: 2 };
      const normalized = service.normalizeRecurringRule(rule);
      expect(normalized).toBeDefined();
      expect(normalized.frequency).toBe('daily');
    });

    it('deve calcular a proxima data recorrente', () => {
      const baseDate = new Date('2026-05-01');
      const rule = { frequency: 'daily', interval: 1 };
      const nextDate = service.calculateNextRecurringDate(baseDate, rule);
      expect(nextDate).toBeDefined();
    });

    it('deve calcular a primeira data recorrente', () => {
      const startDate = new Date('2026-05-01');
      const rule = { frequency: 'weekly', interval: 1, daysOfWeek: [1] };
      const firstDate = service.calculateFirstRecurringDate(startDate, rule);
      expect(firstDate).toBeDefined();
    });
  });

  describe('findRecurringSeries', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.findRecurringSeries('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar tarefas pertencentes a serie', async () => {
      const mockTasks = [
        { _id: validParentId },
        { _id: new Types.ObjectId(), parentRecurringId: validParentId },
      ];
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTasks),
        }),
      });

      const result = await service.findRecurringSeries(validParentId);
      expect(result).toEqual(mockTasks);
    });
  });

  describe('deleteRecurringSeries', () => {
    it('deve deletar tarefas da serie e recalcular estatisticas dos projetos afetados', async () => {
      const mockTasks = [
        { _id: new Types.ObjectId().toString(), project: validProjectId },
        { _id: new Types.ObjectId().toString(), project: validProjectId },
      ];

      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTasks),
        }),
      });

      mockTaskModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      });

      const result = await service.deleteRecurringSeries(validParentId);
      expect(result.deletedCount).toBe(2);
      expect(mockProjectsService.recalculateProjectStats).toHaveBeenCalledWith(validProjectId);
    });
  });

  describe('createRecurringTemplate', () => {
    it('deve chamar createMicroTask com payload normalizado', async () => {
      const dto: Partial<CreateMicroTaskDto> = {
        name: 'Template Task',
        recurringRule: { frequency: 'daily', interval: 1 },
      };

      const mockTemplate = { _id: 'template-id', ...dto };
      mockTasksWriteService.createMicroTask.mockResolvedValue(mockTemplate);

      const result = await service.createRecurringTemplate(dto as CreateMicroTaskDto);
      expect(result).toBe(mockTemplate);
      expect(mockTasksWriteService.createMicroTask).toHaveBeenCalledWith(
        expect.objectContaining({
          isRecurringInstance: false,
          recurringState: 'pending',
        }),
      );
    });
  });

  describe('createRecurringMicroTask', () => {
    it('deve criar template e a primeira ocorrencia', async () => {
      const dto: Partial<CreateMicroTaskDto> = {
        name: 'Micro Task Recorrente',
        deadline: new Date('2026-05-01'),
        recurringRule: { frequency: 'daily', interval: 1 },
      };

      const mockTemplate = { _id: 'template-id', ...dto, createdAt: new Date() };
      const mockFirstOccurrence = { _id: 'occurrence-1', ...dto };

      mockTasksWriteService.createMicroTask.mockResolvedValue(mockTemplate);
      mockTasksWriteService.createTaskCore.mockResolvedValue(mockFirstOccurrence);

      const result = await service.createRecurringMicroTask(dto as CreateMicroTaskDto);
      expect(result).toBe(mockFirstOccurrence);
    });
  });

  describe('updateRecurringRule', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(
        service.updateRecurringRule('invalid-id', { frequency: 'daily', interval: 1 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve atualizar regra e retornar tarefa', async () => {
      const mockTask = { _id: validParentId, recurringRule: { frequency: 'daily', interval: 1 } };
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.updateRecurringRule(validParentId, {
        frequency: 'daily',
        interval: 1,
      });
      expect(result).toBe(mockTask);
    });

    it('deve lancar NotFoundException se tarefa nao for encontrada', async () => {
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateRecurringRule(validParentId, { frequency: 'daily', interval: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateNextOccurrence', () => {
    it('deve buscar tarefa por ID e gerar proxima ocorrencia', async () => {
      const mockTask = {
        _id: validParentId,
        deadline: new Date('2026-05-01'),
        recurringRule: { frequency: 'daily', interval: 1 },
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const mockNextOccurrence = { _id: 'next-id' };
      mockTasksWriteService.createTaskCore.mockResolvedValue(mockNextOccurrence);

      const result = await service.generateNextOccurrence(validParentId);
      expect(result).toBe(mockNextOccurrence);
    });

    it('deve lancar NotFoundException se tarefa nao for encontrada por ID', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.generateNextOccurrence(validParentId)).rejects.toThrow(NotFoundException);
    });
  });
});
