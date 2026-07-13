import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { AuditService, CacheService } from '../index';
import { DraftGenerationService } from '../../drafts';
import { computeChunkMinutes } from '../utils/metrics-calculator.util';
import { computeLeafHours } from '../utils/wbs-helpers.util';
import {
  buildDraftsWithPlanCacheKey,
  shrinkLeafTasksToTargetHours,
} from '../utils/task-conversion-helpers.util';

@Injectable()
export class TaskConversionHelperService {
  constructor(
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => DraftGenerationService))
    private readonly draftGenerationService: DraftGenerationService,
    private readonly cacheService: CacheService,
  ) {}

  // Generate tasks for a single leaf node using DraftGenerationService
  async generateTasksForLeafNode(
    node: WBSNodeDto,
    nodePath: string,
    projectId: string,
    priorityOffset: number = 0,
  ): Promise<
    Array<{
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
    }>
  > {
    const tasks: Array<{
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
    }> = [];

    // Only process leaf nodes (no children)
    if (node.children && node.children.length > 0) {
      console.warn(
        `[WBS-Conversion] Node "${node.name}" is not a leaf (has ${node.children.length} children), skipping`,
      );
      return tasks;
    }

    const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
    console.log(`[WBS-Conversion] Generating chunks for "${nodePath}": ${totalMinutes} minutes total`);
    const chunkMinutes = computeChunkMinutes(totalMinutes);
    const chunks = chunkMinutes.length;
    console.log(`[WBS-Conversion] Split into ${chunks} chunk(s): [${chunkMinutes.join(', ')}] minutes`);

    // Calculate deadline: 30 days from now
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    // Generate full drafts using DraftGenerationService (same system as draft-generation)
    try {
      console.log(`[WBS-Conversion] Generating ${chunks} drafts via DraftGenerationService...`);

      const plan = {
        themes: [{ name: node.name }],
        workflow: ['execute'],
      };
      const cacheKey = buildDraftsWithPlanCacheKey({
        projectId,
        node,
        nodePath,
        chunkMinutes,
        plan,
      });

      const cached = await this.cacheService.get(cacheKey);
      let drafts: any[];
      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(
          `[WBS-Conversion] ✅ Cache hit for drafts (items=${cached.length}) keyPrefix=${cacheKey.split(':').slice(0, 3).join(':')}`,
        );
        drafts = cached;
      } else {
        drafts = await this.draftGenerationService.generateMicroTasksDraftsForLeafWithPlan({
          context: {
            project: { _id: projectId },
            node,
            currentPath: nodePath,
            level: 3, // Typical level for leaf nodes
            plan,
          },
          chunkMinutes,
        });

        await this.cacheService.set(cacheKey, drafts);
      }

      console.log(`[WBS-Conversion] ✨ Generated ${drafts.length} micro-task drafts via AI`);

      // Convert drafts to task DTOs
      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i];
        const suffix = chunks > 1 ? ` (${i + 1}/${chunks})` : '';
        const estimatedMinutes = chunkMinutes[i];
        const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));

        const task = {
          name: `${draft.name || node.name}${suffix}`,
          description: draft.description
            ? `${draft.description}\n\nOrigem WBS: ${nodePath} [Micro-tarefa ${i + 1}/${chunks}]`
            : `Origem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${i + 1}/${chunks} (~${estimatedMinutes}min)`,
          estimatedMinutes,
          pomodorosPlanned,
          priority: priorityOffset + i + 1,
          project: projectId,
          deadline,
          isConcluded: false,
          late: false,
          recurrency: 'no-recurrence',
          wbsPath: nodePath,
        };

        console.log(
          `[WBS-Conversion] Created task chunk: "${task.name}" (${estimatedMinutes}min, ${pomodorosPlanned} pomodoros)`,
        );
        tasks.push(task);
      }
    } catch (error: any) {
      console.warn(
        `[WBS-Conversion] ⚠️ DraftGenerationService failed: ${error.message}. Using fallback static descriptions.`,
      );

      // Fallback: generate simple tasks without AI enrichment
      for (let i = 0; i < chunks; i++) {
        const suffix = chunks > 1 ? ` (${i + 1}/${chunks})` : '';
        const estimatedMinutes = chunkMinutes[i];
        const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));

        const fallbackDesc = node.description
          ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${i + 1}/${chunks} (~${estimatedMinutes}min)`
          : `Origem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${i + 1}/${chunks} (~${estimatedMinutes}min)`;

        const task = {
          name: `${node.name}${suffix}`,
          description: fallbackDesc,
          estimatedMinutes,
          pomodorosPlanned,
          priority: priorityOffset + i + 1,
          project: projectId,
          deadline,
          isConcluded: false,
          late: false,
          recurrency: 'no-recurrence',
          wbsPath: nodePath,
        };

        console.log(
          `[WBS-Conversion] Created task chunk (fallback): "${task.name}" (${estimatedMinutes}min, ${pomodorosPlanned} pomodoros)`,
        );
        tasks.push(task);
      }
    }

    return tasks;
  }

  // Audit a leaf node's discrepancy and apply fixes if recommended
  async auditAndResolveLeafDiscrepancy(
    node: WBSNodeDto,
    nodePath: string,
    leafTaskDtos: any[],
    budgetHours: number,
    generatedHoursBefore: number,
    result: any,
  ): Promise<void> {
    try {
      const audit = await this.auditService.auditLeafDiscrepancy({ name: `Project` }, {
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
      } as any);

      const nodeId = (node as any)?._id ? String((node as any)._id) : undefined;
      const suggestedHoursRaw = Number((audit as any)?.suggestedEstimatedHours);
      const hasSuggestedHours = Number.isFinite(suggestedHoursRaw) && suggestedHoursRaw > 0;

      if ((audit as any)?.suggestedAction === 'simplify') {
        this.applySimplifyFix(
          node,
          nodeId,
          leafTaskDtos,
          budgetHours,
          suggestedHoursRaw,
          hasSuggestedHours,
          nodePath,
          audit,
          result,
        );
      } else if ((audit as any)?.suggestedAction === 'rebaseline') {
        this.applyRebaselineFix(
          node,
          nodeId,
          budgetHours,
          generatedHoursBefore,
          suggestedHoursRaw,
          hasSuggestedHours,
          nodePath,
          audit,
          result,
        );
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
      console.warn(`[TaskConversion] auto-audit failed for leaf="${node.name}": ${err?.message || err}`);
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
    const shrink = shrinkLeafTasksToTargetHours(leafTaskDtos, targetHours);
    const finalHours = shrink.finalHours;
    const finalEstimatedHours =
      Math.round((hasSuggestedHours ? shrink.targetHours : finalHours) * 2) / 2;

    node.estimatedHours = finalEstimatedHours;
    if (nodeId) {
      result.wbsUpdates.push({
        nodeId,
        newEstimatedHours: finalEstimatedHours,
      });
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
  async createAndSaveLeaveTasks(
    leafTaskDtos: any[],
    tasksService: any,
    nodePath: string,
    result: any,
  ): Promise<void> {
    try {
      console.log(`[WBS-Conversion] Saving ${leafTaskDtos.length} tasks for "${nodePath}"`, {
        firstTask: leafTaskDtos[0]?.name,
        hasCreateMany: typeof tasksService.createMany === 'function',
      });

      if (typeof tasksService.createMany === 'function') {
        console.log(`[WBS-Conversion] Using batch creation method`);
        const created = await tasksService.createMany(leafTaskDtos, {
          resolveProject: false,
          recalculateProjectStats: false,
        });
        console.log(`[WBS-Conversion] Batch creation returned ${created?.length || 0} task(s)`);
        for (const createdTask of created) {
          result.createdTasks.push(createdTask);
        }
      } else {
        // Fallback: sequential creation
        console.log(`[WBS-Conversion] Using sequential creation method`);
        for (const dto of leafTaskDtos) {
          try {
            console.log(`[WBS-Conversion] Creating task: "${dto?.name}"`);
            const createdTask = await tasksService.create(dto);
            result.createdTasks.push(createdTask);
            console.log(`[WBS-Conversion] ✅ Created task: "${dto?.name}"`);
          } catch (error: any) {
            console.error(
              `[WBS-Conversion] ❌ Failed to create "${dto?.name}": ${error?.message}`,
              error,
            );
          }
        }
      }
    } catch (error: any) {
      console.error(
        `[WBS-Conversion] ❌ Batch creation failed for "${nodePath}": ${error?.message || error}`,
        error,
      );
    }
  }
}
