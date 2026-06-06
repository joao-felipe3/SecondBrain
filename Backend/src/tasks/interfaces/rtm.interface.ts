import { JourneyKind } from '../schemas/requirement.schema';

export interface RTMValidation {
  isValid: boolean;
  unmappedRequirements: string[];
  risks: string[];
  coverage: number;
}

export interface RTMMatrixData {
  requirements: Array<{
    id: string;
    description: string;
    type: string;
    status: string;
    kind: JourneyKind;
    parentItemId?: string;
    hierarchyLevel: number;
  }>;
  tasks: Array<{
    id: string;
    name: string;
    wbsNodeId?: string;
    wbsNodeName: string;
  }>;
  matrix: Map<string, Set<string>>;
  validation: RTMValidation;
}
