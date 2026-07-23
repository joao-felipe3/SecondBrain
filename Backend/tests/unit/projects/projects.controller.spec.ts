import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsController } from '../../../src/projects/projects.controller';
import { ProjectsService } from '../../../src/projects/projects.service';
import { PlanningService } from '../../../src/projects/services/strategy';
import { WBSService, WbsValidationService, TaskConversionService, AuditService } from '../../../src/projects/services/wbs';
import { TasksService } from '../../../src/tasks/tasks.service';
import { LeafTasksBufferService } from '../../../src/projects/services/execution';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsServiceMock: any;
  let planningServiceMock: any;
  let wbsServiceMock: any;
  let validationMock: any;
  let taskConversionServiceMock: any;
  let auditServiceMock: any;
  let tasksServiceMock: any;
  let leafBufferMock: any;
  let taskModelMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    projectsServiceMock = {
      getTasksForProject: jest.fn().mockResolvedValue([{ id: 'task-1' }]),
      getGanttData: jest.fn().mockResolvedValue({ tasks: [] }),
      getPertDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      createXMatrix: jest.fn().mockResolvedValue({ matrix: [] }),
      getSavedXMatrix: jest.fn().mockResolvedValue({ matrix: [] }),
      create: jest.fn().mockResolvedValue({ _id: validObjectId, name: 'Projeto' }),
      findAll: jest.fn().mockResolvedValue([{ _id: validObjectId, name: 'Projeto' }]),
      findOne: jest.fn().mockResolvedValue({ _id: validObjectId, name: 'Projeto' }),
      update: jest.fn().mockResolvedValue({ _id: validObjectId, name: 'Projeto Atualizado' }),
      remove: jest.fn().mockResolvedValue(true),
      removeWithOptions: jest.fn().mockResolvedValue({ deleted: true, tasksAffected: 5 }),
    };

    planningServiceMock = {};
    wbsServiceMock = {};
    validationMock = {};
    taskConversionServiceMock = {};
    auditServiceMock = {};
    tasksServiceMock = {};
    leafBufferMock = {};

    taskModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: 'task-1', name: 'Task 1' }]),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: PlanningService, useValue: planningServiceMock },
        { provide: WBSService, useValue: wbsServiceMock },
        { provide: WbsValidationService, useValue: validationMock },
        { provide: TaskConversionService, useValue: taskConversionServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: LeafTasksBufferService, useValue: leafBufferMock },
        { provide: getModelToken('Task'), useValue: taskModelMock },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTasksForProject', () => {
    it('deve retornar tarefas do projeto', async () => {
      const result = await controller.getTasksForProject(validObjectId);
      expect(result).toHaveLength(1);
      expect(projectsServiceMock.getTasksForProject).toHaveBeenCalledWith(validObjectId);
    });
  });

  describe('getMicroTasks', () => {
    it('deve buscar micro-tarefas ordenadas', async () => {
      const result = await controller.getMicroTasks(validObjectId, 'doing');
      expect(result).toHaveLength(1);
      expect(taskModelMock.find).toHaveBeenCalledWith({ project: validObjectId, status: 'doing' });
    });
  });

  describe('getGanttData', () => {
    it('deve retornar dados do Gantt', async () => {
      const result = await controller.getGanttData(validObjectId, 'true');
      expect(result).toBeDefined();
      expect(projectsServiceMock.getGanttData).toHaveBeenCalledWith(validObjectId, { includeCompleted: true });
    });
  });

  describe('getPertDiagramData', () => {
    it('deve retornar dados do PERT', async () => {
      const result = await controller.getPertDiagramData(validObjectId, 'false');
      expect(result).toBeDefined();
      expect(projectsServiceMock.getPertDiagramData).toHaveBeenCalledWith(validObjectId, { includeCompleted: false });
    });
  });

  describe('createXMatrix', () => {
    it('deve criar matriz X', async () => {
      const result = await controller.createXMatrix(validObjectId, {} as any);
      expect(result).toBeDefined();
      expect(projectsServiceMock.createXMatrix).toHaveBeenCalledWith(validObjectId, {});
    });
  });

  describe('getSavedXMatrix', () => {
    it('deve retornar snapshot do XMatrix', async () => {
      const result = await controller.getSavedXMatrix(validObjectId);
      expect(result).toBeDefined();
      expect(projectsServiceMock.getSavedXMatrix).toHaveBeenCalledWith(validObjectId);
    });
  });

  describe('create', () => {
    it('deve criar novo projeto', async () => {
      const result = await controller.create({ name: 'Novo Projeto' } as any);
      expect(result._id).toBe(validObjectId);
    });
  });

  describe('findAll', () => {
    it('deve listar projetos', async () => {
      const result = await controller.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar projeto por ID', async () => {
      const result = await controller.findOne(validObjectId);
      expect(result._id).toBe(validObjectId);
    });
  });

  describe('update', () => {
    it('deve atualizar projeto', async () => {
      const result = await controller.update(validObjectId, { name: 'Atualizado' });
      expect(result._id).toBe(validObjectId);
    });
  });

  describe('remove', () => {
    it('deve remover projeto com deleteTasks opcional via query', async () => {
      const result = await controller.remove(validObjectId, 'true');
      expect(result.message).toContain('removed');
      expect(projectsServiceMock.removeWithOptions).toHaveBeenCalledWith(validObjectId, true);
    });
  });
});
