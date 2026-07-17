import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { TaskConversionHelperService } from './task-conversion-helper.service';
import { computeChunkMinutes, estimateMicroTaskCount } from '../utils/metrics-calculator.util';
import {
  collectLeafNodesInOrder,
  mapWithConcurrency,
  convertWBSToTasks,
  convertDraftsToTasks,
} from '../utils/task-conversion-helpers.util';
import {
  WbsConversionResult,
  TasksServiceSubset,
  Task,
  ConvertWBSToTasksWithAIParams,
  ProcessLeafNodeParams,
} from '../../../interfaces/wbs-conversion.interface';
import { MicroTaskDraft } from '../../../interfaces/drafts.interface';

@Injectable()
export class TaskConversionService {
  constructor(private readonly taskConversionHelper: TaskConversionHelperService) {}

  private safeEnv(name: string): string {
    return String(process.env[name] ?? '').trim();
  }

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  // Convert WBS leaf nodes into tasks (legacy - simple conversion)
  convertWBSToTasks(nodes: WBSNodeDto[], projectId: string) {
    return convertWBSToTasks(nodes, projectId);
  }

  // Convert WBS to tasks with AI enrichment and auto-audit/apply logic
  async convertWBSToTasksWithAI(p: ConvertWBSToTasksWithAIParams): Promise<WbsConversionResult> {
    // Guard: prevent accidental task explosion
    const estimatedTotalTasks = estimateMicroTaskCount(p.nodes);
    const maxTasksToCreate = 1500;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Conversão abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
        `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    const result: WbsConversionResult = { createdTasks: [], wbsUpdates: [], auditsApplied: [] };

    // Process leaf nodes with optional parallelism (per-leaf)
    const leafConcurrency = this.getNumericEnv('WBS_LEAF_CONCURRENCY', 1);
    const leaves = collectLeafNodesInOrder(p.nodes);

    // Pre-compute deterministic priority offsets based on traversal order.
    let runningOffset = 0;
    const leafJobs = leaves.map((l) => {
      const totalMinutes = Math.max(0, Math.round((l.node.estimatedHours || 0) * 60));
      const chunkMinutes = computeChunkMinutes(totalMinutes);
      const baseOffset = runningOffset;
      runningOffset += chunkMinutes.length;
      return { ...l, chunkMinutes, chunks: chunkMinutes.length, priorityOffset: baseOffset };
    });

    await mapWithConcurrency(leafJobs, leafConcurrency, async (job) => {
      await this.processLeafNode({
        node: job.node,
        nodePath: job.nodePath,
        projectId: p.projectId,
        project: p.project,
        tasksService: p.tasksService,
        options: p.options,
        result,
        priorityOffset: job.priorityOffset,
      });
    });

    await this.finalizeConversion(p.tasksService, p.projectId);
    return result;
  }

  // Process a single leaf node: generate, audit, and create its tasks
  private async processLeafNode(p: ProcessLeafNodeParams): Promise<void> {
    const autoResolveEnabled = !!p.options?.autoResolveDiscrepancies;
    const autoAuditThresholdPct = typeof p.options?.autoAuditThresholdPct === 'number' && Number.isFinite(p.options.autoAuditThresholdPct) ? p.options.autoAuditThresholdPct : 60;

    // Generate tasks for this leaf node based on time estimates and breaks them into chunks
    const leafTaskDtos = await this.taskConversionHelper.generateTasksForLeafNode({
      node: p.node,
      nodePath: p.nodePath,
      projectId: p.projectId,
      priorityOffset: p.priorityOffset || 0,
    });

    if (autoResolveEnabled && leafTaskDtos.length > 0) {
      const budgetHours = Number(p.node.estimatedHours || 0);
      const generatedHoursBefore = leafTaskDtos.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0) / 60;
      const diffPct = budgetHours > 0 ? ((generatedHoursBefore - budgetHours) / budgetHours) * 100 : 0;

      // Only audit if discrepancy exceeds threshold
      if (diffPct >= autoAuditThresholdPct) {
        await this.taskConversionHelper.auditAndResolveLeafDiscrepancy({
          node: p.node,
          nodePath: p.nodePath,
          leafTaskDtos,
          budgetHours,
          generatedHoursBefore,
          result: p.result,
        });
      }
    }

    // Create tasks if any were generated
    if (leafTaskDtos.length > 0) {
      await this.taskConversionHelper.createAndSaveLeaveTasks({
        leafTaskDtos,
        tasksService: p.tasksService,
        nodePath: p.nodePath,
        result: p.result,
      });
    } else {
      console.warn(`[WBS-Conversion] ⚠️ No tasks generated for "${p.nodePath}" (might be invalid leaf or zero hours)`);
    }
  }

  // Finalize conversion: recalculate project statistics
  private async finalizeConversion(tasksService: TasksServiceSubset, projectId: string): Promise<void> {
    try {
      if (typeof tasksService.recalculateProjectStats === 'function') {
        await tasksService.recalculateProjectStats(projectId);
      }
    } catch (err: any) {
      console.warn(`[TaskConversion] Failed to recalculate project stats: ${err?.message || err}`);
    }
  }

  // Convert draft objects into task DTOs ready for database creation
  async convertDraftsToTasks(drafts: MicroTaskDraft[], context: { wbsNode?: WBSNodeDto; project?: { _id?: any; id?: any }; path?: string } = {}): Promise<Task[]> {
    return convertDraftsToTasks(drafts, context);
  }
}
