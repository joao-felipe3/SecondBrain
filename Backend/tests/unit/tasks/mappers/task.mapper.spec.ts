import { Types } from 'mongoose';
import { TaskMapper } from '@src/tasks/mappers/task.mapper';
import { Task } from '@src/tasks/entities/task.entity';

describe('TaskMapper', () => {
  const mockObjectId = new Types.ObjectId();

  it('toDomain: should map all TaskDocument fields to Task domain entity', () => {
    const doc: any = {
      _id: mockObjectId,
      name: 'Task 1',
      description: 'Desc',
      definitionOfDone: 'DoD',
      checklist: ['step 1'],
      pomodorosDid: 1,
      pomodorosPlanned: 4,
      pertOptimisticMinutes: 30,
      pertMostLikelyMinutes: 60,
      pertPessimisticMinutes: 120,
      pertExpectedMinutes: 65,
      pertVariance: 225,
      requirementIds: ['r1'],
      journeyItemIds: ['j1'],
      rtmRisk: false,
      rtmRiskReason: undefined,
      evmProgress: 0.25,
      evmPlannedValueMinutes: 100,
      evmEarnedValueMinutes: 25,
      evmSchedulePerformanceIndex: 1.0,
      evmAlert: undefined,
      deadline: new Date(),
      priority: 2,
      difficult: 3,
      project: mockObjectId,
      parentTaskId: mockObjectId,
      parentWbsNodeId: 'wbs1',
      wbsPath: '1.1',
      generationBatchId: 'batch1',
      milestoneId: 'm1',
      experience: 50,
      isConcluded: false,
      late: false,
      prize: 'Prize',
      recurrency: 'none',
      notification: true,
      microTaskType: 'code',
      parentRecurringId: mockObjectId,
      isRecurringInstance: true,
      recurringState: 'active',
      recurringRule: { frequency: 'daily' },
      cognitiveMode: 'deep',
      contextTag: 'dev',
      themeTag: 'backend',
      createdAt: new Date(),
    };

    const domain = TaskMapper.toDomain(doc);
    expect(domain.id).toBe(mockObjectId.toString());
    expect(domain.name).toBe('Task 1');
    expect(domain.project).toBe(mockObjectId.toString());
    expect(domain.parentRecurringId).toBe(mockObjectId.toString());
    expect(domain.cognitiveMode).toBe('deep');
  });

  it('toDomain: fallback ID handling when _id is string or number', () => {
    const docStringId: any = { id: 'str-123', name: 'Task String ID' };
    const domain1 = TaskMapper.toDomain(docStringId);
    expect(domain1.id).toBe('str-123');
  });

  it('toDomain: should throw Error when document is null or undefined', () => {
    expect(() => TaskMapper.toDomain(null as any)).toThrow('TaskDocument is null or undefined');
  });

  it('toPersistence: should map all Task entity fields to persistence document', () => {
    const entity = new Task();
    entity.id = mockObjectId.toString();
    entity.name = 'Task 1';
    entity.description = 'Desc';
    entity.definitionOfDone = 'DoD';
    entity.checklist = ['step 1'];
    entity.pomodorosDid = 1;
    entity.pomodorosPlanned = 4;
    entity.pertOptimisticMinutes = 30;
    entity.pertMostLikelyMinutes = 60;
    entity.pertPessimisticMinutes = 120;
    entity.pertExpectedMinutes = 65;
    entity.pertVariance = 225;
    entity.requirementIds = ['r1'];
    entity.journeyItemIds = ['j1'];
    entity.rtmRisk = false;
    entity.rtmRiskReason = undefined;
    entity.evmProgress = 0.25;
    entity.evmPlannedValueMinutes = 100;
    entity.evmEarnedValueMinutes = 25;
    entity.evmSchedulePerformanceIndex = 1.0;
    entity.evmAlert = undefined;
    entity.deadline = new Date();
    entity.priority = 2;
    entity.difficult = 3;
    entity.project = mockObjectId.toString();
    entity.parentTaskId = mockObjectId.toString();
    entity.parentWbsNodeId = 'wbs1';
    entity.wbsPath = '1.1';
    entity.generationBatchId = 'batch1';
    entity.milestoneId = 'm1';
    entity.experience = 50;
    entity.isConcluded = false;
    entity.late = false;
    entity.prize = 10;
    entity.recurrency = 'none';
    entity.notification = new Date();
    entity.microTaskType = 'code';
    entity.parentRecurringId = mockObjectId.toString();
    entity.isRecurringInstance = true;
    entity.recurringState = 'pending';
    entity.recurringRule = { frequency: 'daily' } as any;
    entity.cognitiveMode = 'deep';
    entity.contextTag = 'dev';
    entity.themeTag = ['backend'];
    entity.createdAt = new Date();

    const doc = TaskMapper.toPersistence(entity);
    expect(doc._id).toBe(mockObjectId.toString());
    expect(doc.name).toBe('Task 1');
    expect(doc.pertExpectedMinutes).toBe(65);
    expect(doc.parentRecurringId).toBe(mockObjectId.toString());
  });

  it('toPersistence: should throw Error when entity is null or undefined', () => {
    expect(() => TaskMapper.toPersistence(null as any)).toThrow('Task entity is null or undefined');
  });
});
