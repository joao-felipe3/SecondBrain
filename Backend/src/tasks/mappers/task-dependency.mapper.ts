import { TaskDependencyDocument } from '../schemas/task-dependency.schema';
import { TaskDependency } from '../entities/task-dependency.entity';

export class TaskDependencyMapper {
  static toDomain(document: TaskDependencyDocument): TaskDependency {
    if (!document) {
      throw new Error('TaskDependencyDocument is null or undefined');
    }

    const entity = new TaskDependency();
    entity.id = document._id ? document._id.toString() : (document as any).id;
    entity.taskId = document.taskId ? document.taskId.toString() : '';
    entity.dependsOnTaskId = document.dependsOnTaskId ? document.dependsOnTaskId.toString() : '';
    entity.relationship = document.relationship;
    entity.reason = document.reason;
    entity.projectId = document.projectId ? document.projectId.toString() : '';
    entity.isAutoIdentified = document.isAutoIdentified;
    entity.createdAt = (document as any).createdAt;
    entity.updatedAt = (document as any).updatedAt;

    return entity;
  }

  static toPersistence(entity: TaskDependency): Partial<TaskDependencyDocument> {
    if (!entity) {
      throw new Error('TaskDependency entity is null or undefined');
    }

    const document: any = {};
    if (entity.id) document._id = entity.id;
    if (entity.taskId !== undefined) document.taskId = entity.taskId;
    if (entity.dependsOnTaskId !== undefined) document.dependsOnTaskId = entity.dependsOnTaskId;
    if (entity.relationship !== undefined) document.relationship = entity.relationship;
    if (entity.reason !== undefined) document.reason = entity.reason;
    if (entity.projectId !== undefined) document.projectId = entity.projectId;
    if (entity.isAutoIdentified !== undefined) document.isAutoIdentified = entity.isAutoIdentified;

    return document;
  }
}
