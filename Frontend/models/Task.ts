export interface Task {
  _id: string
  name: string
  description?: string
  pomodorosDid?: number
  pomodorosPlanned: number
  deadline: Date
  priority?: number
  difficult?: number
  project?: string
  experience: number
  isConcluded: boolean
  late: boolean
  prize: number
  recurrency: string
  notification: Date
}
