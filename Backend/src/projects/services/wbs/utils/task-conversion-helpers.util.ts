import { createHash } from 'crypto';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { computePertFromMinutes, computeChunkMinutes } from './metrics-calculator.util';
import {
  GeneratedTaskDto,
  Task,
  ShrinkTaskInput,
  ShrinkResult,
  LegacyGeneratedTask,
  DraftToTaskContext,
  DraftsWithPlanCacheParams,
  MapDraftsToTasksParams,
  GenerateFallbackTasksParams,
  MicroTaskDraft,
} from '../../../interfaces';

export function hashKey(input: unknown): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

export function buildDraftsWithPlanCacheKey(params: DraftsWithPlanCacheParams): string {
  const nodeId = params.node?._id ? String(params.node._id) : undefined;
  const model =
    params.modelOverride ||
    String(process.env.WBS_GEMINI_MODEL || '').trim() ||
    String(process.env.WBS_FAST_MODEL || '').trim() ||
    String(process.env.WBS_MODEL_OVERRIDE || '').trim() ||
    '';

  const fingerprint = {
    v: 2,
    nodeId,
    nodeName: params.node?.name,
    nodeDesc: params.node?.description,
    nodePath: params.nodePath,
    estimatedHours: params.node?.estimatedHours,
    chunkMinutes: params.chunkMinutes,
    plan: params.plan as unknown,
    model,
    twoPass: String(process.env.WBS_TWO_PASS_DETAILS || '').trim(),
    detailsModel: String(process.env.WBS_DETAILS_MODEL || '').trim(),
  };

  const h = hashKey(fingerprint);
  return `drafts_with_plan:${params.projectId}:${h}`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency || 1));
  const results: R[] = new Array<R>(items.length);
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

export function collectLeafNodesInOrder(
  nodes: WBSNodeDto[],
  parentPath = '',
  level = 1,
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

export function shrinkLeafTasksToTargetHours(
  tasks: ShrinkTaskInput[],
  targetHours: number,
): ShrinkResult {
  const currentHours = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 1) * 25, 0) / 60;
  if (currentHours <= targetHours) {
    return { targetHours, finalHours: currentHours };
  }

  const factor = targetHours / currentHours;
  let finalMinutesSum = 0;

  for (const t of tasks) {
    const planned = t.pomodorosPlanned || 1;
    const currentMin = planned * 25;
    const targetMin = currentMin * factor;
    const finalPomos = Math.max(1, Math.round(targetMin / 25));
    t.pomodorosPlanned = finalPomos;

    const finalMin = finalPomos * 25;
    finalMinutesSum += finalMin;

    const computed = computePertFromMinutes(finalMin);

    t.pertOptimisticMinutes = computed.optimistic;
    t.pertMostLikelyMinutes = computed.mostLikely;
    t.pertPessimisticMinutes = computed.pessimistic;
    t.pertExpectedMinutes = computed.expected;
    t.pertVariance = computed.variance;
  }

  return { targetHours, finalHours: finalMinutesSum / 60 };
}

// Convert WBS leaf nodes into tasks (legacy - simple conversion)
export function convertWBSToTasks(nodes: WBSNodeDto[], projectId: string): LegacyGeneratedTask[] {
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

// Convert draft objects into task DTOs ready for database creation
export function convertDraftsToTasks(
  drafts: MicroTaskDraft[],
  context: DraftToTaskContext = {},
): Task[] {
  const ctx = context || {};
  if (!drafts || drafts.length === 0) {
    return [];
  }

  const tasks: Record<string, unknown>[] = [];
  let taskIndex = 1;
  const totalTasks = drafts.length;

  let projectId: string | undefined;
  if (ctx.project?._id != null) {
    projectId = String(ctx.project._id);
  } else if (ctx.project?.id != null) {
    projectId = String(ctx.project.id);
  }
  const parentWbsNodeId = ctx.wbsNode?._id || ctx.wbsNode?.name;

  for (const draft of drafts) {
    const task: Record<string, unknown> = {
      name: String(draft.name || `Tarefa ${taskIndex}`).trim(),
      description: (draft.description || '').trim() || undefined,
      // Canonical fields used by Task schema/DTO
      project: projectId,
      parentWbsNodeId,
      wbsPath: ctx.path,

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

  return tasks as unknown as Task[];
}

export function mapDraftsToTasks(params: MapDraftsToTasksParams): GeneratedTaskDto[] {
  const { drafts, node, nodePath, projectId, chunkMinutes, priorityOffset, deadline } = params;
  const tasks: GeneratedTaskDto[] = [];
  const chunks = chunkMinutes.length;

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const suffix = chunks > 1 ? ` (${i + 1}/${chunks})` : '';
    const estimatedMinutes = chunkMinutes[i];
    const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));

    tasks.push({
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
      microTaskType: draft.microTaskType,
      themeTag: draft.themeTag,
      contextTag: draft.contextTag,
      cognitiveMode: draft.cognitiveMode,
    });
  }
  return tasks;
}

export function generateFallbackTasks(params: GenerateFallbackTasksParams): GeneratedTaskDto[] {
  const { node, nodePath, projectId, chunkMinutes, priorityOffset, deadline } = params;
  const tasks: GeneratedTaskDto[] = [];
  const chunks = chunkMinutes.length;

  for (let i = 0; i < chunks; i++) {
    const suffix = chunks > 1 ? ` (${i + 1}/${chunks})` : '';
    const estimatedMinutes = chunkMinutes[i];
    const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));

    const fallbackDesc = node.description
      ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${i + 1}/${chunks} (~${estimatedMinutes}min)`
      : `Origem WBS (pacote 8/80): ${nodePath}\nMicro-tarefa: ${i + 1}/${chunks} (~${estimatedMinutes}min)`;

    tasks.push({
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
    });
  }
  return tasks;
}
