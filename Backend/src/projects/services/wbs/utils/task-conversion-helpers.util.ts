import { createHash } from 'crypto';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { computePertFromMinutes } from './metrics-calculator.util';

export function hashKey(input: any): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

export function buildDraftsWithPlanCacheKey(params: {
  projectId: string;
  node: WBSNodeDto;
  nodePath: string;
  chunkMinutes: number[];
  plan: any;
  modelOverride?: string;
}): string {
  const nodeId = (params.node as any)?._id ? String((params.node as any)._id) : undefined;
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
    plan: params.plan,
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
  const minHours = chunks * 0.5;

  const target = Math.max(minHours, Math.round(targetHours * 2) / 2);
  let currentPom = tasks.reduce((sum, t) => sum + Number(t?.pomodorosPlanned || 0), 0);
  const targetPom = Math.round(target / 0.5);

  while (currentPom > targetPom) {
    let bestIdx = -1;
    let bestPom = 1;

    for (let i = 0; i < tasks.length; i++) {
      const pom = Number(tasks[i]?.pomodorosPlanned || 0);
      if (pom > bestPom) {
        bestPom = pom;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    tasks[bestIdx].pomodorosPlanned = bestPom - 1;
    const pert = computePertFromMinutes((bestPom - 1) * 25);
    tasks[bestIdx].pertOptimisticMinutes = pert.optimistic;
    tasks[bestIdx].pertMostLikelyMinutes = pert.mostLikely;
    tasks[bestIdx].pertPessimisticMinutes = pert.pessimistic;
    tasks[bestIdx].pertExpectedMinutes = pert.expected;
    currentPom -= 1;
  }

  const finalMinutes = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0) * 25, 0);
  const finalHours = finalMinutes / 60;

  return {
    targetHours: target,
    finalHours,
  };
}
