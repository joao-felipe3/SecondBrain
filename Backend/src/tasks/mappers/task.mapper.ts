import { TaskDocument } from '../schemas/task.schema';
import { Task } from '../entities/task.entity';

export class TaskMapper {
  static toDomain(document: TaskDocument): Task {
    if (!document) {
      throw new Error('TaskDocument is null or undefined');
    }

    const entity = new Task();
    entity.id = document._id ? document._id.toString() : document.id;
    entity.name = document.name;
    entity.description = document.description;
    entity.definitionOfDone = document.definitionOfDone;
    entity.checklist = document.checklist;
    entity.pomodorosDid = document.pomodorosDid;
    entity.pomodorosPlanned = document.pomodorosPlanned;
    entity.pertOptimisticMinutes = document.pertOptimisticMinutes;
    entity.pertMostLikelyMinutes = document.pertMostLikelyMinutes;
    entity.pertPessimisticMinutes = document.pertPessimisticMinutes;
    entity.pertExpectedMinutes = document.pertExpectedMinutes;
    entity.pertVariance = document.pertVariance;
    entity.requirementIds = document.requirementIds;
    entity.journeyItemIds = document.journeyItemIds;
    entity.rtmRisk = document.rtmRisk;
    entity.rtmRiskReason = document.rtmRiskReason;
    entity.evmProgress = document.evmProgress;
    entity.evmPlannedValueMinutes = document.evmPlannedValueMinutes;
    entity.evmEarnedValueMinutes = document.evmEarnedValueMinutes;
    entity.evmSchedulePerformanceIndex = document.evmSchedulePerformanceIndex;
    entity.evmAlert = document.evmAlert;
    entity.deadline = document.deadline;
    entity.priority = document.priority;
    entity.difficult = document.difficult;
    entity.project = document.project ? document.project.toString() : undefined;
    entity.parentTaskId = document.parentTaskId ? document.parentTaskId.toString() : undefined;
    entity.parentWbsNodeId = document.parentWbsNodeId;
    entity.wbsPath = document.wbsPath;
    entity.generationBatchId = document.generationBatchId;
    entity.milestoneId = document.milestoneId;
    entity.experience = document.experience;
    entity.isConcluded = document.isConcluded;
    entity.late = document.late;
    entity.prize = document.prize;
    entity.recurrency = document.recurrency;
    entity.notification = document.notification;
    entity.microTaskType = document.microTaskType;
    entity.parentRecurringId = document.parentRecurringId ? document.parentRecurringId.toString() : undefined;
    entity.isRecurringInstance = document.isRecurringInstance;
    entity.recurringState = document.recurringState;
    entity.recurringRule = document.recurringRule;
    entity.cognitiveMode = document.cognitiveMode;
    entity.contextTag = document.contextTag;
    entity.themeTag = document.themeTag;
    entity.createdAt = document.createdAt;

    return entity;
  }

  static toPersistence(entity: Task): Partial<TaskDocument> {
    if (!entity) {
      throw new Error('Task entity is null or undefined');
    }

    const document: any = {};
    if (entity.id) document._id = entity.id;
    if (entity.name !== undefined) document.name = entity.name;
    if (entity.description !== undefined) document.description = entity.description;
    if (entity.definitionOfDone !== undefined) document.definitionOfDone = entity.definitionOfDone;
    if (entity.checklist !== undefined) document.checklist = entity.checklist;
    if (entity.pomodorosDid !== undefined) document.pomodorosDid = entity.pomodorosDid;
    if (entity.pomodorosPlanned !== undefined) document.pomodorosPlanned = entity.pomodorosPlanned;
    if (entity.pertOptimisticMinutes !== undefined) document.pertOptimisticMinutes = entity.pertOptimisticMinutes;
    if (entity.pertMostLikelyMinutes !== undefined) document.pertMostLikelyMinutes = entity.pertMostLikelyMinutes;
    if (entity.pertPessimisticMinutes !== undefined) document.pertPessimisticMinutes = entity.pertPessimisticMinutes;
    if (entity.pertExpectedMinutes !== undefined) document.pertExpectedMinutes = entity.pertExpectedMinutes;
    if (entity.pertVariance !== undefined) document.pertVariance = entity.pertVariance;
    if (entity.requirementIds !== undefined) document.requirementIds = entity.requirementIds;
    if (entity.journeyItemIds !== undefined) document.journeyItemIds = entity.journeyItemIds;
    if (entity.rtmRisk !== undefined) document.rtmRisk = entity.rtmRisk;
    if (entity.rtmRiskReason !== undefined) document.rtmRiskReason = entity.rtmRiskReason;
    if (entity.evmProgress !== undefined) document.evmProgress = entity.evmProgress;
    if (entity.evmPlannedValueMinutes !== undefined) document.evmPlannedValueMinutes = entity.evmPlannedValueMinutes;
    if (entity.evmEarnedValueMinutes !== undefined) document.evmEarnedValueMinutes = entity.evmEarnedValueMinutes;
    if (entity.evmSchedulePerformanceIndex !== undefined) document.evmSchedulePerformanceIndex = entity.evmSchedulePerformanceIndex;
    if (entity.evmAlert !== undefined) document.evmAlert = entity.evmAlert;
    if (entity.deadline !== undefined) document.deadline = entity.deadline;
    if (entity.priority !== undefined) document.priority = entity.priority;
    if (entity.difficult !== undefined) document.difficult = entity.difficult;
    if (entity.project !== undefined) document.project = entity.project;
    if (entity.parentTaskId !== undefined) document.parentTaskId = entity.parentTaskId;
    if (entity.parentWbsNodeId !== undefined) document.parentWbsNodeId = entity.parentWbsNodeId;
    if (entity.wbsPath !== undefined) document.wbsPath = entity.wbsPath;
    if (entity.generationBatchId !== undefined) document.generationBatchId = entity.generationBatchId;
    if (entity.milestoneId !== undefined) document.milestoneId = entity.milestoneId;
    if (entity.experience !== undefined) document.experience = entity.experience;
    if (entity.isConcluded !== undefined) document.isConcluded = entity.isConcluded;
    if (entity.late !== undefined) document.late = entity.late;
    if (entity.prize !== undefined) document.prize = entity.prize;
    if (entity.recurrency !== undefined) document.recurrency = entity.recurrency;
    if (entity.notification !== undefined) document.notification = entity.notification;
    if (entity.microTaskType !== undefined) document.microTaskType = entity.microTaskType;
    if (entity.parentRecurringId !== undefined) document.parentRecurringId = entity.parentRecurringId;
    if (entity.isRecurringInstance !== undefined) document.isRecurringInstance = entity.isRecurringInstance;
    if (entity.recurringState !== undefined) document.recurringState = entity.recurringState;
    if (entity.recurringRule !== undefined) document.recurringRule = entity.recurringRule;
    if (entity.cognitiveMode !== undefined) document.cognitiveMode = entity.cognitiveMode;
    if (entity.contextTag !== undefined) document.contextTag = entity.contextTag;
    if (entity.themeTag !== undefined) document.themeTag = entity.themeTag;
    if (entity.createdAt !== undefined) document.createdAt = entity.createdAt;

    return document;
  }
}
