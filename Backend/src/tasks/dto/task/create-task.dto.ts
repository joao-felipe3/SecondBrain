import { Types } from 'mongoose';

export interface ChecklistItemDto {
  item: string;
  completed?: boolean;
  order?: number;
}

export interface RecurringExceptionDto {
  date: Date;
  reason?: string;
}

export interface RecurringRuleDto {
  frequency: string;
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  exceptions?: Array<Date | RecurringExceptionDto>;
}

export class CreateTaskDto {
  name!: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: Array<string | ChecklistItemDto>;
  pomodorosPlanned!: number;
  pomodorosDid?: number;
  pertOptimisticMinutes?: number;
  pertMostLikelyMinutes?: number;
  pertPessimisticMinutes?: number;
  pertExpectedMinutes?: number;
  pertVariance?: number;
  requirementIds?: string[];
  journeyItemIds?: string[];
  rtmRisk?: boolean;
  rtmRiskReason?: string;
  evmProgress?: number;
  evmPlannedValueMinutes?: number;
  evmEarnedValueMinutes?: number;
  evmSchedulePerformanceIndex?: number;
  evmAlert?: string;
  deadline!: Date;
  priority?: number;
  difficult?: number;
  project!: string | Types.ObjectId;
  parentTaskId?: string | Types.ObjectId;
  parentWbsNodeId?: string;
  wbsPath?: string;
  generationBatchId?: string;
  milestoneId?: string;
  experience?: number; // Calculado automaticamente: priority * 2 + difficult * 5
  isConcluded!: boolean;
  late!: boolean;
  prize?: number; // Calculado automaticamente: priority * 5 + difficult * 2
  recurrency!: string;
  notification!: Date;
  microTaskType?: string;
  parentRecurringId?: string | Types.ObjectId;
  isRecurringInstance?: boolean;
  recurringState?: 'pending' | 'completed' | 'skipped';
  recurringRule?: RecurringRuleDto;
  cognitiveMode?: string;
  contextTag?: string;
  themeTag?: string[];
  status?: 'todo' | 'doing' | 'review' | 'done';
}

export interface RecurringTaskOccurrenceDto extends CreateTaskDto {
  kanbanOrder: number;
  statusUpdatedAt: Date;
}
