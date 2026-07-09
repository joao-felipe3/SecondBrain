import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { GeminiService } from '../../../ai/gemini.service';
import { extractJsonObject } from '../../../projects/services/wbs/utils/json-parser.util';
import {
  InferenceTask,
  InferredDependency,
  InferenceLeafGates,
} from '../../interfaces/dependency-inference.interface';
import {
  inferHeuristicPhases as runHeuristics,
  filterInvalidAndSelfEdges,
  keepAcyclic,
  normalizeDependencies,
} from './utils/dependency-inference.utils';
import {
  buildInferWithAiPrompt,
  buildRetryPrompt,
  buildInferInterLeafPrompt,
} from '../../../ai/prompts/dependency.prompts';

// Re-export interfaces for backwards compatibility
export {
  InferenceTask,
  InferredDependency,
  InferenceLeafGates,
} from '../../interfaces/dependency-inference.interface';

@Injectable()
export class DependencyInferenceService {
  private readonly logger = new Logger(DependencyInferenceService.name);

  private readonly dependencyObjectSchema = z.object({
    taskId: z.string().min(1),
    dependsOnTaskId: z.string().min(1),
    relationship: z.string().optional(),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  });

  private readonly dependencyTupleSchema = z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1).optional(),
  ]);

  private readonly schema = z
    .object({
      dependencies: z
        .array(z.union([this.dependencyObjectSchema, this.dependencyTupleSchema]))
        .default([]),
    })
    .passthrough();

  constructor(private readonly geminiService: GeminiService) { }

  // ===========================================================================
  // 1. Heuristic & Local Inference
  // ===========================================================================

  public inferHeuristicPhases(tasks: InferenceTask[]): InferredDependency[] {
    return runHeuristics(tasks);
  }

  // ===========================================================================
  // 2. AI-based Inference
  // ===========================================================================

  public async inferWithAi(params: {
    requestId?: string;
    leafName?: string;
    wbsPath?: string;
    tasks: InferenceTask[];
    maxEdges?: number;
  }): Promise<InferredDependency[]> {
    const requestId = String(params.requestId || '').trim();
    const tasks = (params.tasks || []).filter((t) => t?.id && t?.name);
    if (tasks.length < 2) return [];

    const maxEdges = Math.max(
      0,
      Math.min(this.getNumericEnv('CPM_DEP_INFER_MAX_EDGES', params.maxEdges ?? 60), 250),
    );
    const model = this.getModelOverride();
    const hardMaxEdges = Math.min(maxEdges, Math.max(5, tasks.length * 2));

    const prompt = buildInferWithAiPrompt({
      hardMaxEdges,
      wbsPath: params.wbsPath,
      leafName: params.leafName,
      tasks,
    });

    const maxOutputTokens = this.getNumericEnv('CPM_DEP_INFER_MAX_TOKENS', 2400);

    const executeAttempt = async (
      p: string,
      edges: number,
      tokens: number,
    ): Promise<InferredDependency[]> => {
      const startedAt = Date.now();
      const rawDeps = await this.getRawInferredDependencies({
        prompt: p,
        maxOutputTokens: tokens,
        model,
      });
      const validIds = new Set(tasks.map((t) => t.id));
      let deps = filterInvalidAndSelfEdges(rawDeps, validIds);

      deps = deps.slice(0, edges);
      const acyclic = keepAcyclic([...validIds], deps);

      if (this.isVerbose()) {
        this.logger.log(
          `[dep-infer] done requestId=${requestId || '-'} raw=${rawDeps.length} ` +
          `filtered=${deps.length} acyclic=${acyclic.length} durationMs=${Date.now() - startedAt}`,
        );
      }
      return acyclic;
    };

    try {
      return await executeAttempt(prompt, hardMaxEdges, maxOutputTokens);
    } catch (err: any) {
      const retryEdges = Math.max(5, Math.floor(hardMaxEdges / 2));
      const retryPrompt = buildRetryPrompt(prompt, retryEdges);

      return await executeAttempt(
        retryPrompt,
        retryEdges,
        Math.max(800, Math.floor(maxOutputTokens * 0.8)),
      );
    }
  }

  public async inferInterLeafWithAi(params: {
    requestId?: string;
    projectId?: string;
    leaves: InferenceLeafGates[];
    maxEdges?: number;
  }): Promise<InferredDependency[]> {
    const requestId = String(params.requestId || '').trim();
    const projectId = String(params.projectId || '').trim();
    const leaves = (params.leaves || []).filter((l) => l?.leafId && l?.startGateId && l?.endGateId);
    if (leaves.length < 2) return [];

    const model = this.getModelOverride();
    const fallbackMax = Math.max(4, Math.min(40, Math.floor(leaves.length * 1.5)));
    const maxEdges = Math.max(
      0,
      Math.min(
        this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_EDGES', params.maxEdges ?? fallbackMax),
        80,
      ),
    );

    const startGateIds = new Set(leaves.map((l) => String(l.startGateId).trim()).filter(Boolean));
    const endGateIds = new Set(leaves.map((l) => String(l.endGateId).trim()).filter(Boolean));
    const validIds = new Set<string>([...startGateIds, ...endGateIds]);
    if (validIds.size < 2) return [];

    const { leafById, gateToLeafId, leafTable } = this.processLeavesData(leaves);

    const hardMaxEdges = Math.min(maxEdges, Math.max(1, leaves.length + 2));
    const maxOutputTokens = this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_TOKENS', 1600);

    const prompt = buildInferInterLeafPrompt({
      hardMaxEdges,
      projectId,
      leaves,
      leafTable,
    });

    const executeAttempt = async (p: string, edges: number, tokens: number) => {
      const rawDeps = await this.getRawInferredDependencies({
        prompt: p,
        maxOutputTokens: tokens,
        model,
      });
      const filtered = filterInvalidAndSelfEdges(rawDeps, validIds);

      const crossLeafDeps = this.mapGatesToCrossLeafDependencies({
        deps: filtered,
        gateToLeafId,
        leafById,
        validIds,
      });

      const sliced = crossLeafDeps.slice(0, edges);
      return keepAcyclic([...validIds], sliced);
    };

    try {
      return await executeAttempt(prompt, hardMaxEdges, maxOutputTokens);
    } catch (err: any) {
      const retryEdges = Math.max(2, Math.floor(hardMaxEdges / 2));
      const retryPrompt = buildRetryPrompt(prompt, retryEdges);

      return await executeAttempt(
        retryPrompt,
        retryEdges,
        Math.max(800, Math.floor(maxOutputTokens * 0.85)),
      );
    }
  }

  private async getRawInferredDependencies(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
  }): Promise<InferredDependency[]> {
    const { prompt, maxOutputTokens, model } = params;
    const response = await this.geminiService.generateContent(prompt, {
      model,
      responseMimeType: 'application/json',
      maxOutputTokens,
      temperature: 0.2,
    });

    const parsed = extractJsonObject<Record<string, unknown>>(response);
    const validated = this.schema.parse(parsed);
    return normalizeDependencies(validated.dependencies || []);
  }

  private processLeavesData(leaves: InferenceLeafGates[]) {
    const leafById = new Map<string, InferenceLeafGates>();
    const gateToLeafId = new Map<string, string>();

    for (const l of leaves) {
      leafById.set(String(l.leafId), l);
      const s = String(l.startGateId).trim();
      const e = String(l.endGateId).trim();
      if (s) gateToLeafId.set(s, String(l.leafId));
      if (e) gateToLeafId.set(e, String(l.leafId));
    }

    const leafTable = leaves.map((l) => ({
      leafId: String(l.leafId),
      wbsPath: String(l.wbsPath ?? ''),
      leafName: String(l.leafName ?? ''),
      startGateId: String(l.startGateId),
      endGateId: String(l.endGateId),
      taskCount: typeof l.taskCount === 'number' ? l.taskCount : undefined,
    }));

    return { leafById, gateToLeafId, leafTable };
  }

  private mapGatesToCrossLeafDependencies(params: {
    deps: InferredDependency[];
    gateToLeafId: Map<string, string>;
    leafById: Map<string, InferenceLeafGates>;
    validIds: Set<string>;
  }): InferredDependency[] {
    const { deps, gateToLeafId, leafById, validIds } = params;
    const normalizedCrossLeaf: InferredDependency[] = [];
    const seen = new Set<string>();

    for (const d of deps) {
      const a = String(d.taskId).trim();
      const b = String(d.dependsOnTaskId).trim();
      const leafA = gateToLeafId.get(a);
      const leafB = gateToLeafId.get(b);
      if (!leafA || !leafB || leafA === leafB) continue;

      const leafAInfo = leafById.get(leafA);
      const leafBInfo = leafById.get(leafB);
      if (!leafAInfo || !leafBInfo) continue;

      const taskId = String(leafAInfo.startGateId).trim();
      const dependsOnTaskId = String(leafBInfo.endGateId).trim();
      if (!taskId || !dependsOnTaskId) continue;
      if (taskId === dependsOnTaskId) continue;
      if (!validIds.has(taskId) || !validIds.has(dependsOnTaskId)) continue;

      const key = `${taskId}<-${dependsOnTaskId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      normalizedCrossLeaf.push({
        taskId,
        dependsOnTaskId,
        relationship: d.relationship || 'FINISH_TO_START',
      });
    }

    return normalizedCrossLeaf;
  }

  // ===========================================================================
  // 3. Private Helpers & Utilities
  // ===========================================================================

  private safeEnv(name: string): string {
    return String(process.env[name] ?? '').trim();
  }

  private isVerbose(): boolean {
    const raw = this.safeEnv('CPM_DEP_INFER_VERBOSE');
    return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
  }

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  private getModelOverride(): string | undefined {
    return this.safeEnv('CPM_DEP_INFER_MODEL') || this.safeEnv('WBS_GEMINI_MODEL') || undefined;
  }
}
