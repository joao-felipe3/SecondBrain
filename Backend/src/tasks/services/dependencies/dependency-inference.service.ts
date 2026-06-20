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
  truncateText,
  normalizeDependencies,
} from './utils/dependency-inference.utils';

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

  constructor(private readonly geminiService: GeminiService) {}

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

    const prompt = this.buildInferWithAiPrompt({
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
      const rawDeps = await this.getRawInferredDependencies(p, tokens, model);
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
      const retryPrompt = this.buildRetryPrompt(prompt, retryEdges);

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

    const prompt = this.buildInferInterLeafPrompt({
      hardMaxEdges,
      projectId,
      leaves,
      leafTable,
    });

    const executeAttempt = async (p: string, edges: number, tokens: number) => {
      const rawDeps = await this.getRawInferredDependencies(p, tokens, model);
      const filtered = filterInvalidAndSelfEdges(rawDeps, validIds);

      const crossLeafDeps = this.mapGatesToCrossLeafDependencies(
        filtered,
        gateToLeafId,
        leafById,
        validIds,
      );

      const sliced = crossLeafDeps.slice(0, edges);
      return keepAcyclic([...validIds], sliced);
    };

    try {
      return await executeAttempt(prompt, hardMaxEdges, maxOutputTokens);
    } catch (err: any) {
      const retryEdges = Math.max(2, Math.floor(hardMaxEdges / 2));
      const retryPrompt = this.buildRetryPrompt(prompt, retryEdges);

      return await executeAttempt(
        retryPrompt,
        retryEdges,
        Math.max(800, Math.floor(maxOutputTokens * 0.85)),
      );
    }
  }

  private async getRawInferredDependencies(
    prompt: string,
    maxOutputTokens: number,
    model?: string,
  ): Promise<InferredDependency[]> {
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

  private buildInferWithAiPrompt(params: {
    hardMaxEdges: number;
    wbsPath?: string;
    leafName?: string;
    tasks: InferenceTask[];
  }): string {
    return [
      'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências entre micro-tarefas.',
      'Objetivo: construir um DAG (sem ciclos) com dependências MINIMAIS e REALISTAS, preservando PARALelismo quando possível.',
      'Regras:',
      `- Retorne no máximo ${params.hardMaxEdges} dependências.`,
      '- Evite criar uma cadeia linear com todas as tasks; só crie dependência quando houver pré-requisito claro.',
      '- Cada task deve ter 0 a 2 dependências, se possível.',
      '- Só use IDs fornecidos. Não invente tasks.',
      '- Se estiver em dúvida, não crie dependência.',
      '- Use relationship FINISH_TO_START na maioria dos casos. Só use START_TO_START/FINISH_TO_FINISH se for realmente necessário.',
      '- IMPORTANTE: Resposta deve ser JSON VÁLIDO e COMPLETO (nada de markdown, nada de texto extra).',
      '- Mantenha a resposta curta: prefira formato compacto de tuplas e omita reason/confidence.',
      '',
      `Contexto WBS (opcional): ${params.wbsPath || ''}`,
      `Leaf (opcional): ${params.leafName || ''}`,
      '',
      'Entrada (tasks):',
      JSON.stringify(
        params.tasks.map((t) => ({
          id: t.id,
          name: t.name,
          microTaskType: t.microTaskType,
          description: truncateText(t.description, 140),
        })),
      ),
      '',
      'Saída JSON estrita (formato compacto preferido):',
      '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
    ].join('\n');
  }

  private buildRetryPrompt(prompt: string, retryEdges: number): string {
    return [
      prompt,
      '',
      'RETRY: Sua resposta anterior estava truncada ou inválida.',
      `- Agora retorne NO MÁXIMO ${retryEdges} dependências.`,
      '- Use APENAS o formato de tuplas (sem objetos) e SEM reason/confidence.',
      '- Se não conseguir inferir com segurança, retorne {"dependencies": []}.',
    ].join('\n');
  }

  private buildInferInterLeafPrompt(params: {
    hardMaxEdges: number;
    projectId?: string;
    leaves: InferenceLeafGates[];
    leafTable: any[];
  }): string {
    const minEdgesHint = params.leaves.length >= 6 ? 1 : 0;
    return [
      'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências ENTRE leafs (macro-ordenação).',
      'Objetivo: criar poucas dependências REALISTAS para conectar o fluxo do projeto e reduzir paralelismo global irreal.',
      'Regras importantes:',
      `- Retorne no máximo ${params.hardMaxEdges} dependências. Poucas arestas é melhor.`,
      ...(minEdgesHint
        ? [
            `- Como há muitos leafs, retorne pelo menos ${minEdgesHint} dependência se houver qualquer ordem natural do fluxo.`,
          ]
        : []),
      '- Use SOMENTE os IDs de gates fornecidos (startGateId/endGateId). Não invente IDs.',
      '- Preferência: taskId deve ser startGateId do leaf que depende, e dependsOnTaskId deve ser endGateId do leaf pré-requisito.',
      '- Evite criar uma cadeia linear com todos os leafs; conecte apenas quando houver pré-requisito claro ou ordem natural do fluxo.',
      '- Não crie ciclos. Se estiver em dúvida, não crie dependência.',
      '- Resposta deve ser JSON VÁLIDO e COMPLETO (nada de markdown, nada de texto extra).',
      '',
      `Contexto (opcional) projectId: ${params.projectId || ''}`,
      '',
      'Entrada (leafs + gates):',
      JSON.stringify(params.leafTable),
      '',
      'Saída JSON estrita (formato compacto preferido):',
      '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
    ].join('\n');
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

  private mapGatesToCrossLeafDependencies(
    deps: InferredDependency[],
    gateToLeafId: Map<string, string>,
    leafById: Map<string, InferenceLeafGates>,
    validIds: Set<string>,
  ): InferredDependency[] {
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
