import { Injectable } from '@nestjs/common';
import { ConfigService } from '../shared/config.service';
import { DraftGenerationService, DraftProcessingService } from '../../drafts';
import { TaskConversionService } from './task-conversion.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { computeChunkMinutes } from '../utils/metrics-calculator.util';
import {
  ConversionOptions,
  ConversionResult,
  ConvertWbsToTasksParams,
  GenerateTasksForSingleLeafParams,
  GenerateTasksForSingleLeafResult,
} from '../../../interfaces';

// Responsible for orchestrating the conversion of WBS nodes to tasks,
// including error handling, logging, and optional auditing
@Injectable()
export class WbsConversionOrchestrationService {
  constructor(
    private readonly config: ConfigService,
    private readonly draftGeneration: DraftGenerationService,
    private readonly draftProcessing: DraftProcessingService,
    private readonly taskConversion: TaskConversionService,
  ) {}

  async convertWbsToTasks(params: ConvertWbsToTasksParams): Promise<ConversionResult> {
    const startMs = Date.now();
    const { node, project, path, options = {} } = params;
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
      const drafts = await this.stage1DraftGeneration({
        node,
        project,
        path,
        opts,
        chunkMinutes,
        result,
        startMs,
      });
      if (!drafts) return result;

      // ========== STAGE 2: Draft Processing ==========
      const processedDrafts = this.stage2DraftProcessing({
        drafts,
        chunkMinutes,
        path,
        result,
        startMs,
        opts,
      });
      if (!processedDrafts) return result;

      // ========== STAGE 3: Task Conversion ==========
      const success = await this.stage3TaskConversion({
        drafts: processedDrafts,
        node,
        project,
        path,
        result,
        startMs,
        opts,
      });
      if (!success) return result;

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

  // ========== STAGE 1: Draft Generation Helper ==========
  private async stage1DraftGeneration(p: {
    node: WBSNodeDto;
    project: any;
    path: string;
    opts: Required<ConversionOptions>;
    chunkMinutes: number[];
    result: ConversionResult;
    startMs: number;
  }): Promise<any[] | null> {
    try {
      const drafts = await this.generateDrafts(p.node, p.project, p.path, p.opts, p.chunkMinutes);
      p.result.metadata.draftCount = drafts.length;
      this.logIfVerbose(`[convertWbsToTasks] Drafts gerados`, {
        path: p.path,
        count: drafts.length,
        strategy: p.opts.strategy,
      });
      return drafts;
    } catch (err: any) {
      p.result.error = {
        stage: 'draft-generation',
        message: err.message || String(err),
        originalError: err,
      };
      this.logError(`[convertWbsToTasks] Erro na geração de drafts`, p.result.error);
      if (p.opts.throwOnError) throw err;
      p.result.metadata.durationMs = Date.now() - p.startMs;
      return null;
    }
  }

  // ========== STAGE 2: Draft Processing Helper ==========
  private stage2DraftProcessing(p: {
    drafts: any[];
    chunkMinutes: number[];
    path: string;
    result: ConversionResult;
    startMs: number;
    opts: Required<ConversionOptions>;
  }): any[] | null {
    try {
      const processed = this.processDrafts(p.drafts, p.chunkMinutes);
      this.logIfVerbose(`[convertWbsToTasks] Drafts processados`, {
        path: p.path,
        appliedThemes: true,
        appliedMilestones: true,
      });
      return processed;
    } catch (err: any) {
      p.result.error = {
        stage: 'draft-processing',
        message: err.message || String(err),
        originalError: err,
      };
      this.logError(`[convertWbsToTasks] Erro no processamento de drafts`, p.result.error);
      if (p.opts.throwOnError) throw err;
      p.result.metadata.durationMs = Date.now() - p.startMs;
      return null;
    }
  }

  // ========== STAGE 3: Task Conversion Helper ==========
  private async stage3TaskConversion(p: {
    drafts: any[];
    node: WBSNodeDto;
    project: any;
    path: string;
    result: ConversionResult;
    startMs: number;
    opts: Required<ConversionOptions>;
  }): Promise<boolean> {
    try {
      p.result.tasks = await this.taskConversion.convertDraftsToTasks(p.drafts, {
        wbsNode: p.node,
        project: p.project,
        path: p.path,
      });
      p.result.metadata.taskCount = p.result.tasks.length;
      this.logIfVerbose(`[convertWbsToTasks] Tasks criadas`, {
        path: p.path,
        count: p.result.tasks.length,
      });
      return true;
    } catch (err: any) {
      p.result.error = {
        stage: 'task-conversion',
        message: err.message || String(err),
        originalError: err,
      };
      this.logError(`[convertWbsToTasks] Erro na conversão para tasks`, p.result.error);
      if (p.opts.throwOnError) throw err;
      p.result.metadata.durationMs = Date.now() - p.startMs;
      return false;
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
        context: { project, node, currentPath: path, level: 0, plan, modelOverride: opts.modelOverride },
        chunkMinutes,
      });
    } else {
      return this.draftGeneration.generateMicroTasksDraftsForLeaf({
        context: { project, node, currentPath: path, level: 0 },
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

  async generateTasksForSingleLeaf(
    params: GenerateTasksForSingleLeafParams,
  ): Promise<GenerateTasksForSingleLeafResult> {
    const {
      leafNode,
      nodePath,
      projectId,
      project,
      tasksService,
      preferences,
      saveTasks = false,
    } = params;

    const result = await this.convertWbsToTasks({
      node: leafNode,
      project,
      path: nodePath,
      options: {
        strategy: 'two-phase',
        modelOverride: preferences?.modelOverride,
        logVerbose: true,
        throwOnError: false,
      },
    });

    if (!result.success && result.error) {
      this.handleSingleLeafConversionError(result);
    }

    let generatedTasks = result.tasks;
    if (saveTasks && generatedTasks.length > 0) {
      generatedTasks = await this.persistGeneratedTasks(generatedTasks, projectId, tasksService);
    }

    const pomodorosGenerated = generatedTasks.reduce(
      (sum, task) => sum + (task.pomodorosPlanned || 0),
      0,
    );
    return {
      tasks: generatedTasks,
      leafNode,
      nodePath,
      estimatedHours: leafNode.estimatedHours,
      generatedHours: pomodorosGenerated * 0.5,
      pomodorosGenerated,
    };
  }

  private handleSingleLeafConversionError(result: ConversionResult): void {
    console.error(`Erro na conversão: ${result.error?.stage} - ${result.error?.message}`);
    if (result.error?.originalError) throw result.error.originalError;
    throw new Error(`WBS conversion failed: ${result.error?.message}`);
  }

  private async persistGeneratedTasks(
    tasks: any[],
    projectId: string,
    tasksService: any,
  ): Promise<any[]> {
    const tasksToSave = tasks.map((task) => ({ ...task, project: projectId }));
    try {
      if (typeof tasksService.createMany === 'function') {
        return await tasksService.createMany(tasksToSave, {
          resolveProject: false,
          recalculateProjectStats: false,
        });
      } else {
        const created: any[] = [];
        for (const task of tasksToSave) {
          try {
            created.push(await tasksService.create(task));
          } catch (error: any) {
            console.error(`Erro ao criar task:`, error?.message || error);
          }
        }
        return created;
      }
    } catch (error: any) {
      console.error(`Erro ao criar tasks em lote:`, error?.message || error);
      return tasks;
    }
  }

  // ============ Private Helpers ============

  private normalizeOptions(opts: ConversionOptions): Required<ConversionOptions> {
    return {
      strategy: opts.strategy || 'two-phase',
      modelOverride: opts.modelOverride || '',
      autoAudit: opts.autoAudit !== false,
      autoApplyFixes: opts.autoApplyFixes === true,
      logVerbose: opts.logVerbose === true,
      throwOnError: opts.throwOnError === true,
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
