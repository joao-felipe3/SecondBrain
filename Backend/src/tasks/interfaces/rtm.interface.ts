import { JourneyKind } from '../schemas/requirement.schema';
import { Requirement } from '../entities/requirement.entity';

export interface RTMRequirementData {
  id: string;
  description: string;
  type: string;
  status: string;
  kind: JourneyKind;
  parentItemId?: string;
  hierarchyLevel: number;
}

export interface RTMTaskData {
  id: string;
  name: string;
  wbsNodeId?: string;
  wbsNodeName: string;
}

export interface RequirementMaps {
  byId: Map<string, Requirement>;
  childrenByParent: Map<string, Requirement[]>;
}

export interface ValidationIssues {
  unmappedRequirements: string[];
  risks: string[];
}

export interface RTMValidation {
  isValid: boolean;
  unmappedRequirements: string[];
  risks: string[];
  coverage: number;
}

export interface RTMMatrixData {
  requirements: RTMRequirementData[];
  tasks: RTMTaskData[];
  matrix: Map<string, Set<string>>;
  validation: RTMValidation;
}
