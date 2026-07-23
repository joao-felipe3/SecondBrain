import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../../../src/projects/projects.service';
import {
  GanttService,
  PertDiagramService,
  ProjectsXMatrixService,
} from '../../../src/projects/services/visualization';
import { ProjectStatsService } from '../../../src/projects/services/execution';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectModelMock: any;
  let taskModelMock: any;
  let xMatrixServiceMock: any;
  let ganttServiceMock: any;
  let pertDiagramServiceMock: any;
  let projectStatsServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    projectModelMock = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto, _id: validObjectId }),
    }));
    projectModelMock.find = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ _id: validObjectId, name: 'Projeto 1' }]),
    });
    projectModelMock.findById = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: validObjectId,
        name: 'Projeto 1',
        totalHoursWorked: 10,
        plannedHours: 100,
        save: jest.fn().mockResolvedValue({ _id: validObjectId, totalHoursWorked: 20 }),
      }),
    });
    projectModelMock.findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validObjectId, name: 'Projeto Atualizado' }),
    });
    projectModelMock.findByIdAndDelete = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: validObjectId }),
    });

    taskModelMock = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: 'task-1', name: 'Task 1' }]),
      }),
      deleteMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      }),
      updateMany: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      }),
    };

    xMatrixServiceMock = {
      createXMatrix: jest.fn().mockResolvedValue({ matrix: [] }),
      getSavedXMatrix: jest.fn().mockResolvedValue({ matrix: [] }),
    };

    ganttServiceMock = {
      getGanttData: jest.fn().mockResolvedValue({ tasks: [] }),
    };

    pertDiagramServiceMock = {
      getPertDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    };

    projectStatsServiceMock = {
      recalculateProjectStats: jest.fn().mockResolvedValue({ _id: validObjectId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getModelToken('Project'), useValue: projectModelMock },
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: ProjectsXMatrixService, useValue: xMatrixServiceMock },
        { provide: GanttService, useValue: ganttServiceMock },
        { provide: PertDiagramService, useValue: pertDiagramServiceMock },
        { provide: ProjectStatsService, useValue: projectStatsServiceMock },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createXMatrix', () => {
    it('deve delegar a criação do XMatrix ao xMatrixService', async () => {
      const result = await service.createXMatrix(validObjectId, {} as any);
      expect(result).toBeDefined();
      expect(xMatrixServiceMock.createXMatrix).toHaveBeenCalledWith(validObjectId, {});
    });
  });

  describe('getSavedXMatrix', () => {
    it('deve buscar XMatrix salvo', async () => {
      const result = await service.getSavedXMatrix(validObjectId);
      expect(result).toBeDefined();
      expect(xMatrixServiceMock.getSavedXMatrix).toHaveBeenCalledWith(validObjectId);
    });
  });

  describe('getGanttData', () => {
    it('deve buscar dados do gráfico de Gantt', async () => {
      const result = await service.getGanttData(validObjectId);
      expect(result).toBeDefined();
      expect(ganttServiceMock.getGanttData).toHaveBeenCalledWith(validObjectId, undefined);
    });
  });

  describe('getPertDiagramData', () => {
    it('deve buscar dados do diagrama PERT', async () => {
      const result = await service.getPertDiagramData(validObjectId);
      expect(result).toBeDefined();
      expect(pertDiagramServiceMock.getPertDiagramData).toHaveBeenCalledWith(validObjectId, undefined);
    });
  });

  describe('getTasksForProject', () => {
    it('deve lançar BadRequestException para ID inválido', async () => {
      await expect(service.getTasksForProject('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve buscar tarefas do projeto para ID válido', async () => {
      const result = await service.getTasksForProject(validObjectId);
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('deve criar um projeto', async () => {
      const result = await service.create({ name: 'Novo Projeto' } as any);
      expect(result._id).toBe(validObjectId);
    });
  });

  describe('findAll', () => {
    it('deve listar todos os projetos', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve buscar um projeto por ID', async () => {
      const result = await service.findOne(validObjectId);
      expect(result?._id).toBe(validObjectId);
    });

    it('deve lançar erro se ID for inválido', async () => {
      await expect(service.findOne('123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('deve atualizar o projeto por ID', async () => {
      const result = await service.update(validObjectId, { name: 'Atualizado' });
      expect(result?.name).toBe('Projeto Atualizado');
    });
  });

  describe('remove', () => {
    it('deve remover o projeto', async () => {
      const result = await service.remove(validObjectId);
      expect(result).toBe(true);
    });
  });

  describe('removeWithOptions', () => {
    it('deve deletar tarefas e projeto quando deleteTasks=true', async () => {
      const result = await service.removeWithOptions(validObjectId, true);
      expect(result.deleted).toBe(true);
      expect(taskModelMock.deleteMany).toHaveBeenCalledWith({ project: validObjectId });
    });

    it('deve desvincular tarefas do projeto quando deleteTasks=false', async () => {
      const result = await service.removeWithOptions(validObjectId, false);
      expect(result.deleted).toBe(true);
      expect(taskModelMock.updateMany).toHaveBeenCalled();
    });
  });

  describe('incrementHoursWorked', () => {
    it('deve incrementar as horas trabalhadas do projeto', async () => {
      const result = await service.incrementHoursWorked(validObjectId, 10);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se projeto não for encontrado', async () => {
      projectModelMock.findById.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.incrementHoursWorked(validObjectId, 10)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('moveTaskToProject', () => {
    it('deve mover tarefa entre projetos e recalcular estatísticas', async () => {
      await service.moveTaskToProject('task-1', validObjectId, validObjectId);
      expect(projectStatsServiceMock.recalculateProjectStats).toHaveBeenCalled();
    });
  });
});
