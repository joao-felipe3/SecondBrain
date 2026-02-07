export interface Task {
  _id: string
  name: string
  description?: string
  definitionOfDone?: string
  pomodorosDid?: number
  pomodorosPlanned: number
  deadline: Date
  priority?: number
  difficult?: number
  project?: string
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
  cognitiveMode?: string
  contextTag?: string
  themeTag?: string[]
}
