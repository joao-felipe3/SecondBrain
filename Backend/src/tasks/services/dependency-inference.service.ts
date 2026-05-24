import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { GeminiService } from '../../ai/gemini.service';
import { extractJsonObject } from '../../projects/wbs/utils/json-parser.util';

export type InferenceTask = {
  id: string;
  name: string;
  description?: string;
  checklist?: string[];
  definitionOfDone?: string;
  microTaskType?: string;
};

export type InferredDependency = {
  taskId: string;
  dependsOnTaskId: string;
  relationship?: string;
  reason?: string;
  confidence?: number;
};

export type InferenceLeafGates = {
  leafId: string;
  wbsPath?: string;
  leafName?: string;
  startGateId: string;
  endGateId: string;
  taskCount?: number;
};

@Injectable()
export class DependencyInferenceService {
  private readonly logger = new Logger(DependencyInferenceService.name);

  constructor(private readonly geminiService: GeminiService) {}

  private truncateText(input: unknown, maxLen: number): string | undefined {
    const s = String(input ?? '').trim();
    if (!s) return undefined;
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '…';
  }

  private safeEnv(name: string): string {
    return String(process.env[name] ?? '').trim();
  }

  private isVerbose(): boolean {
    const raw = this.safeEnv('CPM_DEP_INFER_VERBOSE');
    return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
  }

  private previewText(input: unknown, maxLen: number): string {
    const s = String(input ?? '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '…';
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

  private dependencyObjectSchema = z.object({
    taskId: z.string().min(1),
    dependsOnTaskId: z.string().min(1),
    relationship: z.string().optional(),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  });

  // Compact format: [taskId, dependsOnTaskId, relationship?]
  private dependencyTupleSchema = z.tuple([z.string().min(1), z.string().min(1), z.string().min(1).optional()]);

  private schema = z
    .object({
      dependencies: z
        .array(z.union([this.dependencyObjectSchema, this.dependencyTupleSchema]))
        .default([]),
    })
    .passthrough();

  private normalizeDependencies(raw: Array<unknown>): InferredDependency[] {
    const out: InferredDependency[] = [];
    for (const item of raw || []) {
      if (Array.isArray(item)) {
        const taskId = String(item[0] ?? '').trim();
        const dependsOnTaskId = String(item[1] ?? '').trim();
        const relationship = item[2] ? String(item[2]).trim() : 'FINISH_TO_START';
        if (!taskId || !dependsOnTaskId) continue;
        out.push({ taskId, dependsOnTaskId, relationship });
        continue;
      }

      if (item && typeof item === 'object') {
        const anyItem: any = item;
        out.push({
          taskId: String(anyItem.taskId ?? '').trim(),
          dependsOnTaskId: String(anyItem.dependsOnTaskId ?? '').trim(),
          relationship: anyItem.relationship ? String(anyItem.relationship).trim() : undefined,
          reason: anyItem.reason ? String(anyItem.reason) : undefined,
          confidence: typeof anyItem.confidence === 'number' ? anyItem.confidence : undefined,
        });
      }
    }
    return out;
  }

  /**
   * Heuristic baseline that avoids turning the whole leaf into one serial chain.
   * Creates a small "gate" chain across phases and attaches tasks to their phase gate.
   */
  inferHeuristicPhases(tasks: InferenceTask[]): InferredDependency[] {
    const normalized = (tasks || []).filter((t) => t?.id && t?.name);
    if (normalized.length < 2) return [];

    const phaseOrder = ['prepare', 'produce', 'test', 'consolidate', 'practice'];
    const phaseOf = (t: InferenceTask) => {
      const raw = String(t.microTaskType ?? '').trim().toLowerCase();
      if (phaseOrder.includes(raw)) return raw;
      return 'produce';
    };

    // Pick first task per phase as the phase gate (in input order)
    const gateByPhase = new Map<string, InferenceTask>();
    for (const t of normalized) {
      const p = phaseOf(t);
      if (!gateByPhase.has(p)) gateByPhase.set(p, t);
    }

    const phasesPresent = phaseOrder.filter((p) => gateByPhase.has(p));
    if (phasesPresent.length === 0) return [];

    const deps: InferredDependency[] = [];

    // Chain gates
    for (let i = 1; i < phasesPresent.length; i++) {
      const prevGate = gateByPhase.get(phasesPresent[i - 1])!;
      const gate = gateByPhase.get(phasesPresent[i])!;
      if (gate.id !== prevGate.id) {
        deps.push({
          taskId: gate.id,
          dependsOnTaskId: prevGate.id,
          relationship: 'FINISH_TO_START',
          reason: `Heurística: fase ${phasesPresent[i]} depende de ${phasesPresent[i - 1]}`,
          confidence: 0.55,
        });
      }
    }

    // Attach tasks to their phase gate (parallel within phase)
    for (const t of normalized) {
      const p = phaseOf(t);
      const gate = gateByPhase.get(p);
      if (!gate) continue;
      if (t.id === gate.id) continue;
      deps.push({
        taskId: t.id,
        dependsOnTaskId: gate.id,
        relationship: 'FINISH_TO_START',
        reason: `Heurística: task da fase ${p} depende do gate da fase`,
        confidence: 0.45,
      });
    }

    return deps;
  }

  private filterInvalidAndSelfEdges(deps: InferredDependency[], validIds: Set<string>): InferredDependency[] {
    const seen = new Set<string>();
    const out: InferredDependency[] = [];
    for (const d of deps || []) {
      const taskId = String(d?.taskId || '').trim();
      const depId = String(d?.dependsOnTaskId || '').trim();
      if (!taskId || !depId) continue;
      if (taskId === depId) continue;
      if (!validIds.has(taskId) || !validIds.has(depId)) continue;
      const key = `${taskId}<-${depId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...d, taskId, dependsOnTaskId: depId });
    }
    return out;
  }

  /**
   * Keep the dependency set acyclic by greedily adding edges only when they don't form a cycle.
   */
  private keepAcyclic(taskIds: string[], deps: InferredDependency[]): InferredDependency[] {
    const nodes = new Set(taskIds);
    const adj = new Map<string, Set<string>>();
    for (const id of nodes) adj.set(id, new Set());

    const wouldCreateCycle = (from: string, to: string) => {
      // edge: from depends on to => to -> from in precedence graph
      const start = from;
      const target = to;
      // If there is a path start -> target already, adding target -> start makes cycle.
      const stack = [start];
      const visited = new Set<string>();
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === target) return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const nexts = adj.get(cur);
        if (!nexts) continue;
        for (const n of nexts) stack.push(n);
      }
      return false;
    };

    const accepted: InferredDependency[] = [];
    for (const d of deps) {
      const taskId = d.taskId;
      const depId = d.dependsOnTaskId;
      if (!nodes.has(taskId) || !nodes.has(depId)) continue;

      // precedence edge depId -> taskId
      if (wouldCreateCycle(taskId, depId)) continue;
      adj.get(depId)!.add(taskId);
      accepted.push(d);
    }
    return accepted;
  }

  async inferWithAi(params: {
    requestId?: string;
    leafName?: string;
    wbsPath?: string;
    tasks: InferenceTask[];
    maxEdges?: number;
  }): Promise<InferredDependency[]> {
    const requestId = String(params.requestId || '').trim();
    const tasks = (params.tasks || []).filter((t) => t?.id && t?.name);
    if (tasks.length < 2) return [];

    const maxEdges = Math.max(0, Math.min(this.getNumericEnv('CPM_DEP_INFER_MAX_EDGES', params.maxEdges ?? 60), 250));
    const model = this.getModelOverride();

    // Keep output small: cap edges relative to number of tasks.
    const hardMaxEdges = Math.min(maxEdges, Math.max(5, tasks.length * 2));

    const prompt = [
      'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências entre micro-tarefas.',
      'Objetivo: construir um DAG (sem ciclos) com dependências MINIMAIS e REALISTAS, preservando PARALelismo quando possível.',
      'Regras:',
      `- Retorne no máximo ${hardMaxEdges} dependências.`,
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
        tasks.map((t) => ({
          id: t.id,
          name: t.name,
          microTaskType: t.microTaskType,
          // Keep prompt small to reduce latency/truncation
          description: this.truncateText(t.description, 140),
        })),
      ),
      '',
      'Saída JSON estrita (formato compacto preferido):',
      '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
    ].join('\n');

    const maxOutputTokens = this.getNumericEnv('CPM_DEP_INFER_MAX_TOKENS', 2400);

    if (this.isVerbose()) {
      this.logger.log(
        `[dep-infer] start requestId=${requestId || '-'} tasks=${tasks.length} hardMaxEdges=${hardMaxEdges} ` +
          `maxOutputTokens=${maxOutputTokens} model=${model || 'default'} leaf=${this.previewText(params.leafName, 60)}`,
      );
    }

    const tryOnce = async (p: string, edges: number, tokens: number) => {
      const startedAt = Date.now();
      if (this.isVerbose()) {
        this.logger.debug(
          `[dep-infer] calling LLM requestId=${requestId || '-'} edges=${edges} tokens=${tokens} promptChars=${p.length}`,
        );
      }
      const response = await this.geminiService.generateContent(p, {
        model,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: 0.2,
      });

      if (this.isVerbose()) {
        this.logger.debug(
          `[dep-infer] LLM response requestId=${requestId || '-'} chars=${String(response || '').length} ` +
            `preview="${this.previewText(response, 220)}" durationMs=${Date.now() - startedAt}`,
        );
      }

      const parsed = extractJsonObject<any>(response);
      const validated = this.schema.parse(parsed);

      const validIds = new Set(tasks.map((t) => t.id));
      const raw = Array.isArray((validated as any)?.dependencies) ? ((validated as any).dependencies as any[]) : [];
      const normalized = this.normalizeDependencies(raw as any);
      const normalizedCount = normalized.length;
      let deps = this.filterInvalidAndSelfEdges(normalized, validIds);
      const filteredCount = deps.length;

      deps = deps.slice(0, edges);
      const slicedCount = deps.length;
      const acyclic = this.keepAcyclic([...validIds], deps);
      const acyclicCount = acyclic.length;

      if (this.isVerbose()) {
        this.logger.log(
          `[dep-infer] done requestId=${requestId || '-'} raw=${raw.length} normalized=${normalizedCount} ` +
            `filtered=${filteredCount} sliced=${slicedCount} acyclic=${acyclicCount}`,
        );
      }

      return acyclic;
    };

    try {
      return await tryOnce(prompt, hardMaxEdges, maxOutputTokens);
    } catch (err: any) {
      this.logger.warn(
        `[dep-infer] parse/LLM failed requestId=${requestId || '-'} firstAttempt leaf=${this.previewText(
          params.leafName,
          60,
        )} error=${this.previewText(err?.message || err, 240)}`,
      );
      // Likely truncated/malformed JSON. Retry with fewer edges and stricter instructions.
      const retryEdges = Math.max(5, Math.floor(hardMaxEdges / 2));
      const retryPrompt = [
        prompt,
        '',
        'RETRY: Sua resposta anterior estava truncada ou inválida.',
        `- Agora retorne NO MÁXIMO ${retryEdges} dependências.`,
        '- Use APENAS o formato de tuplas (sem objetos) e SEM reason/confidence.',
        '- Se não conseguir inferir com segurança, retorne {"dependencies": []}.',
      ].join('\n');

      try {
        return await tryOnce(retryPrompt, retryEdges, Math.max(800, Math.floor(maxOutputTokens * 0.8)));
      } catch (err2: any) {
        const msg = String(err2?.message || err?.message || 'Falha ao inferir dependências com IA');
        this.logger.error(
          `[dep-infer] failed after retry requestId=${requestId || '-'} leaf=${this.previewText(params.leafName, 60)} ` +
            `error=${this.previewText(msg, 260)}`,
        );
        throw err2;
      }
    }
  }

  /**
   * Infere poucas dependências ENTRE leafs usando apenas gates (start/end) de cada leaf.
   * Objetivo: reduzir paralelismo global irreal conectando macro-fluxo com o mínimo de arestas.
   */
  async inferInterLeafWithAi(params: {
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
      Math.min(this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_EDGES', params.maxEdges ?? fallbackMax), 80),
    );

    const startGateIds = new Set(leaves.map((l) => String(l.startGateId).trim()).filter(Boolean));
    const endGateIds = new Set(leaves.map((l) => String(l.endGateId).trim()).filter(Boolean));
    const validIds = new Set<string>([...startGateIds, ...endGateIds]);
    if (validIds.size < 2) return [];

    const leafById = new Map<string, InferenceLeafGates>();
    const gateToLeafId = new Map<string, string>();
    for (const l of leaves) {
      leafById.set(String(l.leafId), l);
      const s = String(l.startGateId).trim();
      const e = String(l.endGateId).trim();
      if (s) gateToLeafId.set(s, String(l.leafId));
      if (e) gateToLeafId.set(e, String(l.leafId));
    }

    // Build a compact leaf table for the prompt.
    const leafTable = leaves.map((l) => ({
      leafId: String(l.leafId),
      wbsPath: String(l.wbsPath ?? ''),
      leafName: String(l.leafName ?? ''),
      startGateId: String(l.startGateId),
      endGateId: String(l.endGateId),
      taskCount: typeof l.taskCount === 'number' ? l.taskCount : undefined,
    }));

    const hardMaxEdges = Math.min(maxEdges, Math.max(1, leaves.length + 2));
    const maxOutputTokens = this.getNumericEnv('CPM_DEP_INFER_INTERLEAF_MAX_TOKENS', 1600);

    const minEdgesHint = leaves.length >= 6 ? 1 : 0;
    const prompt = [
      'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências ENTRE leafs (macro-ordenação).',
      'Objetivo: criar poucas dependências REALISTAS para conectar o fluxo do projeto e reduzir paralelismo global irreal.',
      'Regras importantes:',
      `- Retorne no máximo ${hardMaxEdges} dependências. Poucas arestas é melhor.`,
      ...(minEdgesHint ? [`- Como há muitos leafs, retorne pelo menos ${minEdgesHint} dependência se houver qualquer ordem natural do fluxo.`] : []),
      '- Use SOMENTE os IDs de gates fornecidos (startGateId/endGateId). Não invente IDs.',
      '- Preferência: taskId deve ser startGateId do leaf que depende, e dependsOnTaskId deve ser endGateId do leaf pré-requisito.',
      '- Evite criar uma cadeia linear com todos os leafs; conecte apenas quando houver pré-requisito claro ou ordem natural do fluxo.',
      '- Não crie ciclos. Se estiver em dúvida, não crie dependência.',
      '- Resposta deve ser JSON VÁLIDO e COMPLETO (nada de markdown, nada de texto extra).',
      '',
      `Contexto (opcional) projectId: ${projectId || ''}`,
      '',
      'Entrada (leafs + gates):',
      JSON.stringify(leafTable),
      '',
      'Saída JSON estrita (formato compacto preferido):',
      '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
    ].join('\n');

    if (this.isVerbose()) {
      this.logger.log(
        `[dep-infer-interleaf] start requestId=${requestId || '-'} projectId=${projectId || '-'} ` +
          `leaves=${leaves.length} hardMaxEdges=${hardMaxEdges} maxOutputTokens=${maxOutputTokens} model=${model || 'default'}`,
      );
    }

    const tryOnce = async (p: string, edges: number, tokens: number) => {
      const startedAt = Date.now();
      if (this.isVerbose()) {
        this.logger.debug(
          `[dep-infer-interleaf] calling LLM requestId=${requestId || '-'} edges=${edges} tokens=${tokens} promptChars=${p.length}`,
        );
      }

      const response = await this.geminiService.generateContent(p, {
        model,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: 0.2,
      });

      if (this.isVerbose()) {
        this.logger.debug(
          `[dep-infer-interleaf] LLM response requestId=${requestId || '-'} chars=${String(response || '').length} ` +
            `preview="${this.previewText(response, 220)}" durationMs=${Date.now() - startedAt}`,
        );
      }

      const parsed = extractJsonObject<any>(response);
      const validated = this.schema.parse(parsed);
      const raw = Array.isArray((validated as any)?.dependencies) ? ((validated as any).dependencies as any[]) : [];

      const normalized = this.normalizeDependencies(raw as any);
      let deps = this.filterInvalidAndSelfEdges(normalized, validIds);

      // Normalize any inferred gate-to-gate edge into:
      //   startGate(leafA) depends on endGate(leafB)
      // This avoids returning 0 edges when the model outputs the "wrong" gate direction.
      const normalizedCrossLeaf: InferredDependency[] = [];
      const seen = new Set<string>();

      for (const d of deps) {
        const a = String(d.taskId).trim();
        const b = String(d.dependsOnTaskId).trim();
        const leafA = gateToLeafId.get(a);
        const leafB = gateToLeafId.get(b);
        if (!leafA || !leafB) continue;
        if (leafA === leafB) continue;

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

      const sliced = normalizedCrossLeaf.slice(0, edges);
      const acyclic = this.keepAcyclic([...validIds], sliced);

      if (this.isVerbose()) {
        this.logger.log(
          `[dep-infer-interleaf] done requestId=${requestId || '-'} raw=${raw.length} normalized=${normalized.length} ` +
            `filtered=${deps.length} normalizedCrossLeaf=${normalizedCrossLeaf.length} sliced=${sliced.length} acyclic=${acyclic.length}`,
        );
      }

      return acyclic;
    };

    try {
      return await tryOnce(prompt, hardMaxEdges, maxOutputTokens);
    } catch (err: any) {
      this.logger.warn(
        `[dep-infer-interleaf] parse/LLM failed requestId=${requestId || '-'} firstAttempt error=${this.previewText(
          err?.message || err,
          240,
        )}`,
      );
      const retryEdges = Math.max(2, Math.floor(hardMaxEdges / 2));
      const retryPrompt = [
        prompt,
        '',
        'RETRY: Sua resposta anterior estava truncada ou inválida.',
        `- Agora retorne NO MÁXIMO ${retryEdges} dependências.`,
        '- Use APENAS o formato de tuplas (sem objetos) e SEM reason/confidence.',
        '- Se não conseguir inferir com segurança, retorne {"dependencies": []}.',
      ].join('\n');

      try {
        return await tryOnce(retryPrompt, retryEdges, Math.max(800, Math.floor(maxOutputTokens * 0.85)));
      } catch (err2: any) {
        const msg = String(err2?.message || err?.message || 'Falha ao inferir dependências entre leafs');
        this.logger.error(
          `[dep-infer-interleaf] failed after retry requestId=${requestId || '-'} error=${this.previewText(msg, 260)}`,
        );
        throw err2;
      }
    }
  }
}
