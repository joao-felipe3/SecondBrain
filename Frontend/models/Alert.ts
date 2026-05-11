export interface AlertItem {
  _id: string
  userId?: string
  task?: string
  project?: string
  type: 'warning' | 'error' | 'info'
  message: string
  recommendation?: string
  createdAt?: string | Date
  isRead?: boolean
}
