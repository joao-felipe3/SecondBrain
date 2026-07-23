import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CPMService } from '../../../../../src/tasks/services/dependencies/cpm.service';
import { DependencyType } from '../../../../../src/tasks/schemas/task-dependency.schema';

describe('CPMService', () => {
  let service: CPMService;
  let dependencyModelMock: any;

  beforeEach(async () => {
    dependencyModelMock = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ _id: 'dep-1', ...dto })),
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 1 }),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'dep-1', taskId: 't1', dependsOnTaskId: 't2', projectId: 'p-1', relationship: 'FS' },
        ]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CPMService,
        { provide: getModelToken('TaskDependency'), useValue: dependencyModelMock },
      ],
    }).compile();

    service = module.get<CPMService>(CPMService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addDependency', () => {
    it('deve adicionar uma dependência entre tarefas', async () => {
      const dto: any = {
        taskId: 't1',
        dependsOnTaskId: 't2',
        projectId: 'p-1',
        relationship: DependencyType.FINISH_TO_START,
      };

      const result = await service.addDependency(dto);

      expect(result).toBeDefined();
      expect(dependencyModelMock.create).toHaveBeenCalled();
    });
  });

  describe('upsertDependencies', () => {
    it('deve fazer o upsert de dependências em lote', async () => {
      const deps: any[] = [
        { taskId: 't1', dependsOnTaskId: 't2', projectId: 'p-1', relationship: DependencyType.FINISH_TO_START },
      ];

      const count = await service.upsertDependencies(deps);

      expect(count).toBe(2);
      expect(dependencyModelMock.bulkWrite).toHaveBeenCalled();
    });
  });

  describe('removeDependency', () => {
    it('deve remover dependência entre duas tarefas', async () => {
      await service.removeDependency('t1', 't2');

      expect(dependencyModelMock.deleteOne).toHaveBeenCalledWith({ taskId: 't1', dependsOnTaskId: 't2' });
    });
  });

  describe('getDependencies', () => {
    it('deve buscar dependências do projeto', async () => {
      const result = await service.getDependencies('p-1');

      expect(result).toHaveLength(1);
      expect(dependencyModelMock.find).toHaveBeenCalledWith({ projectId: 'p-1' });
    });
  });
});
