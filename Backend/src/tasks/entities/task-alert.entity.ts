export class TaskAlert {
  id!: string;
  userId?: string;
  task?: string;
  project?: string;
  type!: 'warning' | 'error' | 'info';
  message!: string;
  recommendation?: string;
  createdAt?: Date;
  isRead?: boolean;
}
