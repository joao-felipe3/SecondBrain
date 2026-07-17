import { Task } from '../../tasks/entities/task.entity';
import { WBSNodeDto } from '../dto/wbs.dto';
import { MicroTaskDraft } from './drafts.interface';
export { Task };

export type GenerationStrategy = 'two-phase' | 'legacy';

export interface ConversionOptions {
  strategy?: GenerationStrategy;
  modelOverride?: string;
  autoAudit?: boolean;
  autoApplyFixes?: boolean;
  logVerbose?: boolean;
  throwOnError?: boolean;
}

export interface ConversionResult {
  success: boolean;
  tasks: Task[];
  auditFindings?: any[];
  appliedFixes?: string[];
  metadata: {
    strategy: GenerationStrategy;
    durationMs: number;
    draftCount: number;
    taskCount: number;
    auditedAt?: string;
    model?: string;
  };
  error?: {
    stage: 'draft-generation' | 'draft-processing' | 'task-conversion' | 'audit';
    message: string;
    originalError?: any;
  };
}

export interface LeafAuditResult {
  diagnosis: 'underestimated' | 'gold_plating' | 'mixed' | string;
  rationale: string;
  suggestedAction: 'rebaseline' | 'simplify' | 'none';
  suggestedEstimatedHours?: number;
}

export interface GeneratedTaskDto {
  name: string;
  description: string;
  estimatedMinutes: number;
  pomodorosPlanned: number;
  priority: number;
  project: string;
  deadline: Date;
  isConcluded: boolean;
  late: boolean;
  recurrency: string;
  wbsPath: string;

  // Optional AI metadata fields:
  microTaskType?: string;
  themeTag?: string | string[];
  contextTag?: string;
  cognitiveMode?: string;

  // Optional PERT calculations:
  pertOptimisticMinutes?: number;
  pertMostLikelyMinutes?: number;
  pertPessimisticMinutes?: number;
  pertExpectedMinutes?: number;
  pertVariance?: number;
}

export interface WbsNodeUpdate {
  nodeId: string;
  newEstimatedHours: number;
}

export interface AuditRecord {
  nodeId?: string;
  nodePath: string;
  budgetHours: number;
  generatedHours: number;
  appliedAction: 'rebaseline' | 'simplify' | 'none';
  diagnosis?: string;
  suggestedEstimatedHours?: number;
  finalHours?: number;
}

export interface WbsConversionResult {
  createdTasks: any[];
  wbsUpdates: WbsNodeUpdate[];
  auditsApplied: AuditRecord[];
}

export interface TasksServiceSubset {
  create: (dto: any) => Promise<any>;
  createMany?: (dtos: any[], options?: any) => Promise<any[]>;
  recalculateProjectStats?: (projectId: string) => Promise<void>;
}

export interface GenerateTasksForLeafParams {
  node: WBSNodeDto;
  nodePath: string;
  projectId: string;
  priorityOffset?: number;
}

export interface AuditLeafDiscrepancyParams {
  node: WBSNodeDto;
  nodePath: string;
  leafTaskDtos: GeneratedTaskDto[];
  budgetHours: number;
  generatedHoursBefore: number;
  result: WbsConversionResult;
}

export interface ApplySimplifyFixParams {
  node: WBSNodeDto;
  nodeId?: string;
  leafTaskDtos: GeneratedTaskDto[];
  budgetHours: number;
  suggestedHoursRaw: number;
  hasSuggestedHours: boolean;
  nodePath: string;
  audit: LeafAuditResult;
  result: WbsConversionResult;
}

export interface ApplyRebaselineFixParams {
  node: WBSNodeDto;
  nodeId?: string;
  budgetHours: number;
  generatedHoursBefore: number;
  suggestedHoursRaw: number;
  hasSuggestedHours: boolean;
  nodePath: string;
  audit: LeafAuditResult;
  result: WbsConversionResult;
}

export interface CreateAndSaveLeaveTasksParams {
  leafTaskDtos: GeneratedTaskDto[];
  tasksService: TasksServiceSubset;
  nodePath: string;
  result: WbsConversionResult;
}

export interface GenerateTasksForSingleLeafParams {
  leafNode: WBSNodeDto;
  nodePath: string;
  projectId: string;
  project: any;
  tasksService: TasksServiceSubset;
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
    modelOverride?: string;
  };
  saveTasks?: boolean;
}

export interface AuditLeafDiscrepancyInput {
  leafNode: WBSNodeDto;
  nodePath: string;
  generatedHours: number;
  tasks: Array<{
    name: string;
    pomodorosPlanned: number;
    priority?: number;
    microTaskType?: string;
    themeTag?: string;
    contextTag?: string;
    cognitiveMode?: string;
  }>;
}

export interface ApplyGuardrailsParams {
  diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
  suggestedAction: 'rebaseline' | 'simplify';
  duplicateRatio: number;
  repetitionMetrics: any;
  diffPct: number;
  taskLength: number;
}

export interface AutoFixMonotonyParams {
  project: any;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  drafts: MicroTaskDraft[];
  maxCalls: number;
  forceIndices?: number[];
  modelOverride?: string;
}

export interface ConvertWBSToTasksWithAIParams {
  nodes: WBSNodeDto[];
  projectId: string;
  project: { name?: string };
  tasksService: TasksServiceSubset;
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
  };
  options?: {
    autoResolveDiscrepancies?: boolean;
    autoAuditThresholdPct?: number;
  };
}

export interface ProcessLeafNodeParams {
  node: WBSNodeDto;
  nodePath: string;
  projectId: string;
  project: { name?: string };
  tasksService: TasksServiceSubset;
  options?: {
    autoResolveDiscrepancies?: boolean;
    autoAuditThresholdPct?: number;
  };
  result: WbsConversionResult;
  priorityOffset?: number;
}

export interface ConvertWbsToTasksParams {
  node: WBSNodeDto;
  project: { name?: string; _id?: any; id?: any };
  path: string;
  options?: ConversionOptions;
}

export interface AuditLeafDiscrepancyAiInput {
  projectName: string;
  leafNodeName: string;
  nodePath: string;
  budgetHours: number;
  generatedHours: number;
  diffPct: number;
  taskCount: number;
  duplicateRatio: number;
  topDuplicateKeys: string;
  dupScore: number;
  similarScore: number;
  tasksPreview: string;
  modelOverride?: string;
}

export interface AuditLeafDiscrepancyAiResult {
  diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
  rationale: string;
  suggestedAction: 'rebaseline' | 'simplify';
  suggestedEstimatedHours?: number;
}

export interface GenerateWbsInput {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  temporal: string;
  weeklyHours?: number;
  budgetHours?: number;
  weeksAvailable?: number;
  summary?: string;
}

export interface GenerateTasksForSingleLeafResult {
  tasks: any[];
  leafNode: WBSNodeDto;
  nodePath: string;
  estimatedHours: number;
  generatedHours: number;
  pomodorosGenerated: number;
}
