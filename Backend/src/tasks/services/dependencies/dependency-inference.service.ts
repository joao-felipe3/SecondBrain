import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import {
  inferHeuristicPhases as runHeuristics,
  filterInvalidAndSelfEdges,
  keepAcyclic,
} from './utils/dependency-inference.utils';
import {
  buildInferWithAiPrompt,
  buildRetryPrompt,
  buildInferInterLeafPrompt,
} from '../../../ai/prompts/dependency.prompts';
import {
  InferWithAiDto,
  InferInterLeafWithAiDto,
  InferenceTaskDto,
  InferenceLeafGatesDto,
  InferredDependencyDto,
} from '../../dto/analysis';

// Re-export interfaces for backwards compatibility
export {
  InferenceTask,
  InferredDependency,
  InferenceLeafGates,
} from '../../interfaces/dependency-inference.interface';

@Injectable()
export class DependencyInferenceService {
  private readonly logger = new Logger(DependencyInferenceService.name);

  constructor(private readonly geminiService: GeminiService) { }

  // ===========================================================================
  // 1. Public AI & Heuristic Methods
  // ===========================================================================

  public inferHeuristicPhases(tasks: InferenceTaskDto[]): InferredDependencyDto[] {
    return runHeuristics(tasks);
  }

  public async inferWithAi(params: InferWithAiDto): Promise<InferredDependencyDto[]> {
    const { requestId, tasks, ...dtoRest } = this.sanitizeInput(params);
    if (tasks.length < 2) return [];

    const config = this.getInferenceConfig(tasks.length, params.maxEdges);
    const prompt = buildInferWithAiPrompt({ ...dtoRest, tasks, hardMaxEdges: config.edges });

    const attemptParams = { ...config, prompt, tasks, requestId };

    try {
      return await this.executeInferenceAttempt(attemptParams);
    } catch (err) {
      this.logger.warn(`AI Inference failed for request ${requestId}. Retrying with fallback limits...`);
      return await this.executeRetryAttempt(attemptParams);
    }
  }

  public async inferInterLeafWithAi(params: InferInterLeafWithAiDto): Promise<InferredDependencyDto[]> {
    const sanitized = this.sanitizeInterLeafInput(params);
    if (sanitized.leaves.length < 2) return [];

    const boundaries = this.calculateInterLeafBoundaries(sanitized.leaves, params.maxEdges);
    if (boundaries.validIds.size < 2) return [];

    const model = this.getModelOverride();
    const leafData = this.processLeavesData(sanitized.leaves);

    const prompt = buildInferInterLeafPrompt({
      projectId: sanitized.projectId,
      leaves: sanitized.leaves,
      hardMaxEdges: boundaries.hardMaxEdges,
      leafTable: leafData.leafTable,
    });

    const attemptParams = {
      ...boundaries,
      ...leafData,
      prompt,
      model,
      requestId: sanitized.requestId,
      edges: boundaries.hardMaxEdges,
    };

    try {
      return await this.executeInterLeafAttempt(attemptParams);
    } catch (err) {
      this.logger.warn(`Inter-leaf AI inference failed for request ${sanitized.requestId}. Retrying...`);
      return await this.executeInterLeafRetry(attemptParams);
    }
  }

  // ===========================================================================
  // 2. Private Helpers & Utilities
  // ===========================================================================

  private async executeInferenceAttempt(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
    tasks: InferenceTaskDto[];
    edges: number;
    requestId: string;
  }): Promise<InferredDependencyDto[]> {
    const { prompt, maxOutputTokens, model, tasks, edges, requestId } = params;
    const startedAt = Date.now();
    const rawDeps = await this.getRawInferredDependencies({
      prompt,
      maxOutputTokens,
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
  }

  private calculateInterLeafBoundaries(leaves: InferenceLeafGatesDto[], maxEdgesParam?: number): {
    hardMaxEdges: number;
    maxOutputTokens: number;
    validIds: Set<string>;
  } {
    const fallbackMax = Math.max(4, Math.min(40, Math.floor(leaves.length * 1.5)));
    const maxEdges = Math.max(
      0,
      Math.min(
        this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_EDGES', maxEdgesParam ?? fallbackMax),
        80,
      ),
    );

    const startGateIds = new Set(leaves.map((l) => String(l.startGateId).trim()).filter(Boolean));
    const endGateIds = new Set(leaves.map((l) => String(l.endGateId).trim()).filter(Boolean));
    const validIds = new Set<string>([...startGateIds, ...endGateIds]);

    const hardMaxEdges = Math.min(maxEdges, Math.max(1, leaves.length + 2));
    const maxOutputTokens = this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_TOKENS', 1600);

    return { hardMaxEdges, maxOutputTokens, validIds };
  }

  private async executeInterLeafAttempt(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
    validIds: Set<string>;
    gateToLeafId: Map<string, string>;
    leafById: Map<string, InferenceLeafGatesDto>;
    edges: number;
  }): Promise<InferredDependencyDto[]> {
    const { prompt, maxOutputTokens, model, validIds, gateToLeafId, leafById, edges } = params;
    const rawDeps = await this.getRawInferredDependencies({
      prompt,
      maxOutputTokens,
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
  }

  private async getRawInferredDependencies(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
  }): Promise<InferredDependencyDto[]> {
    return this.geminiService.inferDependencies(params);
  }

  private processLeavesData(leaves: InferenceLeafGatesDto[]) {
    const leafById = new Map<string, InferenceLeafGatesDto>();
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
    deps: InferredDependencyDto[];
    gateToLeafId: Map<string, string>;
    leafById: Map<string, InferenceLeafGatesDto>;
    validIds: Set<string>;
  }): InferredDependencyDto[] {
    const { deps, gateToLeafId, leafById, validIds } = params;
    const normalizedCrossLeaf: InferredDependencyDto[] = [];
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

  private sanitizeInput(params: InferWithAiDto) {
    return {
      requestId: String(params.requestId || '').trim(),
      tasks: (params.tasks || []).filter((t) => t?.id && t?.name),
      wbsPath: params.wbsPath,
      leafName: params.leafName,
    };
  }

  private getInferenceConfig(taskCount: number, customMaxEdges?: number) {
    const envMaxEdges = this.getNumericEnv('CPM_DEP_INFER_MAX_EDGES', customMaxEdges ?? 60);
    const maxEdges = Math.max(0, Math.min(envMaxEdges, 250));
    const hardMaxEdges = Math.min(maxEdges, Math.max(5, taskCount * 2));

    return {
      edges: hardMaxEdges,
      maxOutputTokens: this.getNumericEnv('CPM_DEP_INFER_MAX_TOKENS', 2400),
      model: this.getModelOverride(),
    };
  }

  private async executeRetryAttempt(originalParams: any): Promise<InferredDependencyDto[]> {
    const retryEdges = Math.max(5, Math.floor(originalParams.edges / 2));
    const retryPrompt = buildRetryPrompt(originalParams.prompt, retryEdges);
    const retryTokens = Math.max(800, Math.floor(originalParams.maxOutputTokens * 0.8));

    return this.executeInferenceAttempt({
      ...originalParams,
      prompt: retryPrompt,
      edges: retryEdges,
      maxOutputTokens: retryTokens,
    });
  }

  private sanitizeInterLeafInput(params: InferInterLeafWithAiDto) {
    return {
      requestId: String(params.requestId || '').trim(),
      projectId: String(params.projectId || '').trim(),
      leaves: (params.leaves || []).filter((l) => l?.leafId && l?.startGateId && l?.endGateId),
    };
  }

  private async executeInterLeafRetry(originalParams: any): Promise<InferredDependencyDto[]> {
    const retryEdges = Math.max(2, Math.floor(originalParams.edges / 2));
    const retryPrompt = buildRetryPrompt(originalParams.prompt, retryEdges);
    const retryTokens = Math.max(800, Math.floor(originalParams.maxOutputTokens * 0.85));

    return this.executeInterLeafAttempt({
      ...originalParams,
      prompt: retryPrompt,
      edges: retryEdges,
      maxOutputTokens: retryTokens,
    });
  }
}
