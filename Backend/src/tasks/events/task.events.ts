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
  ) {}
}
