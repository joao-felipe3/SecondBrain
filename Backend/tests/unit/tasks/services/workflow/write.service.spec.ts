import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';
import { ProjectStatsService } from '../../../../../src/projects/services/execution/project-stats.service';
import { TasksMetricsService } from '../../../../../src/tasks/services/analysis/metrics.service';
import { TasksInputService } from '../../../../../src/tasks/services/workflow/input.service';
import { ChecklistOperationsService } from '../../../../../src/tasks/services/intelligence/checklist-operations.service';

describe('TasksWriteService', () => {
  let service: TasksWriteService;
  let mockTaskModel: any;
  let mockProjectModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
  };
  let mockProjectStatsService: {
    recalculateProjectStats: jest.Mock;
  };
  let mockMetricsService: {
    deriveMetrics: jest.Mock;
    applyPertEstimates: jest.Mock;
    applyRtmRisk: jest.Mock;
    applyEvmMetrics: jest.Mock;
  };
  let mockTasksInputService: {
    validatePertInput: jest.Mock;
    normalizeChecklist: jest.Mock;
  };
  let mockChecklistOperationsService: {
    generateChecklistWithHistory: jest.Mock;
    validateChecklistStructure: jest.Mock;
  };

  const validTaskId = new Types.ObjectId().toString();
  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const saveMock = jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    });

    mockTaskModel = jest.fn().mockImplementation((dto: any) => ({
      ...dto,
      _id: validTaskId,
      save: saveMock,
    })) as any;

    mockTaskModel.findById = jest.fn();
    mockTaskModel.findByIdAndUpdate = jest.fn();
    mockTaskModel.findByIdAndDelete = jest.fn();
    mockTaskModel.insertMany = jest.fn();

    mockProjectModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validProjectId, name: 'Project 1' }),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validProjectId, name: 'Project 1' }),
      }),
    };

    mockProjectStatsService = {
      recalculateProjectStats: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      deriveMetrics: jest.fn().mockImplementation((dto) => dto),
      applyPertEstimates: jest.fn(),
      applyRtmRisk: jest.fn(),
      applyEvmMetrics: jest.fn(),
    };

    mockTasksInputService = {
      validatePertInput: jest.fn(),
      normalizeChecklist: jest.fn().mockImplementation((chk) => chk || []),
    };

    mockChecklistOperationsService = {
      generateChecklistWithHistory: jest.fn().mockResolvedValue([{ item: 'Item 1', completed: false }]),
      validateChecklistStructure: jest.fn().mockReturnValue({ isValid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksWriteService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: getModelToken('Project'), useValue: mockProjectModel },
        { provide: ProjectStatsService, useValue: mockProjectStatsService },
        { provide: TasksMetricsService, useValue: mockMetricsService },
        { provide: TasksInputService, useValue: mockTasksInputService },
        { provide: ChecklistOperationsService, useValue: mockChecklistOperationsService },
      ],
    }).compile();

    service = module.get<TasksWriteService>(TasksWriteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTaskCore', () => {
    it('deve criar uma tarefa e recalcular estatísticas do projeto', async () => {
      const dto: any = { name: 'Minha Tarefa', project: validProjectId };
      const result = await service.createTaskCore(dto);

      expect(result).toBeDefined();
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalledWith(validProjectId);
    });
  });

  describe('createMany', () => {
    it('deve retornar array vazio se nenhuma tarefa for enviada', async () => {
      const result = await service.createMany([]);
      expect(result).toEqual([]);
    });

    it('deve inserir tarefas em lote e recalcular estatisticas do projeto', async () => {
      const dtos = [
        { name: 'Task 1', project: validProjectId },
        { name: 'Task 2', project: validProjectId },
      ];
      const insertedDocs = dtos.map((d) => ({ ...d, _id: new Types.ObjectId() }));

      mockTaskModel.insertMany.mockResolvedValue(insertedDocs);

      const result = await service.createMany(dtos as any, { recalculateProjectStats: true });

      expect(result).toEqual(insertedDocs);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalledWith(validProjectId);
    });
  });

  describe('createMicroTask', () => {
    it('deve criar micro-tarefa e gerar checklist se necessario', async () => {
      const dto = {
        name: 'Micro Task Test',
        project: validProjectId,
        autoGenerateChecklist: true,
      };

      const result = await service.createMicroTask(dto as any);
      expect(result).toBeDefined();
      expect(mockTasksInputService.validatePertInput).toHaveBeenCalledWith(dto);
      expect(mockChecklistOperationsService.generateChecklistWithHistory).toHaveBeenCalled();
    });

    it('deve rejeitar checklist vazio se autoGenerateChecklist for false', async () => {
      const dto = {
        name: 'Micro Task Test',
        checklist: [],
        autoGenerateChecklist: false,
      };

      await expect(service.createMicroTask(dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.update('invalid-id', {})).rejects.toThrow(BadRequestException);
    });

    it('deve atualizar tarefa e recalcular estatisticas do projeto se o projeto for alterado', async () => {
      const oldProjectId = new Types.ObjectId().toString();
      const newProjectId = new Types.ObjectId().toString();

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, project: oldProjectId }),
      });

      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: newProjectId }),
      });

      const updatedTask = { _id: validTaskId, project: newProjectId };
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedTask),
      });

      const result = await service.update(validTaskId, { project: newProjectId });

      expect(result).toEqual(updatedTask);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalledWith(oldProjectId);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalledWith(newProjectId);
    });
  });

  describe('remove', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lancar NotFoundException se a tarefa nao for encontrada', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove(validTaskId)).rejects.toThrow(NotFoundException);
    });

    it('deve remover tarefa e recalcular estatisticas do projeto', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, project: validProjectId }),
      });

      mockTaskModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId }),
      });

      const success = await service.remove(validTaskId);
      expect(success).toBe(true);
      expect(mockProjectStatsService.recalculateProjectStats).toHaveBeenCalledWith(validProjectId);
    });
  });
});
