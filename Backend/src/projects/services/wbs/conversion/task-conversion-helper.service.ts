import { Injectable } from '@nestjs/common';
import { AuditService, CacheService } from '../index';
import { DraftGenerationService } from '../../drafts';
import { computeChunkMinutes } from '../utils/metrics-calculator.util';
import { computeLeafHours } from '../utils/wbs-helpers.util';
import {
  buildDraftsWithPlanCacheKey,
  shrinkLeafTasksToTargetHours,
  mapDraftsToTasks,
  generateFallbackTasks,
} from '../utils/task-conversion-helpers.util';
import {
  GeneratedTaskDto,
  GenerateTasksForLeafParams,
  AuditLeafDiscrepancyParams,
  ApplySimplifyFixParams,
  ApplyRebaselineFixParams,
  CreateAndSaveLeaveTasksParams,
  WbsConversionResult,
} from '../../../interfaces/wbs-conversion.interface';
import { MicroTaskDraft } from '../../../interfaces/drafts.interface';

@Injectable()
export class TaskConversionHelperService {
  constructor(
    private readonly auditService: AuditService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly cacheService: CacheService,
  ) {}

  // Helper to push audit results to result array
  private pushAudit(p: {
    result: WbsConversionResult;
    nodeId?: string;
    nodePath: string;
    budgetHours: number;
    generatedHours: number;
    action: 'none' | 'simplify' | 'rebaseline';
    diagnosis?: string;
    suggested?: number;
    finalHours: number;
  }): void {
    p.result.auditsApplied.push({
      nodeId: p.nodeId,
      nodePath: p.nodePath,
      budgetHours: p.budgetHours,
      generatedHours: p.generatedHours,
      appliedAction: p.action,
      diagnosis: p.diagnosis,
      suggestedEstimatedHours: p.suggested,
      finalHours: p.finalHours,
    });
  }

  // Generate tasks for a single leaf node using DraftGenerationService
  async generateTasksForLeafNode(params: GenerateTasksForLeafParams): Promise<GeneratedTaskDto[]> {
    const { node, nodePath, projectId, priorityOffset = 0 } = params;

    if (node.children && node.children.length > 0) {
      console.warn(
        `[WBS-Conversion] Node "${node.name}" is not a leaf (has ${node.children.length} children), skipping`,
      );
      return [];
    }

    const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
    const chunkMinutes = computeChunkMinutes(totalMinutes);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    try {
      const plan = { themes: [{ name: node.name }], workflow: ['execute'] };
      const cacheKey = buildDraftsWithPlanCacheKey({ projectId, node, nodePath, chunkMinutes, plan });

      const cached = await this.cacheService.get(cacheKey);
      let drafts: MicroTaskDraft[];
      if (cached && Array.isArray(cached) && cached.length > 0) {
        drafts = cached as MicroTaskDraft[];
      } else {
        drafts = await this.draftGenerationService.generateMicroTasksDraftsForLeafWithPlan({
          context: { project: { _id: projectId }, node, currentPath: nodePath, level: 3, plan },
          chunkMinutes,
        });
        await this.cacheService.set(cacheKey, drafts);
      }

      return mapDraftsToTasks({
        drafts,
        node,
        nodePath,
        projectId,
        chunkMinutes,
        priorityOffset,
        deadline,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[WBS-Conversion] ⚠️ DraftGenerationService failed: ${errMsg}. Using fallback static descriptions.`,
      );
      return generateFallbackTasks({
        node,
        nodePath,
        projectId,
        chunkMinutes,
        priorityOffset,
        deadline,
      });
    }
  }

  // Audit a leaf node's discrepancy and apply fixes if recommended
  async auditAndResolveLeafDiscrepancy(params: AuditLeafDiscrepancyParams): Promise<void> {
    const { node, nodePath, leafTaskDtos, budgetHours, generatedHoursBefore, result } = params;
    try {
      const tasks = leafTaskDtos.map((t) => ({
        name: String(t.name || ''),
        pomodorosPlanned: Number(t.pomodorosPlanned || 1),
        priority: typeof t.priority === 'number' ? t.priority : undefined,
        microTaskType: t.microTaskType,
        themeTag: Array.isArray(t.themeTag) ? String(t.themeTag[0] || '') : t.themeTag,
        contextTag: t.contextTag,
        cognitiveMode: t.cognitiveMode,
      }));
      const audit = await this.auditService.auditLeafDiscrepancy(
        { name: 'Project' },
        { leafNode: node, nodePath, generatedHours: generatedHoursBefore, tasks },
      );

      const nodeId = node._id ? String(node._id) : undefined;
      const suggestedHoursRaw = Number(audit?.suggestedEstimatedHours);
      const hasSuggestedHours = Number.isFinite(suggestedHoursRaw) && suggestedHoursRaw > 0;

      if (audit?.suggestedAction === 'simplify') {
        this.applySimplifyFix({
          node,
          nodeId,
          leafTaskDtos,
          budgetHours,
          suggestedHoursRaw,
          hasSuggestedHours,
          nodePath,
          audit,
          result,
        });
      } else if (audit?.suggestedAction === 'rebaseline') {
        this.applyRebaselineFix({
          node,
          nodeId,
          budgetHours,
          generatedHoursBefore,
          suggestedHoursRaw,
          hasSuggestedHours,
          nodePath,
          audit,
          result,
        });
      } else {
        this.pushAudit({
          result,
          nodeId,
          nodePath,
          budgetHours,
          generatedHours: generatedHoursBefore,
          action: 'none',
          diagnosis: audit?.diagnosis,
          suggested: hasSuggestedHours ? suggestedHoursRaw : undefined,
          finalHours: generatedHoursBefore,
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[TaskConversion] auto-audit failed for leaf="${node.name}": ${errMsg}`);
    }
  }

  // Apply simplify fix: reduce task scope to fit budget
  private applySimplifyFix(p: ApplySimplifyFixParams): void {
    const targetHours = p.hasSuggestedHours ? p.suggestedHoursRaw : p.budgetHours;
    const shrink = shrinkLeafTasksToTargetHours(p.leafTaskDtos, targetHours);
    const finalHours = shrink.finalHours;
    const finalEstimatedHours =
      Math.round((p.hasSuggestedHours ? shrink.targetHours : finalHours) * 2) / 2;

    p.node.estimatedHours = finalEstimatedHours;
    if (p.nodeId) {
      p.result.wbsUpdates.push({ nodeId: p.nodeId, newEstimatedHours: finalEstimatedHours });
    }

    this.pushAudit({
      result: p.result,
      nodeId: p.nodeId,
      nodePath: p.nodePath,
      budgetHours: p.budgetHours,
      generatedHours: computeLeafHours(p.leafTaskDtos),
      action: 'simplify',
      diagnosis: p.audit?.diagnosis,
      suggested: p.hasSuggestedHours ? p.suggestedHoursRaw : undefined,
      finalHours,
    });
  }

  // Apply rebaseline fix: update WBS estimate to reflect actual task complexity
  private applyRebaselineFix(p: ApplyRebaselineFixParams): void {
    const newHoursRaw = p.hasSuggestedHours ? p.suggestedHoursRaw : p.generatedHoursBefore;
    const newHours = Math.max(p.budgetHours, Math.round(newHoursRaw * 2) / 2);

    p.node.estimatedHours = newHours;
    if (p.nodeId) {
      p.result.wbsUpdates.push({ nodeId: p.nodeId, newEstimatedHours: newHours });
    }

    this.pushAudit({
      result: p.result,
      nodeId: p.nodeId,
      nodePath: p.nodePath,
      budgetHours: p.budgetHours,
      generatedHours: p.generatedHoursBefore,
      action: 'rebaseline',
      diagnosis: p.audit?.diagnosis,
      suggested: p.hasSuggestedHours ? p.suggestedHoursRaw : undefined,
      finalHours: p.generatedHoursBefore,
    });
  }

  // Create and save leaf tasks in batch
  async createAndSaveLeaveTasks(params: CreateAndSaveLeaveTasksParams): Promise<void> {
    const { leafTaskDtos, tasksService, nodePath, result } = params;
    try {
      if (typeof tasksService.createMany === 'function') {
        const created = await tasksService.createMany(leafTaskDtos, {
          resolveProject: false,
          recalculateProjectStats: false,
        });
        for (const createdTask of created) {
          result.createdTasks.push(createdTask);
        }
      } else {
        for (const dto of leafTaskDtos) {
          try {
            const createdTask: unknown = await tasksService.create(dto);
            result.createdTasks.push(createdTask);
          } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[WBS-Conversion] ❌ Failed to create "${dto?.name}": ${errMsg}`, error);
          }
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WBS-Conversion] ❌ Batch creation failed for "${nodePath}": ${errMsg}`, error);
    }
  }
}
