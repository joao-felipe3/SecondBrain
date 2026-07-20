import { WBSNodeDto } from '../dto/wbs.dto';

export interface MicroTaskOutline {
  name: string;
  pomodorosPlanned: number;
  priority: number;
  difficult: number;
  microTaskType: string;
  themeTag: string;
  contextTag: string;
  cognitiveMode: string;
  milestoneIndex?: number;
}

export interface MicroTaskDetails {
  checklist: string[];
  definitionOfDone: string;
  description?: string;
}

export interface MicroTaskDraft extends MicroTaskOutline, MicroTaskDetails {}

export interface WBSLeafProjectContext {
  _id?: string;
  description?: string;
  smartObjective?: {
    summary?: string;
  };
}

export interface WBSLeafGenerationContext {
  project: WBSLeafProjectContext;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  plan?: {
    themes?: Array<{ name: string; criteria?: string }>;
    workflow?: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
  };
  modelOverride?: string;
}

export interface WBSLeafWithPlanGenerationContext extends WBSLeafGenerationContext {
  plan: {
    themes?: Array<{ name: string; criteria?: string }>;
    workflow?: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
  };
}

export interface EnrichOutlinesParamsDto {
  outlines: MicroTaskOutline[];
  sliceMinutes: number[];
  params: WBSLeafGenerationContext;
  detailsModelOverride?: string;
}

export interface DraftBatchItem {
  start: number;
  outlines: MicroTaskOutline[];
  minutes: number[];
}

export interface DraftBatchResult {
  start: number;
  detailsList: MicroTaskDetails[];
}

export interface ConcurrencyParams {
  detailsConcurrency: number;
  detailsBatchSize: number;
  detailsBatchConcurrency: number;
}

export interface SingleDetailsParamsDto {
  outline: MicroTaskOutline;
  targetMinutes: number;
  params: WBSLeafGenerationContext;
  detailsModelOverride?: string;
  maxTokens: number;
  retryMaxTokens: number;
}

export interface MultipleDetailsParamsDto {
  enrichParams: EnrichOutlinesParamsDto;
  detailsMaxTokens: number;
  detailsRetryMaxTokens: number;
  depth: number;
}

export interface WBSLeafPlanParamsDto {
  project: WBSLeafProjectContext;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  workflowMix?: Record<string, number>;
  modelOverride?: string;
}

export interface WBSLeafPlanResultDto {
  themes: Array<{ name: string; criteria?: string }>;
  workflow: string[];
  milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
  constraints?: any;
}

export interface AssignMilestonesParamsDto {
  normalized: MicroTaskOutline[];
  chunkMinutes: number[];
  milestoneEveryMinutes: number;
  milestoneRequired: boolean;
  checkpointIndices: Set<number>;
}

export interface GenerateLeafDraftsDto {
  context: WBSLeafGenerationContext;
  chunkMinutes: number[];
  modelOverride?: string;
}

export interface GenerateLeafDraftsWithPlanDto {
  context: WBSLeafWithPlanGenerationContext;
  chunkMinutes: number[];
}
