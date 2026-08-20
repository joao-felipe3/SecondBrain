export interface TaskChecklistItem {
  item: string;
  completed: boolean;
  order: number;
}

export interface TaskRecurringRule {
  frequency: string;
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  exceptions?: Array<Date | { date: Date; reason?: string }>;
}

export interface TaskOperationalInfo {
  name: string;
  description?: string;
  definitionOfDone?: string;
  deadline: Date;
  priority?: number;
  difficult?: number;
  status?: 'todo' | 'doing' | 'review' | 'done';
  statusUpdatedAt?: Date;
  kanbanOrder?: number;
  isConcluded: boolean;
  late: boolean;
  microTaskType?: string;
  cognitiveMode?: string;
  contextTag?: string;
  themeTag?: string[];
  notification: Date;
  createdAt?: Date;
}

export interface TaskPertMetrics {
  pertOptimisticMinutes?: number;
  pertMostLikelyMinutes?: number;
  pertPessimisticMinutes?: number;
  pertExpectedMinutes?: number;
  pertVariance?: number;
}

export interface TaskEvmMetrics {
  evmProgress?: number;
  evmPlannedValueMinutes?: number;
  evmEarnedValueMinutes?: number;
  evmSchedulePerformanceIndex?: number;
  evmAlert?: string;
}

export interface TaskTraceability {
  project?: string;
  parentTaskId?: string;
  parentWbsNodeId?: string;
  wbsPath?: string;
  generationBatchId?: string;
  milestoneId?: string;
  requirementIds?: string[];
  journeyItemIds?: string[];
  rtmRisk?: boolean;
  rtmRiskReason?: string;
}

export interface TaskGamification {
  pomodorosPlanned: number;
  pomodorosDid?: number;
  experience: number;
  prize: number;
}

export interface TaskRecurrence {
  recurrency: string;
  parentRecurringId?: string;
  isRecurringInstance?: boolean;
  recurringState?: 'pending' | 'completed' | 'skipped';
  recurringRule?: TaskRecurringRule;
}

export interface TaskChecklistContext {
  checklist?: Array<string | TaskChecklistItem>;
}

export type TaskDomainEntity = TaskOperationalInfo &
  TaskPertMetrics &
  TaskEvmMetrics &
  TaskTraceability &
  TaskGamification &
  TaskRecurrence &
  TaskChecklistContext & {
    _id?: unknown;
    id?: string;
  };

export type TaskGanttContext = Pick<
  TaskOperationalInfo,
  'name' | 'deadline' | 'createdAt' | 'status' | 'isConcluded' | 'priority'
> &
  TaskPertMetrics &
  TaskTraceability &
  Pick<TaskEvmMetrics, 'evmProgress'> &
  Pick<TaskGamification, 'pomodorosPlanned' | 'pomodorosDid'> & {
    _id?: unknown;
    id?: string;
  };

export type TaskPertContext = Pick<
  TaskOperationalInfo,
  'name' | 'deadline' | 'createdAt' | 'isConcluded' | 'priority'
> &
  TaskPertMetrics &
  TaskTraceability &
  Pick<TaskEvmMetrics, 'evmProgress'> & {
    _id?: unknown;
    id?: string;
  };

export type TaskXMatrixContext = Pick<TaskOperationalInfo, 'name' | 'description' | 'isConcluded'> &
  TaskTraceability &
  Pick<TaskGamification, 'pomodorosPlanned' | 'pomodorosDid'> & {
    _id?: unknown;
    id?: string;
  };
