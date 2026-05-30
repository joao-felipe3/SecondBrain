import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'crypto';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { AuditService, CacheService, DraftGenerationService } from './index';
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
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => DraftGenerationService))
    private readonly draftGenerationService: DraftGenerationService,
    private readonly cacheService: CacheService,
  ) {}

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

  private hashKey(input: any): string {
    const raw = typeof input === 'string' ? input : JSON.stringify(input);
    return createHash('sha1').update(raw).digest('hex').slice(0, 16);
  }

  private buildDraftsWithPlanCacheKey(params: {
    projectId: string;
    node: WBSNodeDto;
    nodePath: string;
    chunkMinutes: number[];
    plan: any;
    modelOverride?: string;
  }): string {
    // Key MUST start with drafts_with_plan:${projectId}: so CacheService.clearForProject can purge it.
    const nodeId = (params.node as any)?._id ? String((params.node as any)._id) : undefined;
    const model =
      params.modelOverride ||
      this.safeEnv('WBS_GEMINI_MODEL') ||
      this.safeEnv('WBS_FAST_MODEL') ||
      this.safeEnv('WBS_MODEL_OVERRIDE') ||
      '';

    const fingerprint = {
      v: 2,
      nodeId,
      nodeName: params.node?.name,
      nodeDesc: params.node?.description,
      nodePath: params.nodePath,
      estimatedHours: params.node?.estimatedHours,
      chunkMinutes: params.chunkMinutes,
      plan: params.plan,
      model,
      // include the most relevant env flags that change output semantics
      twoPass: this.safeEnv('WBS_TWO_PASS_DETAILS'),
      detailsModel: this.safeEnv('WBS_DETAILS_MODEL'),
    };

    const h = this.hashKey(fingerprint);
    return `drafts_with_plan:${params.projectId}:${h}`;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const limit = Math.max(1, Math.floor(concurrency || 1));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const runOne = async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        results[current] = await worker(items[current], current);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) {
      workers.push(runOne());
    }
    await Promise.all(workers);
    return results;
  }

  private collectLeafNodesInOrder(
    nodes: WBSNodeDto[],
    parentPath: string = '',
    level: number = 1,
  ): Array<{ node: WBSNodeDto; nodePath: string; level: number }> {
    const out: Array<{ node: WBSNodeDto; nodePath: string; level: number }> = [];
    const traverse = (nodeList: WBSNodeDto[], p: string, lvl: number) => {
      for (const node of nodeList) {
        const currentPath = p ? `${p} > ${node.name}` : node.name;
        const isLeaf = !node.children || node.children.length === 0;
        if (isLeaf) {
          out.push({ node, nodePath: currentPath, level: lvl });
        } else {
          traverse(node.children || [], currentPath, lvl + 1);
        }
      }
    };
    traverse(nodes, parentPath, level);
    return out;
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
    const leaves = this.collectLeafNodesInOrder(nodes);
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

    await this.mapWithConcurrency(leafJobs, leafConcurrency, async (job) => {
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
    console.log(`[WBS-Conversion] Processing ${nodeList.length} nodes at level ${level}`);
    for (const node of nodeList) {
      const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
      const isLeaf = !node.children || node.children.length === 0;

      console.log(
        `[WBS-Conversion] Node: "${node.name}" (level ${level}, isLeaf: ${isLeaf}, hours: ${node.estimatedHours}h)`,
      );

      if (isLeaf) {
        // Leaf node: process with audit and creation
        console.log(`[WBS-Conversion] Processing leaf node: "${currentPath}"`);
        await this.processLeafNode(node, currentPath, projectId, project, tasksService, options, result);
      } else {
        // Intermediate node: recurse to children
        console.log(
          `[WBS-Conversion] Recursing into branch: "${currentPath}" (${node.children?.length} children)`,
        );
        await this.processWBSNodesRecursively(
          node.children || [],
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
    const leafTaskDtos = await this.generateTasksForLeafNode(node, nodePath, projectId, priorityOffset);
    console.log(
      `[WBS-Conversion] Generated ${leafTaskDtos.length} task(s) for leaf: "${nodePath}"`,
      leafTaskDtos.length > 0 ? leafTaskDtos[0] : 'EMPTY',
    );

    if (autoResolveEnabled && leafTaskDtos.length > 0) {
      const budgetHours = Number(node.estimatedHours || 0);
      const generatedHoursBefore = computeLeafHours(leafTaskDtos);
      const diffPct = budgetHours > 0 ? ((generatedHoursBefore - budgetHours) / budgetHours) * 100 : 0;
      console.log(
        `[WBS-Conversion] Audit check: budget=${budgetHours}h, generated=${generatedHoursBefore}h, diff=${diffPct.toFixed(1)}%`,
      );

      // Only audit if discrepancy exceeds threshold
      if (diffPct >= autoAuditThresholdPct) {
        console.log(
          `[WBS-Conversion] Discrepancy exceeds threshold (${autoAuditThresholdPct}%), auditing...`,
        );
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
      console.log(`[WBS-Conversion] Creating ${leafTaskDtos.length} task(s) for "${nodePath}"`);
      await this.createAndSaveLeaveTasks(leafTaskDtos, tasksService, nodePath, result);
    } else {
      console.warn(
        `[WBS-Conversion] ⚠️ No tasks generated for "${nodePath}" (might be invalid leaf or zero hours)`,
      );
    }
  }

  // Generate tasks for a single leaf node using DraftGenerationService
  private async generateTasksForLeafNode(
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
      const cacheKey = this.buildDraftsWithPlanCacheKey({
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
        drafts = await this.draftGenerationService.generateMicroTasksDraftsForLeafWithPlan(
          {
            project: { _id: projectId },
            node,
            currentPath: nodePath,
            level: 3, // Typical level for leaf nodes
            plan,
          },
          chunkMinutes,
        );

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
  private async auditAndResolveLeafDiscrepancy(
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
    const shrink = this.shrinkLeafTasksToTargetHours(leafTaskDtos, targetHours);
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
  private async createAndSaveLeaveTasks(
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

  // Shrink leaf tasks to target hours by adjusting pomodoros down
  private shrinkLeafTasksToTargetHours(
    tasks: Array<{
      pomodorosPlanned: number;
      pertOptimisticMinutes?: number;
      pertMostLikelyMinutes?: number;
      pertPessimisticMinutes?: number;
      pertExpectedMinutes?: number;
      pertVariance?: number;
    }>,
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
    const finalMinutes = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0) * 25, 0);
    const finalHours = finalMinutes / 60;

    return {
      targetHours: target,
      finalHours,
    };
  }
}
