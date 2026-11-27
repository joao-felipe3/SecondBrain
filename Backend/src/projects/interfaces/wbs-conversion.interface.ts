import { Types } from 'mongoose';
import { Task } from '../../tasks/entities/task.entity';
import { WBSNodeDto } from '../dto/wbs.dto';
import { MicroTaskDraft, WBSLeafProjectContext } from './drafts.interface';
import { BatchMetricsResult } from './wbs-metrics.interface';
export { Task };

export type GenerationStrategy = 'two-phase' | 'legacy';

export interface ConversionOptions {
  strategy?: GenerationStrategy;
  modelOverride?: string;
  regenerateNonce?: string;
  /** Títulos que já existem para o pacote (fatias anteriores): o modelo não deve repeti-los. */
  avoidTaskTitles?: string[];
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
  diagnosis:
    'underestimated' | 'gold_plating' | 'mixed' | 'overestimated' | 'incomplete' | (string & {});
  rationale: string;
  suggestedAction: 'rebaseline' | 'simplify' | 'regenerate' | 'none';
  suggestedEstimatedHours?: number;
}

export interface TasksServiceSubset {
  create: (dto: any) => Promise<any>;
  createMany?: (dtos: any[], options?: any) => Promise<any[]>;
  recalculateProjectStats?: (projectId: string) => Promise<void>;
}

export interface GenerateTasksForSingleLeafParams {
  leafNode: WBSNodeDto;
  nodePath: string;
  projectId: string;
  project: any;
  /** Obrigatório só quando saveTasks=true. */
  tasksService?: TasksServiceSubset;
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
    modelOverride?: string;
    regenerateNonce?: string;
  };
  saveTasks?: boolean;
  /** Títulos já usados no pacote (fatias anteriores). */
  avoidTaskTitles?: string[];
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
  diagnosis: AuditDiagnosis;
  suggestedAction: AuditAction;
  duplicateRatio: number;
  repetitionMetrics: BatchMetricsResult;
  diffPct: number;
  taskLength: number;
}

export interface AutoFixMonotonyParams {
  project: WBSLeafProjectContext | null | undefined;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  drafts: MicroTaskDraft[];
  maxCalls: number;
  forceIndices?: number[];
  modelOverride?: string;
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
  diagnosis: AuditDiagnosis;
  rationale: string;
  suggestedAction: AuditAction;
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

export interface DraftToTaskContext {
  wbsNode?: WBSNodeDto;
  project?: { _id?: string | Types.ObjectId | null; id?: string | null };
  path?: string;
}

export interface FixMonotonyBatchParams {
  project: WBSLeafProjectContext | null | undefined;
  node: WBSNodeDto;
  currentPath: string;
  chunkMinutes: number[];
  drafts: MicroTaskDraft[];
  indices: number[];
  round: number;
  modelOverride?: string;
}

/**
 * Diagnóstico da auditoria de discrepância.
 * - Diferença positiva (gerado > orçado): underestimated | gold_plating | mixed.
 * - Diferença negativa (gerado < orçado): overestimated (pacote superestimado)
 *   | incomplete (faltam micro-tarefas para cobrir o escopo).
 */
export type AuditDiagnosis =
  'underestimated' | 'gold_plating' | 'mixed' | 'overestimated' | 'incomplete';
export type AuditAction = 'rebaseline' | 'simplify' | 'regenerate';

export interface CompleteLeafTasksParams {
  leafNode: WBSNodeDto;
  nodePath: string;
  project: any;
  existingTaskNames: string[];
  missingHours: number;
  preferences?: { modelOverride?: string };
}

export interface CompleteLeafTasksResult {
  tasks: any[];
  generatedHours: number;
  pomodorosGenerated: number;
}
