import { RequirementMapper } from '../../../../src/tasks/mappers/requirement.mapper';
import { Requirement } from '../../../../src/tasks/entities/requirement.entity';
import { Types } from 'mongoose';

describe('RequirementMapper', () => {
  describe('toDomain', () => {
    it('deve lançar erro se o documento for nulo ou indefinido', () => {
      expect(() => RequirementMapper.toDomain(null as any)).toThrow(
        'RequirementDocument is null or undefined',
      );
      expect(() => RequirementMapper.toDomain(undefined as any)).toThrow(
        'RequirementDocument is null or undefined',
      );
    });

    it('deve converter RequirementDocument para a entidade Requirement', () => {
      const mockId = new Types.ObjectId();
      const mockProjectId = new Types.ObjectId();
      const mockParentId = new Types.ObjectId();
      const mockTraceable1 = new Types.ObjectId();
      const mockTraceable2 = new Types.ObjectId();
      const now = new Date();

      const document = {
        _id: mockId,
        projectId: mockProjectId,
        description: 'Autenticação multifator',
        type: 'functional',
        kind: 'security',
        parentItemId: mockParentId,
        hierarchyLevel: 2,
        title: 'MFA',
        traceableItems: [mockTraceable1],
        traceableActionItems: [mockTraceable2],
        source: 'smart_objective',
        status: 'satisfied',
        createdAt: now,
        updatedAt: now,
      } as any;

      const domain = RequirementMapper.toDomain(document);

      expect(domain).toBeInstanceOf(Requirement);
      expect(domain.id).toBe(mockId.toString());
      expect(domain.projectId).toBe(mockProjectId.toString());
      expect(domain.description).toBe('Autenticação multifator');
      expect(domain.type).toBe('functional');
      expect(domain.kind).toBe('security');
      expect(domain.parentItemId).toBe(mockParentId.toString());
      expect(domain.hierarchyLevel).toBe(2);
      expect(domain.title).toBe('MFA');
      expect(domain.traceableItems).toEqual([mockTraceable1.toString()]);
      expect(domain.traceableActionItems).toEqual([mockTraceable2.toString()]);
      expect(domain.source).toBe('smart_objective');
      expect(domain.status).toBe('satisfied');
      expect(domain.createdAt).toBe(now);
      expect(domain.updatedAt).toBe(now);
    });

    it('deve utilizar fallback de id em string quando _id for nulo', () => {
      const document = {
        id: 'req-str-1',
        projectId: 'p-1',
        description: 'Req sem _id',
      } as any;

      const domain = RequirementMapper.toDomain(document);

      expect(domain.id).toBe('req-str-1');
      expect(domain.traceableItems).toEqual([]);
      expect(domain.traceableActionItems).toEqual([]);
    });
  });

  describe('toPersistence', () => {
    it('deve lançar erro se a entidade for nula ou indefinida', () => {
      expect(() => RequirementMapper.toPersistence(null as any)).toThrow(
        'Requirement entity is null or undefined',
      );
      expect(() => RequirementMapper.toPersistence(undefined as any)).toThrow(
        'Requirement entity is null or undefined',
      );
    });

    it('deve converter a entidade Requirement em um objeto parcial de persistência', () => {
      const entity = new Requirement();
      entity.id = 'req-99';
      entity.projectId = 'proj-99';
      entity.description = 'Requisito de performance';
      entity.type = 'non_functional';
      entity.status = 'open';
      entity.traceableItems = ['task-1', 'task-2'];

      const persistence = RequirementMapper.toPersistence(entity);

      expect(persistence._id).toBe('req-99');
      expect(persistence.projectId).toBe('proj-99');
      expect(persistence.description).toBe('Requisito de performance');
      expect(persistence.type).toBe('non_functional');
      expect(persistence.status).toBe('open');
      expect(persistence.traceableItems).toEqual(['task-1', 'task-2']);
    });
  });
});
