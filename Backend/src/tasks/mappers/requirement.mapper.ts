import { RequirementDocument } from '../schemas/requirement.schema';
import { Requirement } from '../entities/requirement.entity';

export class RequirementMapper {
  static toDomain(document: RequirementDocument): Requirement {
    if (!document) {
      throw new Error('RequirementDocument is null or undefined');
    }

    const entity = new Requirement();
    entity.id = document._id ? document._id.toString() : (document as any).id;
    entity.projectId = document.projectId ? document.projectId.toString() : '';
    entity.description = document.description;
    entity.type = document.type;
    entity.kind = document.kind;
    entity.parentItemId = document.parentItemId ? document.parentItemId.toString() : undefined;
    entity.hierarchyLevel = document.hierarchyLevel;
    entity.title = document.title;
    entity.traceableItems = document.traceableItems ? document.traceableItems.map(id => id.toString()) : [];
    entity.traceableActionItems = document.traceableActionItems ? document.traceableActionItems.map(id => id.toString()) : [];
    entity.source = document.source;
    entity.status = document.status;
    entity.createdAt = document.createdAt;
    entity.updatedAt = document.updatedAt;

    return entity;
  }

  static toPersistence(entity: Requirement): Partial<RequirementDocument> {
    if (!entity) {
      throw new Error('Requirement entity is null or undefined');
    }

    const document: any = {};
    if (entity.id) document._id = entity.id;
    if (entity.projectId !== undefined) document.projectId = entity.projectId;
    if (entity.description !== undefined) document.description = entity.description;
    if (entity.type !== undefined) document.type = entity.type;
    if (entity.kind !== undefined) document.kind = entity.kind;
    if (entity.parentItemId !== undefined) document.parentItemId = entity.parentItemId;
    if (entity.hierarchyLevel !== undefined) document.hierarchyLevel = entity.hierarchyLevel;
    if (entity.title !== undefined) document.title = entity.title;
    if (entity.traceableItems !== undefined) document.traceableItems = entity.traceableItems;
    if (entity.traceableActionItems !== undefined) document.traceableActionItems = entity.traceableActionItems;
    if (entity.source !== undefined) document.source = entity.source;
    if (entity.status !== undefined) document.status = entity.status;

    return document;
  }
}
