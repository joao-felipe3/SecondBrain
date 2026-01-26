export interface Project {
  _id?: string
  id?: string
  name: string
  description?: string
  color?: string
  startDate?: string
  deadline?: string
  totalHoursWorked?: number
  plannedHours?: number
  shortTermGoal?: string
  midTermGoal?: string
  longTermGoal?: string
  status?: string
  progressPercentage?: number
  experience?: number
  reward?: number
  taskCount?: number
  [key: string]: any
}
