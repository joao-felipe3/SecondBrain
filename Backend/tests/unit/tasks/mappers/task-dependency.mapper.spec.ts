import { TaskDependencyMapper } from '../../../../src/tasks/mappers/task-dependency.mapper';
import { TaskDependency } from '../../../../src/tasks/entities/task-dependency.entity';
import { DependencyType } from '../../../../src/tasks/schemas/task-dependency.schema';
import { Types } from 'mongoose';

describe('TaskDependencyMapper', () => {
  describe('toDomain', () => {
    it('deve lançar erro se o documento for nulo ou indefinido', () => {
      expect(() => TaskDependencyMapper.toDomain(null as any)).toThrow(
        'TaskDependencyDocument is null or undefined',
      );
      expect(() => TaskDependencyMapper.toDomain(undefined as any)).toThrow(
        'TaskDependencyDocument is null or undefined',
      );
    });

    it('deve converter TaskDependencyDocument para a entidade TaskDependency', () => {
      const mockId = new Types.ObjectId();
      const mockTaskId = new Types.ObjectId();
      const mockDependsId = new Types.ObjectId();
      const mockProjectId = new Types.ObjectId();
      const now = new Date();

      const document = {
        _id: mockId,
        taskId: mockTaskId,
        dependsOnTaskId: mockDependsId,
        relationship: DependencyType.FINISH_TO_START,
        reason: 'Precedência lógica',
        projectId: mockProjectId,
        isAutoIdentified: true,
        createdAt: now,
        updatedAt: now,
      } as any;

      const domain = TaskDependencyMapper.toDomain(document);

      expect(domain).toBeInstanceOf(TaskDependency);
      expect(domain.id).toBe(mockId.toString());
      expect(domain.taskId).toBe(mockTaskId.toString());
      expect(domain.dependsOnTaskId).toBe(mockDependsId.toString());
      expect(domain.relationship).toBe(DependencyType.FINISH_TO_START);
      expect(domain.reason).toBe('Precedência lógica');
      expect(domain.projectId).toBe(mockProjectId.toString());
      expect(domain.isAutoIdentified).toBe(true);
      expect(domain.createdAt).toBe(now);
      expect(domain.updatedAt).toBe(now);
    });

    it('deve usar fallback de string id quando _id não existir', () => {
      const document = {
        id: 'dep-123',
        taskId: 't-1',
        dependsOnTaskId: 't-2',
        projectId: 'p-1',
      } as any;

      const domain = TaskDependencyMapper.toDomain(document);

      expect(domain.id).toBe('dep-123');
      expect(domain.taskId).toBe('t-1');
      expect(domain.dependsOnTaskId).toBe('t-2');
      expect(domain.projectId).toBe('p-1');
    });
  });

  describe('toPersistence', () => {
    it('deve lançar erro se a entidade for nula ou indefinida', () => {
      expect(() => TaskDependencyMapper.toPersistence(null as any)).toThrow(
        'TaskDependency entity is null or undefined',
      );
      expect(() => TaskDependencyMapper.toPersistence(undefined as any)).toThrow(
        'TaskDependency entity is null or undefined',
      );
    });

    it('deve converter a entidade em um objeto parcial de persistência', () => {
      const entity = new TaskDependency();
      entity.id = 'dep-1';
      entity.taskId = 't-10';
      entity.dependsOnTaskId = 't-20';
      entity.relationship = DependencyType.START_TO_START;
      entity.reason = 'Início simultâneo';
      entity.projectId = 'p-100';
      entity.isAutoIdentified = false;

      const persistence = TaskDependencyMapper.toPersistence(entity);

      expect(persistence._id).toBe('dep-1');
      expect(persistence.taskId).toBe('t-10');
      expect(persistence.dependsOnTaskId).toBe('t-20');
      expect(persistence.relationship).toBe(DependencyType.START_TO_START);
      expect(persistence.reason).toBe('Início simultâneo');
      expect(persistence.projectId).toBe('p-100');
      expect(persistence.isAutoIdentified).toBe(false);
    });
  });
});
