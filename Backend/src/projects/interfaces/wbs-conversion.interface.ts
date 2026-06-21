import { Task } from '../../tasks/entities/task.entity';

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
  diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
  rationale: string;
  suggestedAction: 'rebaseline' | 'simplify';
  suggestedEstimatedHours?: number;
}
