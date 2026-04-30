export interface ChecklistItem {
  item: string
  completed: boolean
  order: number
}

export interface RecurringRule {
  frequency: string
  interval: number
  daysOfWeek?: number[]
  endDate?: Date
  exceptions?: Date[]
}

export interface Task {
  _id: string
  name: string
  description?: string
  definitionOfDone?: string
  checklist?: Array<string | ChecklistItem>
  pomodorosDid?: number
  pomodorosPlanned: number
  pertOptimisticMinutes?: number
  pertMostLikelyMinutes?: number
  pertPessimisticMinutes?: number
  pertExpectedMinutes?: number
  pertVariance?: number
  requirementIds?: string[]
  journeyItemIds?: string[];
  rtmRisk?: boolean
  rtmRiskReason?: string
  evmProgress?: number
  evmPlannedValueMinutes?: number
  evmEarnedValueMinutes?: number
  evmSchedulePerformanceIndex?: number
  evmAlert?: string
  deadline: Date
  priority?: number
  difficult?: number
  project?: string
  parentTaskId?: string
  parentWbsNodeId?: string
  wbsPath?: string
  generationBatchId?: string
  milestoneId?: string
  experience: number
  isConcluded: boolean
  late: boolean
  prize: number
  recurrency: string
  notification: Date
  microTaskType?: string
  parentRecurringId?: string
  isRecurringInstance?: boolean
  recurringRule?: RecurringRule
  cognitiveMode?: string
  contextTag?: string
  themeTag?: string[]
  createdAt?: Date
  // Sprint 4: Kanban persistence
  status?: 'todo' | 'doing' | 'review' | 'done'
  statusUpdatedAt?: Date
  kanbanOrder?: number
}
