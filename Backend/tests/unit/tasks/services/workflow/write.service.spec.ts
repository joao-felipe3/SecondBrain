import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksWriteService } from '../../../../../src/tasks/services/workflow/write.service';
import { ProjectsService } from '../../../../../src/projects/projects.service';
import { TasksMetricsService } from '../../../../../src/tasks/services/analysis/metrics.service';
import { TasksInputService } from '../../../../../src/tasks/services/workflow/input.service';
import { ChecklistOperationsService } from '../../../../../src/tasks/services/intelligence/checklist-operations.service';

describe('TasksWriteService', () => {
  let service: TasksWriteService;
  let taskModelMock: any;
  let projectModelMock: any;
  let projectsServiceMock: any;
  let metricsServiceMock: any;
  let tasksInputServiceMock: any;
  let checklistOperationsServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    taskModelMock = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: validObjectId,
      save: jest.fn().mockResolvedValue({ ...dto, _id: validObjectId, project: validObjectId }),
    }));

    taskModelMock.insertMany = jest.fn().mockResolvedValue([{ _id: validObjectId, name: 'Task 1' }]);
    taskModelMock.findById = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validObjectId, project: validObjectId }),
    });
    taskModelMock.findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validObjectId, name: 'Updated Task', project: validObjectId }),
    });
    taskModelMock.findByIdAndDelete = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validObjectId, project: validObjectId }),
    });

    projectModelMock = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validObjectId }),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validObjectId }),
      }),
    };

    projectsServiceMock = {
      recalculateProjectStats: jest.fn().mockResolvedValue({}),
    };

    metricsServiceMock = {
      deriveMetrics: jest.fn().mockImplementation((dto) => dto),
      applyPertEstimates: jest.fn(),
      applyRtmRisk: jest.fn(),
      applyEvmMetrics: jest.fn(),
    };

    tasksInputServiceMock = {
      validatePertInput: jest.fn(),
      normalizeChecklist: jest.fn().mockReturnValue([{ item: 'Step 1' }]),
    };

    checklistOperationsServiceMock = {
      validateChecklistStructure: jest.fn().mockReturnValue({ isValid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksWriteService,
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: getModelToken('Project'), useValue: projectModelMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: TasksMetricsService, useValue: metricsServiceMock },
        { provide: TasksInputService, useValue: tasksInputServiceMock },
        { provide: ChecklistOperationsService, useValue: checklistOperationsServiceMock },
      ],
    }).compile();

    service = module.get<TasksWriteService>(TasksWriteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTaskCore', () => {
    it('deve criar uma tarefa e recalcular estatísticas do projeto', async () => {
      const dto: any = { name: 'Minha Tarefa', projectId: validObjectId };
      const result = await service.createTaskCore(dto);

      expect(result).toBeDefined();
      expect(projectsServiceMock.recalculateProjectStats).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deve atualizar tarefa existente', async () => {
      const result = await service.update(validObjectId, { name: 'Novo Nome' });

      expect(result).toBeDefined();
      expect(taskModelMock.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deve remover tarefa existente por ID', async () => {
      const result = await service.remove(validObjectId);

      expect(result).toBeDefined();
      expect(taskModelMock.findByIdAndDelete).toHaveBeenCalled();
    });
  });
});
