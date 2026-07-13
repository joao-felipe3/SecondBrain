import { Injectable } from '@nestjs/common';
import { ConfigService } from '../shared/config.service';
import { DraftGenerationService, DraftProcessingService } from '../../drafts';
import { TaskConversionService } from './task-conversion.service';
import { AuditService } from '../core/audit.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { Task } from '../../../../tasks/entities/task.entity';
import { computeChunkMinutes } from '../utils/metrics-calculator.util';

import { GenerationStrategy, ConversionOptions, ConversionResult } from '../../../interfaces';

// Responsible for orchestrating the conversion of WBS nodes to tasks,
// including error handling, logging, and optional auditing
@Injectable()
export class WbsConversionOrchestrationService {
  constructor(
    private readonly config: ConfigService,
    private readonly draftGeneration: DraftGenerationService,
    private readonly draftProcessing: DraftProcessingService,
    private readonly taskConversion: TaskConversionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Convert a WBS node to tasks, orchestrating the entire flow
   *
   * Steps:
   * 1. Basic validation of the node
   * 2. Draft generation (strategy: two-phase or legacy)
   * 3. Draft processing (themes, milestones)
   * 4. Task conversion
   * 5. Optional auditing
   * 6. Optional application of fixes
   */
  async convertWbsToTasks(
    node: WBSNodeDto,
    project: any,
    path: string,
    options: ConversionOptions = {},
  ): Promise<ConversionResult> {
    const startMs = Date.now();
    const opts = this.normalizeOptions(options);

    this.logIfVerbose(`[convertWbsToTasks] Iniciando conversão`, {
      path,
      strategy: opts.strategy,
      nodeId: node._id || node.name,
    });

    const result: ConversionResult = {
      success: false,
      tasks: [],
      metadata: {
        strategy: opts.strategy,
        durationMs: 0,
        draftCount: 0,
        taskCount: 0,
        model: opts.modelOverride,
      },
    };

    try {
      const chunkMinutes = computeChunkMinutes((node.estimatedHours || 0) * 60);

      // ========== STAGE 1: Draft Generation ==========
      let drafts: any[];
      try {
        drafts = await this.generateDrafts(node, project, path, opts, chunkMinutes);
        result.metadata.draftCount = drafts.length;
        this.logIfVerbose(`[convertWbsToTasks] Drafts gerados`, {
          path,
          count: drafts.length,
          strategy: opts.strategy,
        });
      } catch (err: any) {
        result.error = {
          stage: 'draft-generation',
          message: err.message || String(err),
          originalError: err,
        };
        this.logError(`[convertWbsToTasks] Erro na geração de drafts`, result.error);
        if (opts.throwOnError) throw err;
        result.metadata.durationMs = Date.now() - startMs;
        return result;
      }

      // ========== STAGE 2: Draft Processing ==========
      try {
        drafts = this.processDrafts(drafts, chunkMinutes);
        this.logIfVerbose(`[convertWbsToTasks] Drafts processados`, {
          path,
          appliedThemes: true,
          appliedMilestones: true,
        });
      } catch (err: any) {
        result.error = {
          stage: 'draft-processing',
          message: err.message || String(err),
          originalError: err,
        };
        this.logError(`[convertWbsToTasks] Erro no processamento de drafts`, result.error);
        if (opts.throwOnError) throw err;
        result.metadata.durationMs = Date.now() - startMs;
        return result;
      }

      // ========== STAGE 3: Task Conversion ==========
      try {
        result.tasks = await this.taskConversion.convertDraftsToTasks(drafts, {
          wbsNode: node,
          project,
          path,
        });
        result.metadata.taskCount = result.tasks.length;
        this.logIfVerbose(`[convertWbsToTasks] Tasks criadas`, {
          path,
          count: result.tasks.length,
        });
      } catch (err: any) {
        result.error = {
          stage: 'task-conversion',
          message: err.message || String(err),
          originalError: err,
        };
        this.logError(`[convertWbsToTasks] Erro na conversão para tasks`, result.error);
        if (opts.throwOnError) throw err;
        result.metadata.durationMs = Date.now() - startMs;
        return result;
      }

      // ========== STAGE 4: Audit (Optional) ==========
      if (opts.autoAudit && opts.logVerbose) {
        this.logIfVerbose(`[convertWbsToTasks] Auditoria habilitada para conversão`, {
          path,
          taskCount: result.tasks.length,
        });
      }

      result.success = true;
      result.metadata.durationMs = Date.now() - startMs;
      result.metadata.auditedAt = this.config.getNowIso();

      this.config.logIfTimingDebug(`[convertWbsToTasks] Conversão completa`, {
        path,
        durationMs: result.metadata.durationMs,
        taskCount: result.tasks.length,
      });

      return result;
    } catch (err: any) {
      result.metadata.durationMs = Date.now() - startMs;
      if (!result.error) {
        result.error = {
          stage: 'draft-generation' as const,
          message: err.message || String(err),
          originalError: err,
        };
      }
      return result;
    }
  }

  private async generateDrafts(
    node: WBSNodeDto,
    project: any,
    path: string,
    opts: Required<ConversionOptions>,
    chunkMinutes: number[],
  ): Promise<any[]> {
    if (opts.strategy === 'two-phase') {
      const plan = await this.draftGeneration.generateMicroTasksPlanForLeaf({
        project,
        node,
        currentPath: path,
        level: 0,
        chunkMinutes,
        modelOverride: opts.modelOverride,
      });
      return this.draftGeneration.generateMicroTasksDraftsForLeafWithPlan({
        context: {
          project,
          node,
          currentPath: path,
          level: 0,
          plan,
          modelOverride: opts.modelOverride,
        },
        chunkMinutes,
      });
    } else {
      return this.draftGeneration.generateMicroTasksDraftsForLeaf({
        context: {
          project,
          node,
          currentPath: path,
          level: 0,
        },
        chunkMinutes,
        modelOverride: opts.modelOverride,
      });
    }
  }

  private processDrafts(drafts: any[], chunkMinutes: number[]): any[] {
    let processed = this.draftProcessing.applyThemeWorkflowAndProgression(drafts);
    processed = this.draftProcessing.applyGoldilocksAndMilestones(processed, chunkMinutes);
    return processed;
  }

  // ============ Private Helpers ============

  private normalizeOptions(opts: ConversionOptions): Required<ConversionOptions> {
    return {
      strategy: opts.strategy || 'two-phase',
      modelOverride: opts.modelOverride || '',
      autoAudit: opts.autoAudit !== false, // default true
      autoApplyFixes: opts.autoApplyFixes === true, // default false
      logVerbose: opts.logVerbose === true, // default false
      throwOnError: opts.throwOnError === true, // default false
    };
  }

  private logIfVerbose(message: string, data?: any): void {
    if (this.config.isVerboseTaskLogsEnabled()) {
      const ts = this.config.getNowIso();

      console.log(`[WbsOrchestrator][${ts}] ${message}`, data || '');
    }
  }

  private logError(message: string, data?: any): void {
    console.error(`[WbsOrchestrator][ERROR] ${message}`, data || '');
  }
}
