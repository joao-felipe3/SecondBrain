import { RequirementType, JourneyKind } from '../schemas/requirement.schema';

export class Requirement {
  id!: string;
  projectId!: string;
  description!: string;
  type!: RequirementType;
  kind!: JourneyKind;
  parentItemId?: string;
  hierarchyLevel!: number;
  title?: string;
  traceableItems!: string[];
  traceableActionItems!: string[];
  source?: string;
  status!: 'open' | 'satisfied' | 'at_risk';
  createdAt?: Date;
  updatedAt?: Date;
}
