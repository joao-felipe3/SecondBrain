import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InternalServerErrorException } from '@nestjs/common';
import { CPMService, TaskNode } from '../../../../../src/tasks/services/dependencies/cpm.service';
import { TaskDependency } from '../../../../../src/tasks/schemas/task-dependency.schema';

describe('CPMService', () => {
  let service: CPMService;
  let mockDependencyModel: {
    create: jest.Mock;
    bulkWrite: jest.Mock;
    deleteOne: jest.Mock;
    deleteMany: jest.Mock;
    find: jest.Mock;
  };

  const projectId = 'project-123';

  beforeEach(async () => {
    mockDependencyModel = {
      create: jest.fn(),
      bulkWrite: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CPMService,
        {
          provide: getModelToken(TaskDependency.name),
          useValue: mockDependencyModel,
        },
      ],
    }).compile();

    service = module.get<CPMService>(CPMService);
  });

  describe('CRUD Operations', () => {
    it('deve adicionar uma dependencia com sucesso', async () => {
      const dto = {
        taskId: 't2',
        dependsOnTaskId: 't1',
        projectId,
        relationship: 'FINISH_TO_START' as const,
      };

      const mockDoc = {
        _id: 'dep-1',
        ...dto,
        toObject: () => ({ _id: 'dep-1', ...dto }),
      };

      mockDependencyModel.create.mockResolvedValue(mockDoc);

      const result = await service.addDependency(dto as any);
      expect(result).toBeDefined();
      expect(mockDependencyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 't2', dependsOnTaskId: 't1' }),
      );
    });

    it('deve lancar InternalServerErrorException ao falhar addDependency', async () => {
      mockDependencyModel.create.mockRejectedValue(new Error('DB Error'));

      await expect(
        service.addDependency({ taskId: 't2', dependsOnTaskId: 't1', projectId } as any),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('deve realizar upsert em massa de dependencias', async () => {
      const deps = [
        { taskId: 't2', dependsOnTaskId: 't1', projectId },
        { taskId: 't3', dependsOnTaskId: 't2', projectId },
      ];

      mockDependencyModel.bulkWrite.mockResolvedValue({
        upsertedCount: 1,
        modifiedCount: 1,
      });

      const count = await service.upsertDependencies(deps as any);
      expect(count).toBe(2);
      expect(mockDependencyModel.bulkWrite).toHaveBeenCalledTimes(1);
    });

    it('deve retornar 0 no upsert se a lista for vazia', async () => {
      const count = await service.upsertDependencies([]);
      expect(count).toBe(0);
    });

    it('deve remover dependencia por taskId e dependsOnTaskId', async () => {
      mockDependencyModel.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      });

      await service.removeDependency('t2', 't1');
      expect(mockDependencyModel.deleteOne).toHaveBeenCalledWith({ taskId: 't2', dependsOnTaskId: 't1' });
    });

    it('deve buscar dependencias de um projeto', async () => {
      const mockDocs = [
        { _id: 'dep-1', taskId: 't2', dependsOnTaskId: 't1', projectId, toObject: () => ({ _id: 'dep-1', taskId: 't2', dependsOnTaskId: 't1', projectId }) },
      ];

      mockDependencyModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDocs),
      });

      const result = await service.getDependencies(projectId);
      expect(result).toHaveLength(1);
    });

    it('deve remover dependencias por IDs', async () => {
      mockDependencyModel.deleteMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      });

      const count = await service.removeDependenciesByIds(['dep-1', 'dep-2']);
      expect(count).toBe(2);
    });

    it('deve retornar 0 se IDs vazios forem passados', async () => {
      const count = await service.removeDependenciesByIds([]);
      expect(count).toBe(0);
    });
  });

  describe('calculateCriticalPath - Método do Caminho Crítico', () => {
    it('deve identificar o caminho crítico para tarefas em série', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Design', duration: 120, dependencies: [] },
        { id: 'B', name: 'Desenvolvimento', duration: 300, dependencies: ['A'] },
        { id: 'C', name: 'Testes', duration: 120, dependencies: ['B'] },
      ];

      const result = service.calculateCriticalPath(tasks as any);
      expect(result).toBeDefined();
      expect(result.criticalPath).toContain('A');
      expect(result.criticalPath).toContain('B');
      expect(result.criticalPath).toContain('C');
    });

    it('deve calcular métricas de uma tarefa individual', () => {
      const task: TaskNode = { id: 'A', name: 'Design', duration: 120, dependencies: [] };
      const metrics = service.getTaskMetrics(task as any);
      expect(metrics).toBeDefined();
    });
  });
});
