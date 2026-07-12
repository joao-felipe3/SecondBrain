import { DependencyType } from '../schemas/task-dependency.schema';

export class TaskDependency {
  id!: string;
  taskId!: string;
  dependsOnTaskId!: string;
  relationship!: DependencyType;
  reason?: string;
  projectId!: string;
  isAutoIdentified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
