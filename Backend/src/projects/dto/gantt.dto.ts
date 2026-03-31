export interface GanttTaskItem {
  id: string
  name: string
  startDate: string
  endDate: string
  durationHours: number
  earlyStart: number
  earlyFinish: number
  lateStart: number
  lateFinish: number
  slack: number
  isCritical: boolean
  progress: number
  isConcluded: boolean
  priority: number
  parentWbsNodeId?: string
  wbsPath?: string
}

export interface GanttDependencyItem {
  id: string
  fromTaskId: string
  toTaskId: string
  relationship: 'finish-to-start' | 'start-to-start' | 'finish-to-finish'
  reason?: string
  isAutoIdentified: boolean
}

export interface GanttDataResponse {
  projectId: string
  projectName: string
  projectStartDate: string
  projectDeadline: string | null
  projectDurationHours: number
  tasks: GanttTaskItem[]
  dependencies: GanttDependencyItem[]
  criticalPath: string[]
  alerts: string[]
  diagnostics?: Record<string, any>
}
