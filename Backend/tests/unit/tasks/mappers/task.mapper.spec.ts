import { TaskMapper } from '../../../../src/tasks/mappers/task.mapper';
import { Task } from '../../../../src/tasks/entities/task.entity';
import { Types } from 'mongoose';

describe('TaskMapper', () => {
  describe('toDomain', () => {
    it('deve lançar erro se o documento for nulo ou indefinido', () => {
      expect(() => TaskMapper.toDomain(null as any)).toThrow('TaskDocument is null or undefined');
      expect(() => TaskMapper.toDomain(undefined as any)).toThrow('TaskDocument is null or undefined');
    });

    it('deve converter TaskDocument completo para a entidade Task', () => {
      const mockId = new Types.ObjectId();
      const mockProjectId = new Types.ObjectId();
      const mockParentId = new Types.ObjectId();
      const now = new Date();

      const document = {
        _id: mockId,
        name: 'Minha Tarefa',
        description: 'Descrição da tarefa',
        definitionOfDone: 'Critérios de aceite',
        checklist: [{ item: 'Check 1', completed: true }],
        pomodorosDid: 2,
        pomodorosPlanned: 4,
        pertOptimisticMinutes: 30,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 120,
        pertExpectedMinutes: 65,
        pertVariance: 25,
        requirementIds: ['req-1'],
        journeyItemIds: ['j-1'],
        rtmRisk: 'low',
        rtmRiskReason: 'Baixo risco',
        evmProgress: 50,
        evmPlannedValueMinutes: 120,
        evmEarnedValueMinutes: 60,
        evmSchedulePerformanceIndex: 0.8,
        evmAlert: 'atraso leve',
        deadline: now,
        priority: 'high',
        difficult: 'easy',
        project: mockProjectId,
        parentTaskId: mockParentId,
        parentWbsNodeId: 'wbs-1',
        wbsPath: '1.1',
        generationBatchId: 'batch-1',
        milestoneId: 'm-1',
        experience: 10,
        isConcluded: true,
        late: false,
        prize: 5,
        recurrency: 'no-recurrence',
        notification: now,
        microTaskType: 'subtask',
        parentRecurringId: mockParentId,
        isRecurringInstance: false,
        recurringState: 'active',
        recurringRule: { frequency: 'daily', interval: 1 },
        cognitiveMode: 'focused',
        contextTag: 'work',
        themeTag: 'backend',
        createdAt: now,
      } as any;

      const domain = TaskMapper.toDomain(document);

      expect(domain).toBeInstanceOf(Task);
      expect(domain.id).toBe(mockId.toString());
      expect(domain.name).toBe('Minha Tarefa');
      expect(domain.project).toBe(mockProjectId.toString());
      expect(domain.parentTaskId).toBe(mockParentId.toString());
      expect(domain.parentRecurringId).toBe(mockParentId.toString());
      expect(domain.isConcluded).toBe(true);
    });

    it('deve usar fallback de string id quando _id não existir', () => {
      const document = {
        id: 'string-id-123',
        name: 'Tarefa com string id',
      } as any;

      const domain = TaskMapper.toDomain(document);

      expect(domain.id).toBe('string-id-123');
    });

    it('deve lidar com campos opcionais indefinidos', () => {
      const document = {
        _id: new Types.ObjectId(),
        name: 'Tarefa Básica',
      } as any;

      const domain = TaskMapper.toDomain(document);

      expect(domain.project).toBeUndefined();
      expect(domain.parentTaskId).toBeUndefined();
      expect(domain.parentRecurringId).toBeUndefined();
    });
  });

  describe('toPersistence', () => {
    it('deve lançar erro se a entidade for nula ou indefinida', () => {
      expect(() => TaskMapper.toPersistence(null as any)).toThrow('Task entity is null or undefined');
      expect(() => TaskMapper.toPersistence(undefined as any)).toThrow('Task entity is null or undefined');
    });

    it('deve converter a entidade Task em um documento parcial de persistência', () => {
      const entity = new Task();
      entity.id = 'task-id-1';
      entity.name = 'Nome de teste';
      entity.description = 'Desc de teste';
      entity.pomodorosPlanned = 3;
      entity.priority = 2;
      entity.difficult = 1;

      const persistence = TaskMapper.toPersistence(entity);

      expect(persistence._id).toBe('task-id-1');
      expect(persistence.name).toBe('Nome de teste');
      expect(persistence.description).toBe('Desc de teste');
      expect(persistence.pomodorosPlanned).toBe(3);
      expect(persistence.priority).toBe(2);
    });
  });
});
