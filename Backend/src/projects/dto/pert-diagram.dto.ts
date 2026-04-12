export interface PertDiagramNode {
  id: string
  name: string
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
  x: number
  y: number
}

export interface PertDiagramEdge {
  id: string
  source: string
  target: string
  relationship: 'finish-to-start' | 'start-to-start' | 'finish-to-finish'
  reason?: string
  isAutoIdentified: boolean
  isCriticalEdge: boolean
}

export interface PertDiagramStatistics {
  totalTasks: number
  criticalTasks: number
  criticalPercent: number
  totalEdges: number
  maxParallelism: number
}

export interface PertDiagramDataResponse {
  projectId: string
  projectName: string
  projectDurationHours: number
  nodes: PertDiagramNode[]
  edges: PertDiagramEdge[]
  criticalPath: string[]
  alerts: string[]
  statistics: PertDiagramStatistics
  diagnostics?: Record<string, any>
  packageCriticality?: Array<{
    packageId: string
    packagePath?: string
    taskCount: number
    criticalTaskCount: number
    criticalRatio: number
    minSlack: number
    criticalDuration: number
    criticalPathTaskCount: number
    score: number
  }>
}
