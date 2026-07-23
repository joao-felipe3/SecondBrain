import { Test, TestingModule } from '@nestjs/testing';
import { CPMController } from '../../../../src/tasks/controllers/cpm.controller';
import { CPMService } from '../../../../src/tasks/services/dependencies/cpm.service';
import { DependencyInferenceService } from '../../../../src/tasks/services/dependencies/dependency-inference.service';
import { BufferService } from '../../../../src/tasks/services/analysis/buffer.service';
import { TasksService } from '../../../../src/tasks/tasks.service';
import { DependencyType } from '../../../../src/tasks/schemas/task-dependency.schema';

describe('CPMController', () => {
  let controller: CPMController;
  let cpmServiceMock: any;
  let tasksServiceMock: any;
  let dependencyInferenceMock: any;
  let bufferServiceMock: any;

  beforeEach(async () => {
    cpmServiceMock = {
      addDependency: jest.fn().mockResolvedValue({
        id: 'dep-1',
        taskId: 't-1',
        dependsOnTaskId: 't-2',
        relationship: DependencyType.FINISH_TO_START,
        projectId: 'p-1',
      }),
      getDependencies: jest.fn().mockResolvedValue([]),
      removeDependency: jest.fn().mockResolvedValue(true),
      normalizeRelationship: jest.fn().mockReturnValue('FS'),
      calculateCriticalPath: jest.fn().mockReturnValue({
        criticalPath: ['t-1', 't-2'],
        projectDuration: 20,
        tasksByImpact: [],
        packageCriticality: [],
        alerts: [],
      }),
      upsertDependencies: jest.fn().mockResolvedValue([]),
    };

    tasksServiceMock = {
      findOne: jest.fn().mockResolvedValue({ id: 't-1', name: 'Task 1' }),
      findByProjectId: jest.fn().mockResolvedValue([
        { id: 't-1', name: 'Task 1', pertExpectedMinutes: 10, parentWbsNodeId: 'leaf-1' },
        { id: 't-2', name: 'Task 2', pertExpectedMinutes: 10, parentWbsNodeId: 'leaf-1' },
      ]),
    };

    dependencyInferenceMock = {
      inferHeuristicPhases: jest.fn().mockReturnValue([{ taskId: 't-2', dependsOnTaskId: 't-1' }]),
      inferWithAi: jest.fn().mockResolvedValue([{ taskId: 't-2', dependsOnTaskId: 't-1' }]),
      inferInterLeafWithAi: jest.fn().mockResolvedValue([]),
    };

    bufferServiceMock = {
      calculateProjectBuffer: jest.fn().mockResolvedValue({
        projectId: 'p-1',
        projectBuffer: 10,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CPMController],
      providers: [
        { provide: CPMService, useValue: cpmServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: DependencyInferenceService, useValue: dependencyInferenceMock },
        { provide: BufferService, useValue: bufferServiceMock },
      ],
    }).compile();

    controller = module.get<CPMController>(CPMController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('addDependency', () => {
    it('deve adicionar uma dependência', async () => {
      const dto = {
        taskId: 't-1',
        dependsOnTaskId: 't-2',
        relationship: DependencyType.FINISH_TO_START,
      };

      const result: any = await controller.addDependency('p-1', dto);

      expect(result.id).toBe('dep-1');
      expect(cpmServiceMock.addDependency).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p-1', taskId: 't-1' }),
      );
    });

    it('deve tratar exceção ao adicionar dependência', async () => {
      cpmServiceMock.addDependency.mockRejectedValueOnce(new Error('Erro dependência'));

      const dto = {
        taskId: 't-1',
        dependsOnTaskId: 't-2',
      };

      await expect(controller.addDependency('p-1', dto as any)).rejects.toThrow('Erro dependência');
    });
  });

  describe('getDependencies', () => {
    it('deve buscar dependências do projeto', async () => {
      cpmServiceMock.getDependencies.mockResolvedValueOnce([{ id: 'dep-1' }]);
      const result: any = await controller.getDependencies('p-1');

      expect(result.count).toBe(1);
      expect(cpmServiceMock.getDependencies).toHaveBeenCalledWith('p-1');
    });
  });

  describe('removeDependency', () => {
    it('deve remover uma dependência', async () => {
      const result: any = await controller.removeDependency('t-1', 't-2');

      expect(result.message).toContain('sucesso');
      expect(cpmServiceMock.removeDependency).toHaveBeenCalledWith('t-1', 't-2');
    });
  });

  describe('calculateCriticalPath', () => {
    it('deve calcular o caminho crítico do projeto', async () => {
      const result: any = await controller.calculateCriticalPath('p-1');

      expect(result.analysis.criticalPath).toEqual(['t-1', 't-2']);
      expect(result.analysis.projectDuration).toBe(20);
    });

    it('deve tratar erro no cálculo do caminho crítico', async () => {
      tasksServiceMock.findByProjectId.mockRejectedValueOnce(new Error('Erro busca tarefas'));

      await expect(controller.calculateCriticalPath('p-1')).rejects.toThrow('Erro busca tarefas');
    });
  });

  describe('autoInferDependencies', () => {
    it('deve inferir dependências por heurística sem persistir (apply=false)', async () => {
      const result: any = await controller.autoInferDependencies('p-1', {
        strategy: 'heuristic-phases',
        apply: false,
      });

      expect(result).toBeDefined();
      expect(dependencyInferenceMock.inferHeuristicPhases).toHaveBeenCalled();
    });

    it('deve inferir por IA e aplicar (apply=true)', async () => {
      const result: any = await controller.autoInferDependencies('p-1', {
        strategy: 'ai-per-leaf',
        apply: true,
      });

      expect(result).toBeDefined();
      expect(dependencyInferenceMock.inferWithAi).toHaveBeenCalled();
      expect(cpmServiceMock.upsertDependencies).toHaveBeenCalled();
    });
  });
});
