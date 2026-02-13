import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../tasks/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { AuditService } from './index';
import {
  computeChunkMinutes,
  computePertFromMinutes,
  estimateMicroTaskCount,
} from '../utils/metrics-calculator.util';
import { computeLeafHours } from '../utils/wbs-helpers.util';


// Handles conversion of WBS nodes to micro-tasks, including AI enrichment and auto-audit/apply logic
@Injectable()
export class TaskConversionService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly auditService: AuditService,
  ) {}

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

    // Process WBS tree recursively
    await this.processWBSNodesRecursively(
      nodes,
      projectId,
      project,
      tasksService,
      preferences,
      options,
      result,
    );

    // Finalize: recalculate project stats
    await this.finalizeConversion(tasksService, projectId);

    return result;
  }

  // Recursively traverses WBS nodes and processes each leaf
  // Handles auditoria and task creation for each leaf node
  private async processWBSNodesRecursively(
    nodeList: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: any,
    preferences: any,
    options: any,
    result: any,
    parentPath: string = '',
    level: number = 1,
  ): Promise<void> {
    for (const node of nodeList) {
      const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

      if (!node.children || node.children.length === 0) {
        // Leaf node: process with audit and creation
        await this.processLeafNode(node, currentPath, tasksService, options, result);
      } else {
        // Intermediate node: recurse to children
        await this.processWBSNodesRecursively(
          node.children,
          projectId,
          project,
          tasksService,
          preferences,
          options,
          result,
          currentPath,
          level + 1,
        );
      }
    }
  }

  // Process a single leaf node: generate, audit, and create its tasks
  private async processLeafNode(
    node: WBSNodeDto,
    nodePath: string,
    tasksService: any,
    options: any,
    result: any,
  ): Promise<void> {
    const autoResolveEnabled = !!options?.autoResolveDiscrepancies;
    const autoAuditThresholdPct =
      typeof options?.autoAuditThresholdPct === 'number' && Number.isFinite(options.autoAuditThresholdPct)
        ? options.autoAuditThresholdPct
        : 60;

    // Generate tasks for this leaf node based on time estimates and breaks them into chunks
    const leafTaskDtos = this.generateTasksForLeafNode(node, nodePath, result.createdTasks.length);

    if (autoResolveEnabled && leafTaskDtos.length > 0) {
      const budgetHours = Number(node.estimatedHours || 0);
      const generatedHoursBefore = computeLeafHours(leafTaskDtos);
      const diffPct = budgetHours > 0 ? ((generatedHoursBefore - budgetHours) / budgetHours) * 100 : 0;

      // Only audit if discrepancy exceeds threshold
      if (diffPct >= autoAuditThresholdPct) {
        await this.auditAndResolveLeafDiscrepancy(
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
      await this.createAndSaveLeaveTasks(leafTaskDtos, tasksService, nodePath, result);
    }
  }

  // Generate tasks for a single leaf node by splitting into chunks
  private generateTasksForLeafNode(
    node: WBSNodeDto,
    nodePath: string,
    priorityOffset: number = 0,
  ): Array<{
    name: string;
    description: string;
    estimatedMinutes: number;
    pomodorosPlanned: number;
    priority: number;
  }> {
    const tasks: Array<{
      name: string;
      description: string;
      estimatedMinutes: number;
      pomodorosPlanned: number;
      priority: number;
    }> = [];

    // Only process leaf nodes (no children)
    if (node.children && node.children.length > 0) {
      return tasks;
    }

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
          ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`
          : `Origem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`,
        estimatedMinutes,
        pomodorosPlanned,
        priority: priorityOffset + chunkIndex + 1,
      });
    }

    return tasks;
  }

  // Audit a leaf node's discrepancy and apply fixes if recommended
  private async auditAndResolveLeafDiscrepancy(
    node: WBSNodeDto,
    nodePath: string,
    leafTaskDtos: any[],
    budgetHours: number,
    generatedHoursBefore: number,
    result: any,
  ): Promise<void> {
    try {
      const audit = await this.auditService.auditLeafDiscrepancy(
        { name: `Project` },
        {
          leafNode: node as any,
          nodePath,
          generatedHours: generatedHoursBefore,
          tasks: leafTaskDtos.map((t: any) => ({
            name: String(t?.name || ''),
            pomodorosPlanned: Number(t?.pomodorosPlanned || 1),
            priority: typeof t?.priority === 'number' ? t.priority : undefined,
            microTaskType: t?.microTaskType,
            themeTag: Array.isArray(t?.themeTag) ? String(t.themeTag[0] || '') : t?.themeTag,
            contextTag: t?.contextTag,
            cognitiveMode: t?.cognitiveMode,
          })),
        } as any,
      );

      const nodeId = (node as any)?._id ? String((node as any)._id) : undefined;
      const suggestedHoursRaw = Number((audit as any)?.suggestedEstimatedHours);
      const hasSuggestedHours = Number.isFinite(suggestedHoursRaw) && suggestedHoursRaw > 0;

      if ((audit as any)?.suggestedAction === 'simplify') {
        this.applySimplifyFix(node, nodeId, leafTaskDtos, budgetHours, suggestedHoursRaw, hasSuggestedHours, nodePath, audit, result);
      } else if ((audit as any)?.suggestedAction === 'rebaseline') {
        this.applyRebaselineFix(node, nodeId, budgetHours, generatedHoursBefore, suggestedHoursRaw, hasSuggestedHours, nodePath, audit, result);
      } else {
        result.auditsApplied.push({
          nodeId,
          nodePath,
          budgetHours,
          generatedHours: generatedHoursBefore,
          appliedAction: 'none',
          diagnosis: (audit as any)?.diagnosis,
          suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
          finalHours: generatedHoursBefore,
        });
      }
    } catch (err: any) {
      console.warn(
        `[TaskConversion] auto-audit failed for leaf="${node.name}": ${err?.message || err}`,
      );
    }
  }

  // Apply simplify fix: reduce task scope to fit budget
  private applySimplifyFix(
    node: WBSNodeDto,
    nodeId: string | undefined,
    leafTaskDtos: any[],
    budgetHours: number,
    suggestedHoursRaw: number,
    hasSuggestedHours: boolean,
    nodePath: string,
    audit: any,
    result: any,
  ): void {
    const targetHours = hasSuggestedHours ? suggestedHoursRaw : budgetHours;
    const shrink = this.shrinkLeafTasksToTargetHours(leafTaskDtos, targetHours);
    const finalHours = shrink.finalHours;
    const finalEstimatedHours = Math.round((hasSuggestedHours ? shrink.targetHours : finalHours) * 2) / 2;

    node.estimatedHours = finalEstimatedHours;
    if (nodeId) {
      result.wbsUpdates.push({ nodeId, newEstimatedHours: finalEstimatedHours });
    }

    result.auditsApplied.push({
      nodeId,
      nodePath,
      budgetHours,
      generatedHours: computeLeafHours(leafTaskDtos),
      appliedAction: 'simplify',
      diagnosis: audit?.diagnosis,
      suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
      finalHours,
    });
  }

  // Apply rebaseline fix: update WBS estimate to reflect actual task complexity
  private applyRebaselineFix(
    node: WBSNodeDto,
    nodeId: string | undefined,
    budgetHours: number,
    generatedHoursBefore: number,
    suggestedHoursRaw: number,
    hasSuggestedHours: boolean,
    nodePath: string,
    audit: any,
    result: any,
  ): void {
    const newHoursRaw = hasSuggestedHours ? suggestedHoursRaw : generatedHoursBefore;
    const newHours = Math.max(budgetHours, Math.round(newHoursRaw * 2) / 2);

    node.estimatedHours = newHours;
    if (nodeId) {
      result.wbsUpdates.push({ nodeId, newEstimatedHours: newHours });
    }

    result.auditsApplied.push({
      nodeId,
      nodePath,
      budgetHours,
      generatedHours: generatedHoursBefore,
      appliedAction: 'rebaseline',
      diagnosis: audit?.diagnosis,
      suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
      finalHours: generatedHoursBefore,
    });
  }

  // Create and save leaf tasks in batch
  private async createAndSaveLeaveTasks(
    leafTaskDtos: any[],
    tasksService: any,
    nodePath: string,
    result: any,
  ): Promise<void> {
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
        // Fallback: sequential creation
        for (const dto of leafTaskDtos) {
          try {
            const createdTask = await tasksService.create(dto);
            result.createdTasks.push(createdTask);
          } catch (error: any) {
            console.error(`[TaskConversion] Failed to create "${dto?.name}": ${error?.message}`);
          }
        }
      }
    } catch (error: any) {
      console.error(
        `[TaskConversion] Batch creation failed for "${nodePath}": ${error?.message || error}`,
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

    for (const draft of drafts) {
      const task: any = {
        name: String(draft.name || `Tarefa ${taskIndex}`).trim(),
        description: (draft.description || '').trim() || undefined,
        projectId: context.project?._id || context.project?.id,
        wbsNodeId: context.wbsNode?._id || context.wbsNode?.name,
        wbsPath: context.path,

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


  // Shrink leaf tasks to target hours by adjusting pomodoros down
  private shrinkLeafTasksToTargetHours(
    tasks: Array<{ pomodorosPlanned: number; pertOptimisticMinutes?: number; pertMostLikelyMinutes?: number; pertPessimisticMinutes?: number; pertExpectedMinutes?: number; pertVariance?: number }>,
    targetHours: number,
  ): { targetHours: number; finalHours: number } {

    const chunks = tasks.length;
    const minHours = chunks * 0.5; // min 1 pomodoro per task
    
    // Ensure the target hours is at least the minimum allowed (minHours)
    // and round the requested `targetHours` to the nearest 0.5 hour
    const target = Math.max(minHours, Math.round(targetHours * 2) / 2);

    // Sum current planned pomodoros across all tasks
    let currentPom = tasks.reduce((sum, t) => sum + Number(t?.pomodorosPlanned || 0), 0);

    // Convert the target hours into an integer count expressed in "pomodoro units".
    const targetPom = Math.round(target / 0.5);

    // While we still exceed the target (in pomodoro units), reduce the
    // largest task(s) by one pomodoro at a time.
    while (currentPom > targetPom) {
      let bestIdx = -1;
      let bestPom = 1;

      // Find task index with the largest pomodorosPlanned
      for (let i = 0; i < tasks.length; i++) {
        const pom = Number(tasks[i]?.pomodorosPlanned || 0);
        if (pom > bestPom) {
          bestPom = pom;
          bestIdx = i;
        }
      }

      // If no task has more than the baseline (1), break out
      if (bestIdx === -1) break;

      // Reduce that task by one pomodoro and update its PERT minutes
      tasks[bestIdx].pomodorosPlanned = bestPom - 1;
      const pert = computePertFromMinutes((bestPom - 1) * 25);
      tasks[bestIdx].pertOptimisticMinutes = pert.optimistic;
      tasks[bestIdx].pertMostLikelyMinutes = pert.mostLikely;
      tasks[bestIdx].pertPessimisticMinutes = pert.pessimistic;
      tasks[bestIdx].pertExpectedMinutes = pert.expected;
      currentPom -= 1;
    }

    // Recompute the final total minutes/hours based on updated pomodoro counts
    const finalMinutes = tasks.reduce((sum, t) => sum + ((t.pomodorosPlanned || 0) * 25), 0);
    const finalHours = finalMinutes / 60;

    return {
      targetHours: target,
      finalHours,
    };
  }
}

