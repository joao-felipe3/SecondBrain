import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { TaskConversionHelperService } from './task-conversion-helper.service';
import {
  computeChunkMinutes,
  estimateMicroTaskCount,
} from '../utils/metrics-calculator.util';
import {
  collectLeafNodesInOrder,
  mapWithConcurrency,
} from '../utils/task-conversion-helpers.util';

@Injectable()
export class TaskConversionService {
  constructor(
    private readonly taskConversionHelper: TaskConversionHelperService,
  ) { }

  private safeEnv(name: string): string {
    const v = process.env[name];
    return String(v ?? '').trim();
  }

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  // Convert WBS leaf nodes into tasks (legacy - simple conversion)
  convertWBSToTasks(
    nodes: WBSNodeDto[],
    projectId: string,
  ): Array<{
    name: string;
    description: string;
    projectId: string;
    estimatedMinutes: number;
    priority: number;
    pomodorosPlanned: number;
  }> {
    const tasks: Array<{
      name: string;
      description: string;
      projectId: string;
      estimatedMinutes: number;
      priority: number;
      pomodorosPlanned: number;
    }> = [];

    let priorityCounter = 1;

    const traverse = (nodeList: WBSNodeDto[], parentPath: string = '') => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes = computeChunkMinutes(totalMinutes);
          const chunks = chunkMinutes.length;

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];
            const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            tasks.push({
              name: `${node.name}${suffix}`,
              description: node.description
                ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`
                : `Origem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`,
              projectId,
              estimatedMinutes,
              priority: priorityCounter++,
              pomodorosPlanned,
            });
          }
        } else {
          traverse(node.children, currentPath);
        }
      }
    };

    traverse(nodes);
    return tasks;
  }

  // Convert WBS to tasks with AI enrichment and auto-audit/apply logic
  async convertWBSToTasksWithAI(
    nodes: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: {
      create: (dto: any) => Promise<any>;
      createMany?: (dtos: any[], options?: any) => Promise<any[]>;
      recalculateProjectStats?: (projectId: string) => Promise<void>;
    },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
    },
    options?: {
      autoResolveDiscrepancies?: boolean;
      autoAuditThresholdPct?: number;
    },
  ): Promise<{
    createdTasks: any[];
    wbsUpdates: Array<{ nodeId: string; newEstimatedHours: number }>;
    auditsApplied: Array<{
      nodeId?: string;
      nodePath: string;
      budgetHours: number;
      generatedHours: number;
      appliedAction: 'rebaseline' | 'simplify' | 'none';
      diagnosis?: string;
      suggestedEstimatedHours?: number;
      finalHours?: number;
    }>;
  }> {
    // Guard: prevent accidental task explosion
    const estimatedTotalTasks = estimateMicroTaskCount(nodes);
    const maxTasksToCreate = 1500;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Conversão abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
        `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    // Initialize tracking
    const result = {
      createdTasks: [] as any[],
      wbsUpdates: [] as Array<{ nodeId: string; newEstimatedHours: number }>,
      auditsApplied: [] as Array<{
        nodeId?: string;
        nodePath: string;
        budgetHours: number;
        generatedHours: number;
        appliedAction: 'rebaseline' | 'simplify' | 'none';
        diagnosis?: string;
        suggestedEstimatedHours?: number;
        finalHours?: number;
      }>,
    };

    // Process leaf nodes with optional parallelism (per-leaf), keeping per-leaf generation quality intact.
    const leafConcurrency = this.getNumericEnv('WBS_LEAF_CONCURRENCY', 1);
    const leaves = collectLeafNodesInOrder(nodes);
    console.log(
      `[WBS-Conversion] Found ${leaves.length} leaf node(s). leafConcurrency=${leafConcurrency}`,
    );

    // Pre-compute deterministic priority offsets based on traversal order.
    let runningOffset = 0;
    const leafJobs = leaves.map((l) => {
      const totalMinutes = Math.max(0, Math.round((l.node.estimatedHours || 0) * 60));
      const chunkMinutes = computeChunkMinutes(totalMinutes);
      const chunks = chunkMinutes.length;
      const baseOffset = runningOffset;
      runningOffset += chunks;
      return {
        ...l,
        chunkMinutes,
        chunks,
        priorityOffset: baseOffset,
      };
    });

    await mapWithConcurrency(leafJobs, leafConcurrency, async (job) => {
      console.log(`[WBS-Conversion] Processing leaf node: "${job.nodePath}" (chunks=${job.chunks})`);
      await this.processLeafNode(
        job.node,
        job.nodePath,
        projectId,
        project,
        tasksService,
        options,
        result,
        job.priorityOffset,
      );
    });

    // Finalize: recalculate project stats
    await this.finalizeConversion(tasksService, projectId);

    return result;
  }

  // Process a single leaf node: generate, audit, and create its tasks
  private async processLeafNode(
    node: WBSNodeDto,
    nodePath: string,
    projectId: string,
    project: any,
    tasksService: any,
    options: any,
    result: any,
    priorityOffset: number = 0,
  ): Promise<void> {
    console.log(`[WBS-Conversion] === Processing Leaf: "${nodePath}" (${node.estimatedHours}h) ===`);

    const autoResolveEnabled = !!options?.autoResolveDiscrepancies;
    const autoAuditThresholdPct =
      typeof options?.autoAuditThresholdPct === 'number' &&
        Number.isFinite(options.autoAuditThresholdPct)
        ? options.autoAuditThresholdPct
        : 60;

    // Generate tasks for this leaf node based on time estimates and breaks them into chunks
    const leafTaskDtos = await this.taskConversionHelper.generateTasksForLeafNode(
      node,
      nodePath,
      projectId,
      priorityOffset,
    );
    console.log(
      `[WBS-Conversion] Generated ${leafTaskDtos.length} task(s) for leaf: "${nodePath}"`,
      leafTaskDtos.length > 0 ? leafTaskDtos[0] : 'EMPTY',
    );

    if (autoResolveEnabled && leafTaskDtos.length > 0) {
      const budgetHours = Number(node.estimatedHours || 0);
      const generatedHoursBefore = (leafTaskDtos.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0)) / 60;
      const diffPct = budgetHours > 0 ? ((generatedHoursBefore - budgetHours) / budgetHours) * 100 : 0;
      console.log(
        `[WBS-Conversion] Audit check: budget=${budgetHours}h, generated=${generatedHoursBefore}h, diff=${diffPct.toFixed(1)}%`,
      );

      // Only audit if discrepancy exceeds threshold
      if (diffPct >= autoAuditThresholdPct) {
        console.log(
          `[WBS-Conversion] Discrepancy exceeds threshold (${autoAuditThresholdPct}%), auditing...`,
        );
        await this.taskConversionHelper.auditAndResolveLeafDiscrepancy(
          node,
          nodePath,
          leafTaskDtos,
          budgetHours,
          generatedHoursBefore,
          result,
        );
      }
    }

    // Create tasks if any were generated
    if (leafTaskDtos.length > 0) {
      console.log(`[WBS-Conversion] Creating ${leafTaskDtos.length} task(s) for "${nodePath}"`);
      await this.taskConversionHelper.createAndSaveLeaveTasks(leafTaskDtos, tasksService, nodePath, result);
    } else {
      console.warn(
        `[WBS-Conversion] ⚠️ No tasks generated for "${nodePath}" (might be invalid leaf or zero hours)`,
      );
    }
  }

  // Finalize conversion: recalculate project statistics
  private async finalizeConversion(tasksService: any, projectId: string): Promise<void> {
    try {
      if (typeof tasksService.recalculateProjectStats === 'function') {
        await tasksService.recalculateProjectStats(projectId);
      }
    } catch (err: any) {
      console.warn(`[TaskConversion] Failed to recalculate project stats: ${err?.message || err}`);
    }
  }

  // Convert draft objects into task DTOs ready for database creation
  async convertDraftsToTasks(
    drafts: Array<{
      name: string;
      description?: string;
      checklist?: string[];
      definitionOfDone?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
    context: {
      wbsNode?: WBSNodeDto;
      project?: any;
      path?: string;
    } = {},
  ): Promise<any[]> {
    if (!drafts || drafts.length === 0) {
      return [];
    }

    const tasks: any[] = [];
    let taskIndex = 1;
    const totalTasks = drafts.length;

    const projectId = context.project?._id || context.project?.id;
    const parentWbsNodeId = context.wbsNode?._id || context.wbsNode?.name;

    for (const draft of drafts) {
      const task: any = {
        name: String(draft.name || `Tarefa ${taskIndex}`).trim(),
        description: (draft.description || '').trim() || undefined,
        // Canonical fields used by Task schema/DTO
        project: projectId,
        parentWbsNodeId,
        wbsPath: context.path,

        // Backward-compatible aliases (some clients used these)
        projectId,
        wbsNodeId: parentWbsNodeId,

        // Task-specific fields from draft
        checklist: Array.isArray(draft.checklist) ? draft.checklist : [],
        definitionOfDone: (draft.definitionOfDone || '').trim() || undefined,
        estimatedMinutes: (draft.pomodorosPlanned || 1) * 25,
        pomodorosPlanned: Math.max(1, Math.min(6, draft.pomodorosPlanned || 1)),
        priority: Math.max(1, Math.min(4, draft.priority || 2)),
        difficult: Math.max(1, Math.min(4, draft.difficult || 2)),

        // Metadata from draft
        microTaskType: draft.microTaskType || 'execute',
        themeTag: (draft.themeTag || '').trim() || undefined,
        contextTag: (draft.contextTag || '').trim() || undefined,
        cognitiveMode: draft.cognitiveMode || 'medium',
        milestoneIndex: draft.milestoneIndex || undefined,

        // Index info
        taskIndexInBatch: taskIndex,
        totalTasksInBatch: totalTasks,
      };

      tasks.push(task);
      taskIndex++;
    }

    return tasks;
  }
}
