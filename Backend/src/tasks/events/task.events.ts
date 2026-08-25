import { TaskDocument } from '../schemas/task.schema';

export class TaskCreatedEvent {
  constructor(
    public readonly task: TaskDocument,
    public readonly projectId?: string,
  ) {}
}

export class TaskCompletedEvent {
  constructor(
    public readonly task: TaskDocument,
    public readonly projectId?: string,
    public readonly remainingHours: number = 0,
    public readonly completedAt: Date = new Date(),
  ) {}
}

export class TaskDeletedEvent {
  constructor(
    public readonly taskId: string,
    public readonly projectId?: string,
  ) {}
}

export class TaskStatusMovedEvent {
  constructor(
    public readonly task: TaskDocument,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly projectId?: string,
  ) {}
}

export class TaskProgressUpdatedEvent {
  constructor(
    public readonly taskId: string,
    public readonly projectId?: string,
    public readonly pomodorosCount?: number,
    public readonly hoursDelta: number = 0,
    public readonly source: 'pomodoro' | 'completion' | 'manual' = 'pomodoro',
  ) {}
}

export class TaskUpdatedEvent {
  constructor(
    public readonly task: TaskDocument,
    public readonly projectId?: string,
    public readonly oldProjectId?: string,
  ) {}
}

export class BulkTasksCreatedEvent {
  constructor(
    public readonly tasks: TaskDocument[],
    public readonly projectIds: string[],
  ) {}
}
