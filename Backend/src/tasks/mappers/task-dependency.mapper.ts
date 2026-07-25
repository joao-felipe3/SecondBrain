import { TaskDependencyDocument } from '../schemas/task-dependency.schema';
import { TaskDependency } from '../entities/task-dependency.entity';

export class TaskDependencyMapper {
  static toDomain(document: TaskDependencyDocument): TaskDependency {
    if (!document) {
      throw new Error('TaskDependencyDocument is null or undefined');
    }

    const docRecord = document as unknown as {
      id?: string | number;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const entity = new TaskDependency();
    entity.id = document._id ? document._id.toString() : docRecord.id ? String(docRecord.id) : '';
    entity.taskId = document.taskId ? document.taskId.toString() : '';
    entity.dependsOnTaskId = document.dependsOnTaskId ? document.dependsOnTaskId.toString() : '';
    entity.relationship = document.relationship;
    entity.reason = document.reason;
    entity.projectId = document.projectId ? document.projectId.toString() : '';
    entity.isAutoIdentified = document.isAutoIdentified;
    entity.createdAt = docRecord.createdAt;
    entity.updatedAt = docRecord.updatedAt;

    return entity;
  }

  static toPersistence(entity: TaskDependency): Partial<TaskDependencyDocument> {
    if (!entity) {
      throw new Error('TaskDependency entity is null or undefined');
    }

    const document: Record<string, unknown> = {};
    if (entity.id) document._id = entity.id;
    if (entity.taskId !== undefined) document.taskId = entity.taskId;
    if (entity.dependsOnTaskId !== undefined) document.dependsOnTaskId = entity.dependsOnTaskId;
    if (entity.relationship !== undefined) document.relationship = entity.relationship;
    if (entity.reason !== undefined) document.reason = entity.reason;
    if (entity.projectId !== undefined) document.projectId = entity.projectId;
    if (entity.isAutoIdentified !== undefined) document.isAutoIdentified = entity.isAutoIdentified;

    return document as Partial<TaskDependencyDocument>;
  }
}
