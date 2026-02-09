import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { GeminiService } from '../../tasks/gemini.service';
import { WBSNodeDocument } from '../schemas/wbs-node.schema';
import { WBSNodeDto, ValidateWBSResponseDto } from '../dto/wbs.dto';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

@Injectable()
export class WBSService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
  ) {}

  // Micro-task sizing philosophy:
  // Prefer smaller “daily” tasks (1–3 pomodoros) and only use 6 pomodoros (150min)
  // when strictly necessary to avoid generating an excessive number of tasks.
  private readonly microTaskMinMinutes = 25;
  private readonly microTaskPreferredMinutes = 50; // ~2 pomodoros
  private readonly microTaskSoftMaxMinutes = 60; // ~2-3 pomodoros
  private readonly microTaskHardMaxMinutes = 150; // 6 pomodoros (only if needed)
  private readonly microTaskMaxPerLeaf = 40;
  private readonly minEmbeddingTextLength = 180;
  private readonly minEmbeddingSegments = 3;
  private readonly maxEmbeddingClusters = 6;

  private readonly plannerSchema = z
    .object({
      themes: z
        .array(
          z
            .object({
              name: z.string().min(1),
              criteria: z.string().optional(),
            })
            .passthrough(),
        )
        .min(1),
      workflow: z.array(z.string().min(1)).min(1),
      milestones: z
        .array(
          z
            .object({
              name: z.string().optional(),
              goal: z.string().optional(),
              atMinutes: z.number().optional(),
            })
            .passthrough(),
        )
        .optional(),
      constraints: z.record(z.string(), z.any()).optional(),
    })
    .passthrough();

  private readonly draftSchema = z
    .object({
      name: z.string().min(1),
      description: z.string().min(1),
      pomodorosPlanned: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(6),
      ),
      priority: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      difficult: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      microTaskType: z.string().min(1),
      themeTag: z.string().min(1),
      contextTag: z.string().min(1),
      cognitiveMode: z.string().min(1),
      milestoneIndex: z
        .preprocess(
          (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
          z.number().int().min(1),
        )
        .optional(),
    })
    .passthrough();

  private readonly draftsSchema = z.array(this.draftSchema).min(1);

  private stripDedupeSuffix(name?: string): string {
    const t = String(name || '').trim();
    if (!t) return '';
    return t.split(' — ')[0].trim();
  }

  private baseTitle(name?: string): string {
    return this.sanitizeTitle(this.stripDedupeSuffix(name));
  }

  private sanitizeTitle(name?: string): string {
    let t = String(name || '').trim();
    if (!t) return '';

    // Remove fraction markers like "1/4" anywhere.
    t = t.replace(/\b\d+\s*\/\s*\d+\b/g, '').trim();

    // Fix degenerate numeric ranges like "(50-50)" -> "(50)".
    t = t.replace(/\(\s*(\d+)\s*-\s*\1\s*\)/g, '($1)');

    // Clean dangling separators left by removal.
    t = t
      .replace(/\s*-\s*$/g, '')
      .replace(/\s*—\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return t;
  }

  private isGenericTemplateTitle(title?: string): boolean {
    const t = String(title || '').trim().toLowerCase();
    if (!t) return false;
    if (/\bentreg[aá]vel\b/.test(t)) return true;
    if (/\bmini\s*-?\s*simulad[oa]\b/.test(t)) return true;
    return false;
  }

  private isGenericWordsCountTitle(title?: string): boolean {
    const t = String(title || '').trim().toLowerCase();
    if (!t) return false;
    if (!/\b\d+\s+palavras\b/.test(t)) return false;
    // Allow if it clearly states an artifact/output, otherwise it's usually a disguised mathematical split.
    const hasArtifact =
      /(flashcard|anki|memrise|frase|frases|di[aá]logo|dialogo|quiz|teste|lista|tabela|planilha|deck|cart[ãa]o|cart[oõ]es|senten[cç]a)/.test(
        t,
      );
    return !hasArtifact;
  }

  private isBadTitleQuality(title?: string): boolean {
    const t = String(title || '').trim();
    if (!t) return true;
    // Empty parentheses like "()" are almost always placeholders.
    if (/\(\s*\)/.test(t)) return true;

    // Suspicious tiny ranges like "(50-51)" or "(51-52)".
    const m = t.match(/\(\s*(\d+)\s*-\s*(\d+)\s*\)/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) <= 2) return true;
    }

    return false;
  }

  private detectPreDedupeIssues(drafts: Array<{ name?: string }>): {
    forcedIndices: number[];
    duplicatesCount: number;
    templatesCount: number;
    badTitleCount: number;
  } {
    const forced = new Set<number>();

    const baseTitles = drafts.map((d) => this.baseTitle(d?.name));
    const normalizedTitles = baseTitles.map((t) => this.normalizeTitle(t));
    const templateTitles = baseTitles.map((t) => this.templateTitle(t));

    const firstByNormalized = new Map<string, number>();
    normalizedTitles.forEach((key, idx) => {
      if (!key) {
        forced.add(idx);
        return;
      }
      if (firstByNormalized.has(key)) forced.add(idx);
      else firstByNormalized.set(key, idx);
    });

    const firstByTemplate = new Map<string, number>();
    templateTitles.forEach((key, idx) => {
      if (!key) return;
      if (firstByTemplate.has(key)) forced.add(idx);
      else firstByTemplate.set(key, idx);
    });

    baseTitles.forEach((t, idx) => {
      if (this.isBadTitleQuality(t)) forced.add(idx);
      if (this.isGenericTemplateTitle(t)) forced.add(idx);
      if (this.isGenericWordsCountTitle(t)) forced.add(idx);
    });

    return {
      forcedIndices: Array.from(forced.values()).sort((a, b) => a - b),
      duplicatesCount: Math.max(0, normalizedTitles.length - new Set(normalizedTitles).size),
      templatesCount: Math.max(0, templateTitles.length - new Set(templateTitles).size),
      badTitleCount: baseTitles.filter(
        (t) => this.isBadTitleQuality(t) || this.isGenericTemplateTitle(t) || this.isGenericWordsCountTitle(t),
      ).length,
    };
  }

  private detectGenericSeriesIssues(drafts: Array<{ name?: string }>): {
    indices: number[];
    genericRate: number;
    genericKinds: { deliverable: number; words: number; minis: number };
  } {
    const indices: number[] = [];
    let deliverable = 0;
    let words = 0;
    let minis = 0;

    drafts.forEach((d, idx) => {
      const title = this.baseTitle(d?.name);
      const t = title.toLowerCase();
      const isDeliverable = /\bentreg[aá]vel\b/.test(t);
      const isMini = /\bmini\s*-?\s*simulad[oa]\b/.test(t);
      const isWords = this.isGenericWordsCountTitle(title);

      if (isDeliverable) deliverable++;
      if (isMini) minis++;
      if (isWords) words++;

      if (isDeliverable || isMini || isWords) indices.push(idx);
    });

    const total = drafts.length || 0;
    const genericRate = total ? indices.length / total : 0;
    return {
      indices,
      genericRate,
      genericKinds: { deliverable, words, minis },
    };
  }

  private hasForbiddenTitlePattern(title?: string): boolean {
    const t = String(title || '').trim();
    if (!t) return true;
    // Avoid “Parte 1/4”, “1/4”, etc. (but allow “Parte 2” in general).
    if (/\b\d+\s*\/\s*\d+\b/.test(t)) return true;
    // Avoid generic placeholders leaking into saved tasks.
    if (/\bmicro[-\s]?tarefa\b/i.test(t)) return true;
    // Avoid generic placeholder template "entregável".
    if (/\bentreg[aá]vel\b/i.test(t)) return true;
    return false;
  }

  private detectMonotonyIssues(drafts: Array<{ name?: string }>): {
    badIndices: number[];
    hasForbiddenPatterns: boolean;
  } {
    const bad = new Set<number>();
    const hasForbiddenPatterns = drafts.some((d) => this.hasForbiddenTitlePattern(d?.name));

    const normalizedTitles = drafts.map((d) => this.normalizeTitle(d?.name));
    const templateTitles = drafts.map((d) => this.templateTitle(d?.name));

    // Flag only repeated occurrences (keep the first) to keep changes minimal.
    const firstByNormalized = new Map<string, number>();
    normalizedTitles.forEach((key, idx) => {
      if (!key) {
        bad.add(idx);
        return;
      }
      if (firstByNormalized.has(key)) bad.add(idx);
      else firstByNormalized.set(key, idx);
    });

    const firstByTemplate = new Map<string, number>();
    templateTitles.forEach((key, idx) => {
      if (!key) return;
      if (firstByTemplate.has(key)) bad.add(idx);
      else firstByTemplate.set(key, idx);
    });

    drafts.forEach((d, idx) => {
      if (this.hasForbiddenTitlePattern(d?.name)) bad.add(idx);
    });

    return {
      badIndices: Array.from(bad.values()).sort((a, b) => a - b),
      hasForbiddenPatterns,
    };
  }

  private buildMicroTasksFixMonotonyPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    chunkMinutes: number[];
    drafts: Array<{
      name?: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>;
    indices: number[];
    round: number;
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    const indicesText = params.indices.map((i) => i).join(', ');

    const fixedTargets = params.indices
      .map((idx) => {
        const d: any = params.drafts[idx] || {};
        const minutes = params.chunkMinutes[idx];
        return {
          chunkIndex: idx,
          targetMinutes: minutes,
          microTaskType: String(d.microTaskType || 'practice'),
          themeTag: String(d.themeTag || '').trim(),
          contextTag: String(d.contextTag || '').trim(),
          cognitiveMode: String(d.cognitiveMode || '').trim(),
          previousName: String(d.name || '').trim(),
        };
      })
      .map((o) => JSON.stringify(o))
      .join('\n');

    const keepIndices = new Set(params.indices);
    const keepVerbs = params.drafts
      .map((d, idx) => ({ idx, verb: this.extractVerb(d?.name) }))
      .filter((x) => !keepIndices.has(x.idx) && x.verb && x.verb !== 'unknown')
      .map((x) => x.verb);
    const avoidVerbs = Array.from(new Set(keepVerbs)).slice(0, 20);

    const keepTemplates = params.drafts
      .map((d, idx) => ({ idx, tpl: this.templateTitle(d?.name) }))
      .filter((x) => !keepIndices.has(x.idx) && x.tpl)
      .map((x) => x.tpl);
    const avoidTemplates = Array.from(new Set(keepTemplates)).slice(0, 25);

    const strictnessHint =
      params.round >= 1
        ? 'Esta é uma segunda tentativa: seja ainda mais diferente (mude verbo + entregável + formato).'
        : '';

    return `Você é um especialista em criar micro-tarefas executáveis e NÃO repetitivas.

Contexto do projeto: ${projectSummary || 'Sem resumo'}

WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho: "${params.currentPath}"

Problema: algumas micro-tarefas ficaram repetitivas/monótonas ou com padrões proibidos (ex.: "Parte 1/4").

Sua tarefa: REGERAR APENAS os itens com chunkIndex em [${indicesText}] mantendo o mesmo objetivo do nó.

ALVOS (NÃO altere chunkIndex; use os metadados como guia):
${fixedTargets}

REGRAS IMPORTANTES (anti-monotonia):
1) Proibido usar frações como "1/4" no nome (inclui "Parte 1/4"). Se usar "Parte N", use apenas "Parte N" (sem "/M").
1b) Proibido usar nomes genéricos/placeholder como "entregável", "mini-simulado" ou "N palavras". O nome deve citar um ARTEFATO concreto (ex.: resumo, lista de erros, flashcards, mapa mental, simulado completo, checklist, etc.).
2) O nome deve começar com um VERBO de ação (GTD) e variar entre os itens.
3) Evite repetir verbos já usados nos outros itens: ${avoidVerbs.length ? avoidVerbs.join(', ') : 'sem lista'}.
4) Evite repetir templates (mesma ideia com palavras trocadas). Templates a evitar: ${avoidTemplates.length ? avoidTemplates.join(' | ') : 'sem lista'}.
5) Descrição deve ter 2-5 passos + "Definição de pronto:".
6) Mantenha a duração alvo (targetMinutes) e respeite 1-6 pomodoros.
${strictnessHint}

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown), com EXATAMENTE ${params.indices.length} itens.
Cada item deve ter:
- "chunkIndex": number (0-based)
- "name": string
- "description": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)

Use hoje como ${today}.`;
  }

  private async autoFixMonotonyForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>;
    maxCalls: number;
    forceIndices?: number[];
  }): Promise<{ drafts: any[]; aiCallsUsed: number }> {
    const isJsonishError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return (
        msg.includes('json') ||
        msg.includes('truncad') ||
        msg.includes('incomplet') ||
        msg.includes('parse') ||
        msg.includes('array') ||
        msg.includes('object')
      );
    };

    let drafts = params.drafts.slice().map((d) => ({
      ...d,
      name: this.sanitizeTitle(d?.name),
    }));
    let aiCallsUsed = 0;

    const forcedIndices = Array.from(new Set((params.forceIndices || []).filter((n) => Number.isInteger(n)))).sort(
      (a, b) => a - b,
    );

    for (let round = 0; round < 2; round++) {
      const issues = this.detectMonotonyIssues(drafts);
      const mergedBad = Array.from(new Set([...(issues.badIndices || []), ...forcedIndices])).sort((a, b) => a - b);
      if (!mergedBad.length) break;
      if (aiCallsUsed >= params.maxCalls) break;

      // Regenerate in small batches to reduce truncation.
      const batchSize = 5;
      for (let start = 0; start < mergedBad.length && aiCallsUsed < params.maxCalls; start += batchSize) {
        const indices = mergedBad.slice(start, start + batchSize);
        const prompt = this.buildMicroTasksFixMonotonyPrompt({
          project: params.project,
          node: params.node,
          currentPath: params.currentPath,
          chunkMinutes: params.chunkMinutes,
          drafts,
          indices,
          round,
        });

        const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
          const response = await this.geminiService.generateContent(prompt, {
            responseMimeType: 'application/json',
            maxOutputTokens: opts.maxOutputTokens,
            temperature: opts.temperature,
          });
          const parsed = this.extractJsonArray<any>(response);
          if (!Array.isArray(parsed) || parsed.length !== indices.length) {
            throw new Error(`IA retornou ${Array.isArray(parsed) ? parsed.length : 0} itens; esperado ${indices.length}`);
          }
          return parsed;
        };

        let items: any[];
        try {
          items = await attempt({ maxOutputTokens: 1400, temperature: 0.65 });
        } catch (err: any) {
          if (isJsonishError(err)) {
            items = await attempt({ maxOutputTokens: 2200, temperature: 0.35 });
          } else {
            throw err;
          }
        }

        const indexSet = new Set(indices);
        const byIndex = new Map<number, any>();

        // Prefer explicit chunkIndex mapping; fallback to positional mapping if missing.
        const allHaveIndex = items.every((it) => Number.isInteger(Number(it?.chunkIndex)));
        if (allHaveIndex) {
          items.forEach((it) => {
            const idx = Number(it.chunkIndex);
            if (indexSet.has(idx)) byIndex.set(idx, it);
          });
        } else {
          items.forEach((it, pos) => {
            const idx = indices[pos];
            if (idx !== undefined) byIndex.set(idx, { ...it, chunkIndex: idx });
          });
        }

        for (const idx of indices) {
          const current = drafts[idx] || ({} as any);
          const it = byIndex.get(idx);
          if (!it) continue;

          const targetMinutes = params.chunkMinutes[idx];
          const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
          const nextName = this.sanitizeTitle(String(it?.name || '').trim());
          const nextDesc = String(it?.description || '').trim();
          if (!nextName || !nextDesc) continue;

          drafts[idx] = {
            ...current,
            name: nextName,
            description: nextDesc,
            pomodorosPlanned: Math.max(1, Math.min(6, Number(it?.pomodorosPlanned) || current.pomodorosPlanned || fallbackPomodoros)),
            priority: Math.max(1, Math.min(4, Number(it?.priority) || current.priority || Math.max(1, Math.min(4, 5 - params.level)))),
            difficult: Math.max(1, Math.min(4, Number(it?.difficult) || current.difficult || 2)),
          };
        }

        aiCallsUsed++;
      }

      // Run dedupe after replacement and keep titles sanitized.
      drafts = this.dedupeCheckAndMitigate(drafts).map((d) => ({
        ...d,
        name: this.sanitizeTitle(d?.name),
      }));
    }

    return { drafts, aiCallsUsed };
  }

  /**
   * Generate a WBS from a SMART objective using Gemini
   */
  async generateWBS(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    summary?: string;
  }): Promise<WBSNodeDto[]> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

Baseado no objetivo SMART abaixo, gere uma WBS hierárquica CONCISA para o projeto.

Objetivo SMART:
- Específico: ${smartObjective.specific}
- Mensurável: ${smartObjective.measurable}
- Atingível: ${smartObjective.achievable}
- Relevante: ${smartObjective.relevant}
- Temporal: ${smartObjective.temporal}
${smartObjective.summary ? `- Resumo: ${smartObjective.summary}` : ''}

REGRAS IMPORTANTES:
1. A WBS deve ter MÁXIMO 3 níveis de profundidade
2. Inclua APENAS 3-4 entregas principais (nível 1)
3. Cada entrega deve ter 2-4 pacotes de trabalho (nível 2)
4. Evite nível 3 sempre que possível
5. Cada pacote de trabalho (nó folha) deve ter entre 8 e 80 horas estimadas (regra 8/80)
6. Nós intermediários: estimatedHours = soma dos filhos
7. Use nomes claros e descritivos mas CURTOS
8. Descrições BREVES (máximo 1 linha)

Retorne APENAS um array JSON válido e completo, sem texto adicional:
[
  {
    "name": "Nome da Entrega Principal",
    "description": "Descrição breve",
    "level": 1,
    "estimatedHours": 120,
    "order": 1,
    "children": [
      {
        "name": "Pacote de Trabalho",
        "description": "Descrição",
        "level": 2,
        "estimatedHours": 40,
        "order": 1,
        "children": [
          {
            "name": "Sub-pacote",
            "description": "Descrição",
            "level": 3,
            "estimatedHours": 20,
            "order": 1,
            "children": []
          }
        ]
      }
    ]
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return this.parseWBSFromResponse(response);
    } catch (error) {
      console.error('Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
    }
  }

  /**
   * Validate a single WBS node against the 8/80 rule
   */
  validateWBSNode(node: WBSNodeDto): ValidateWBSResponseDto {
    // Only validate leaf nodes (no children or empty children)
    const isLeaf = !node.children || node.children.length === 0;

    if (!isLeaf) {
      // Intermediate nodes: just check total consistency
      return { valid: true };
    }

    if (node.estimatedHours < 8) {
      return {
        valid: false,
        reason: `"${node.name}" é muito pequeno (${node.estimatedHours}h). Pacotes de trabalho devem ter no mínimo 8 horas. Combine com outras tarefas ou aumente o escopo.`,
      };
    }

    if (node.estimatedHours > 80) {
      return {
        valid: false,
        reason: `"${node.name}" é muito grande (${node.estimatedHours}h). Pacotes de trabalho devem ter no máximo 80 horas. Decomponha em sub-pacotes menores.`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate all nodes in the WBS tree and return all violations
   */
  validateWBS(nodes: WBSNodeDto[]): { valid: boolean; violations: ValidateWBSResponseDto[] } {
    const violations: ValidateWBSResponseDto[] = [];

    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const result = this.validateWBSNode(node);
        if (!result.valid) {
          violations.push(result);
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { valid: violations.length === 0, violations };
  }

  /**
   * Suggest how to decompose a node that violates the 8/80 rule
   */
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${node.estimatedHours > 80
  ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
  : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[
  {
    "name": "Nome do sub-pacote",
    "description": "Descrição",
    "estimatedHours": 20,
    "level": 3,
    "order": 1,
    "children": []
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return response;
    } catch (error) {
      console.error('Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
  }

  /**
   * Convert WBS leaf nodes into tasks for the project (legacy - kept for compatibility)
   */
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
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;

    const traverse = (nodeList: WBSNodeDto[], parentPath: string = '') => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes = this.computeChunkMinutes(totalMinutes);
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

  /**
   * Convert WBS to tasks using TasksService.create() with AI enrichment
   * This creates more detailed and contextualized tasks with proper reward/experience calculation
   */
  async convertWBSToTasksWithAI(
    nodes: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: { create: (dto: any) => Promise<any> },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
    },
  ): Promise<any[]> {
    const createdTasks: any[] = [];
    const generationBatchId = randomUUID();
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;
    const preferredPomodoros = this.normalizePreferredPomodoros(preferences?.targetPomodoros);

    // Guardrails: avoid accidental explosions (e.g. thousands of tasks)
    const estimatedTotalTasks = this.estimateMicroTaskCount(nodes);
    const maxTasksToCreate = 1000;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Conversão abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
          `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    // Calcular deadline base (distribuir tarefas ao longo do prazo do projeto)
    const projectDeadline = project.deadline ? new Date(project.deadline) : new Date();
    const today = new Date();
    const daysUntilDeadline = Math.max(7, Math.ceil((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    let taskCounter = 0;
    let aiLeafCalls = 0;
    const maxAiLeafCalls = 30;

    const traverse = async (nodeList: WBSNodeDto[], parentPath: string = '', level: number = 1) => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          // Leaf node - criar micro-tarefas
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes: number[] = this.computeChunkMinutes(totalMinutes, {
            preferredPomodoros,
          });
          const chunks = chunkMinutes.length;

          // Prefer AI-generated, non-generic microtasks (batched per leaf).
          // Fallback to heuristic templates if AI fails or if we already hit a safety limit.
          let drafts: Array<{
            name: string;
            description?: string;
            pomodorosPlanned?: number;
            priority?: number;
            difficult?: number;
            microTaskType?: string;
            themeTag?: string;
            contextTag?: string;
            cognitiveMode?: string;
            milestoneIndex?: number;
          }> = [];

          const canUsePlannerGenerator = this.geminiService.supportsJsonMode();
          if (!canUsePlannerGenerator) {
            // When JSON-mode isn't supported (e.g., Gemma), planner/generator tends to truncate large JSON.
            // Prefer the legacy prompt path which is already batched/splittable.
            drafts = [];
          } else if (aiLeafCalls <= maxAiLeafCalls - 2) {
            try {
              const plan = await this.generateMicroTasksPlanForLeaf({
                project,
                node,
                currentPath,
                level,
                chunkMinutes,
                workflowMix: preferences?.workflowMix,
              });
              drafts = await this.generateMicroTasksDraftsForLeafWithPlan(
                { project, node, currentPath, level, plan },
                chunkMinutes,
              );
              aiLeafCalls += 2;
            } catch (err: any) {
              console.warn(`⚠️ IA (Planner/Generator) falhou para "${node.name}". Tentando prompt antigo. Motivo: ${err?.message || err}`);
              drafts = [];
            }
          }

          if (!drafts.length && aiLeafCalls < maxAiLeafCalls) {
            try {
              drafts = await this.generateMicroTasksDraftsForLeaf(
                {
                  project,
                  node,
                  currentPath,
                  level,
                },
                chunkMinutes,
              );
              aiLeafCalls++;
            } catch (err: any) {
              console.warn(`⚠️ IA falhou para "${node.name}". Usando fallback. Motivo: ${err?.message || err}`);
              drafts = [];
            }
          }

          if (drafts.length !== chunks) {
            drafts = this.fallbackMicroTasksDraftsForLeaf({ node, currentPath, level }, chunkMinutes);
          }

          // From this point forward, drafts is guaranteed to be a concrete array.
          let leafDrafts = drafts as NonNullable<typeof drafts>;

          // Order matters: theme/workflow first, then enforce milestones/checkpoints, then dedupe.
          leafDrafts = this.applyThemeWorkflowAndProgression(leafDrafts, chunkMinutes);
          leafDrafts = this.applyGoldilocksAndMilestones(leafDrafts, chunkMinutes);
          // Sanitize before dedupe so forbidden patterns (e.g. 1/4) don't leak into saved titles.
          leafDrafts = leafDrafts.map((d) => ({ ...d, name: this.sanitizeTitle(d?.name) }));

          // Pre-dedupe checks: catch duplicates that would otherwise be “hidden” by suffix-based dedupe.
          const preDedupe = this.detectPreDedupeIssues(leafDrafts);

          leafDrafts = this.dedupeCheckAndMitigate(leafDrafts);
          leafDrafts = leafDrafts.map((d) => ({ ...d, name: this.sanitizeTitle(d?.name) }));

          const leafMetrics = this.computeBatchMetrics(
            leafDrafts.map((d: any) => ({
              name: d?.name,
              description: d?.description,
              themeTag: d?.themeTag,
              microTaskType: d?.microTaskType,
            })),
          );
          console.log(
            `[WBS→Tasks][Batch ${generationBatchId}] project=${projectId} ` +
              `leaf="${node.name}" total=${leafMetrics.total} ` +
              `dupScore=${leafMetrics.dupScore.toFixed(2)} ` +
              `similarScore=${leafMetrics.similarScore.toFixed(2)} ` +
              `verbVariety=${leafMetrics.verbVariety.toFixed(2)} ` +
              `cognitiveVariety=${leafMetrics.cognitiveVariety.toFixed(2)} ` +
              `themesCount=${leafMetrics.themesCount}`,
          );
          if (leafMetrics.dupScore >= 0.2 || leafMetrics.similarScore >= 0.35) {
            console.warn(
              `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ alerta monotonia: leaf="${node.name}" ` +
                `dupScore=${leafMetrics.dupScore.toFixed(2)} similarScore=${leafMetrics.similarScore.toFixed(2)}`,
            );
          }

          // Auto-fix monotony: regenerate only the problematic items (duplicates/templates/forbidden patterns).
          try {
            const issues = this.detectMonotonyIssues(leafDrafts);
            const genericSeries = this.detectGenericSeriesIssues(leafDrafts);
            const suffixIndices = leafDrafts
              .map((d, idx) => ({ idx, hasSuffix: String(d?.name || '').includes(' — ') }))
              .filter((x) => x.hasSuffix)
              .map((x) => x.idx);
            const forcedFixIndices = Array.from(
              new Set([...(preDedupe.forcedIndices || []), ...(suffixIndices || []), ...(genericSeries.indices || [])]),
            ).sort((a, b) => a - b);

            // Trigger stronger fix when dedupe had to add many suffixes or when bad title quality was detected.
            const suffixRate = leafDrafts.length ? suffixIndices.length / leafDrafts.length : 0;
            const severeGenericSeries = genericSeries.genericRate >= 0.25 && genericSeries.indices.length >= 2;
            const hasQualityIssues = preDedupe.badTitleCount > 0 || severeGenericSeries;
            const needsVarietyBoost = leafMetrics.cognitiveVariety < 0.18 || leafMetrics.themesCount <= 1;

            if (severeGenericSeries) {
              console.warn(
                `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ generic-series: leaf="${node.name}" ` +
                  `genericRate=${genericSeries.genericRate.toFixed(2)} ` +
                  `deliverable=${genericSeries.genericKinds.deliverable} ` +
                  `words=${genericSeries.genericKinds.words} minis=${genericSeries.genericKinds.minis}`,
              );
            }

            const shouldFix =
              (issues.badIndices.length > 0 || forcedFixIndices.length > 0) &&
              (
                issues.hasForbiddenPatterns ||
                leafMetrics.dupScore >= 0.2 ||
                leafMetrics.similarScore >= 0.35 ||
                suffixRate >= 0.15 ||
                hasQualityIssues ||
                needsVarietyBoost
              );

            // Keep a small extra budget for *fix-only* calls (generation still uses maxAiLeafCalls).
            const extraFixBudget = 2;
            const maxTotalFixCalls = maxAiLeafCalls + extraFixBudget;

            if (shouldFix && aiLeafCalls < maxTotalFixCalls) {
              const remainingCalls = Math.max(0, maxTotalFixCalls - aiLeafCalls);
              const maxCallsForFix = Math.min(2, remainingCalls);
              if (maxCallsForFix > 0) {
                const fixed = await this.autoFixMonotonyForLeaf({
                  project,
                  node,
                  currentPath,
                  level,
                  chunkMinutes,
                  drafts: leafDrafts as any,
                  maxCalls: maxCallsForFix,
                  forceIndices: forcedFixIndices,
                });
                leafDrafts = fixed.drafts as any;
                leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.sanitizeTitle(d?.name) }));
                aiLeafCalls += fixed.aiCallsUsed;

                const fixedMetrics = this.computeBatchMetrics(
                  leafDrafts.map((d: any) => ({
                    name: d?.name,
                    description: d?.description,
                    themeTag: d?.themeTag,
                    microTaskType: d?.microTaskType,
                  })),
                );
                console.log(
                  `[WBS→Tasks][Batch ${generationBatchId}] auto-fix monotonia: leaf="${node.name}" ` +
                    `bad=${issues.badIndices.length} calls=${fixed.aiCallsUsed} ` +
                    `dupScore=${fixedMetrics.dupScore.toFixed(2)} similarScore=${fixedMetrics.similarScore.toFixed(2)}`,
                );
              }
            }

            // Even if we couldn't spend AI calls, enforce sanitization for forbidden fraction patterns.
            if (issues.hasForbiddenPatterns) {
              leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.sanitizeTitle(d?.name) }));
              leafDrafts = this.dedupeCheckAndMitigate(leafDrafts as any);
              leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.sanitizeTitle(d?.name) }));
            }
          } catch (err: any) {
            console.warn(
              `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ auto-fix monotonia falhou para leaf="${node.name}": ${
                err?.message || err
              }`,
            );
          }

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            const draft = leafDrafts[chunkIndex] || ({} as any);
            // Prefer smaller pomodoro counts; let AI choose, otherwise derive from minutes.
            const derivedPomodoros = Math.ceil(estimatedMinutes / 25);
            const pomodorosPlanned = Math.max(
              1,
              Math.min(6, Number(draft.pomodorosPlanned) || derivedPomodoros),
            );

            // Deadline distribuído ao longo do prazo do projeto
            const progressRatio = estimatedTotalTasks <= 1 ? 0 : taskCounter / (estimatedTotalTasks - 1);
            const taskDaysOffset = Math.floor(progressRatio * daysUntilDeadline * 0.8);
            const taskDeadline = new Date(today);
            taskDeadline.setDate(taskDeadline.getDate() + taskDaysOffset);

            // Prioridade baseada na hierarquia WBS (níveis mais altos = mais urgente)
            const basePriority = Math.max(1, Math.min(4, 5 - level));
            const priority = Math.max(1, Math.min(4, Number(draft.priority) || basePriority));

            // Dificuldade: tenta IA, senão estima pela duração/escopo
            const estimatedDifficulty = estimatedMinutes >= 120 ? 3 : estimatedMinutes >= 60 ? 2 : 1;
            const difficult = Math.max(1, Math.min(4, Number(draft.difficult) || estimatedDifficulty));

            const pert = this.computePertFromMinutes(estimatedMinutes);

            // Sempre adiciona contexto e critérios (evita descrições “genéricas”)
            const finalDescription = (draft.description || node.description || '').trim();
            const definitionOfDone = this.extractDefinitionOfDone(finalDescription);

            const name = String(draft.name || `${node.name}${suffix}`).trim();
            const microTaskType = this.normalizeMicroTaskType(draft.microTaskType);
            const cognitiveMode = this.normalizeCognitiveMode(
              draft.cognitiveMode || this.mapMicroTaskTypeToCognitiveMode(microTaskType),
            );
            const contextTag = String(
              draft.contextTag || this.mapCognitiveModeToContextTag(cognitiveMode),
            ).trim();
            const themeTag = String(draft.themeTag || '').trim();
            const themeTags = themeTag ? [themeTag] : undefined;
            const parentWbsNodeId = (node as any)?._id ? String((node as any)._id) : undefined;
            const milestoneId = draft?.milestoneIndex
              ? `${generationBatchId}:${parentWbsNodeId || node.name}:m${draft.milestoneIndex}`
              : undefined;

            try {
              const createdTask = await tasksService.create({
                name,
                description: finalDescription,
                definitionOfDone,
                project: projectId,
                pomodorosPlanned,
                pertOptimisticMinutes: pert.optimistic,
                pertMostLikelyMinutes: pert.mostLikely,
                pertPessimisticMinutes: pert.pessimistic,
                pertExpectedMinutes: pert.expected,
                pertVariance: pert.variance,
                deadline: taskDeadline,
                priority,
                difficult,
                isConcluded: false,
                late: false,
                recurrency: 'no',
                notification: taskDeadline,
                microTaskType,
                cognitiveMode,
                contextTag: contextTag || undefined,
                themeTag: themeTags,
                parentWbsNodeId,
                wbsPath: currentPath,
                generationBatchId,
                milestoneId,
              });

              createdTasks.push(createdTask);
              taskCounter++;
              console.log(
                `  ✅ Task ${taskCounter}: "${createdTask.name}" (${pomodorosPlanned} pomodoros, prioridade ${priority}, dificuldade ${difficult})`,
              );
            } catch (error: any) {
              console.error(`  ❌ Erro ao criar task "${name}":`, error?.message || error);
            }
          }
        } else {
          // Intermediate node - processar filhos
          await traverse(node.children, currentPath, level + 1);
        }
      }
    };

    await traverse(nodes);
    
    const batchMetrics = this.computeBatchMetrics(
      createdTasks.map((t: any) => ({
        name: t?.name,
        description: t?.description,
        themeTag: t?.themeTag,
        microTaskType: t?.microTaskType,
      })),
    );

    console.log(
      `[WBS→Tasks][Batch ${generationBatchId}] summary total=${batchMetrics.total} ` +
        `dupScore=${batchMetrics.dupScore.toFixed(2)} ` +
        `similarScore=${batchMetrics.similarScore.toFixed(2)} ` +
        `verbVariety=${batchMetrics.verbVariety.toFixed(2)} ` +
        `cognitiveVariety=${batchMetrics.cognitiveVariety.toFixed(2)} ` +
        `themesCount=${batchMetrics.themesCount}`,
    );
    if (batchMetrics.dupScore >= 0.2 || batchMetrics.similarScore >= 0.35) {
      console.warn(
        `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ alerta monotonia: ` +
          `dupScore=${batchMetrics.dupScore.toFixed(2)} similarScore=${batchMetrics.similarScore.toFixed(2)}`,
      );
    }

    console.log(`\n📊 Resumo da conversão:`);
    console.log(`   • Total de tasks: ${createdTasks.length}`);
    console.log(`   • Total de pomodoros: ${createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0)}`);
    console.log(`   • Horas estimadas: ${(createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0) * 0.5).toFixed(1)}h`);
    
    return createdTasks;
  }

  private computePertFromMinutes(minutes: number): {
    optimistic: number;
    mostLikely: number;
    pessimistic: number;
    expected: number;
    variance: number;
  } {
    const base = Math.max(5, Math.round(minutes));
    const optimistic = Math.max(5, Math.round(base * 0.75));
    const mostLikely = Math.max(optimistic, base);
    const pessimistic = Math.max(mostLikely, Math.round(base * 1.5));
    const expected = Math.round((optimistic + 4 * mostLikely + pessimistic) / 6);
    const variance = Number(Math.pow((pessimistic - optimistic) / 6, 2).toFixed(2));

    return { optimistic, mostLikely, pessimistic, expected, variance };
  }


  private estimateMicroTaskCount(nodes: WBSNodeDto[]): number {
    let count = 0;
    const traverse = (list: WBSNodeDto[]) => {
      for (const node of list) {
        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          count += this.computeChunkMinutes(totalMinutes).length;
        } else {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return count;
  }

  private computeChunkMinutes(
    totalMinutes: number,
    options?: {
      preferredPomodoros?: number;
    },
  ): number[] {
    const minutes = Math.max(1, Math.round(totalMinutes));
    const minM = this.microTaskMinMinutes;
    const preferredPomodoros = this.normalizePreferredPomodoros(options?.preferredPomodoros);
    const preferredM = preferredPomodoros * 25;
    const softMaxM = Math.min(this.microTaskHardMaxMinutes, Math.max(preferredM, preferredPomodoros * 40));
    const hardMaxM = this.microTaskHardMaxMinutes;

    // Minimum chunks needed to respect hard max
    const minChunks = Math.max(1, Math.ceil(minutes / hardMaxM));
    // Prefer smaller chunks (roughly 1–3 pomodoros)
    const preferredChunks = Math.max(1, Math.ceil(minutes / preferredM));
    // Avoid too many chunks per leaf unless required by hard max
    let chunks = Math.min(preferredChunks, this.microTaskMaxPerLeaf);
    chunks = Math.max(chunks, minChunks);

    // Also do not create chunks smaller than the minimum size
    const maxChunksByMin = Math.max(1, Math.floor(minutes / minM));
    chunks = Math.min(chunks, maxChunksByMin);
    chunks = Math.max(chunks, minChunks);

    // Distribute minutes as evenly as possible
    let base = Math.floor(minutes / chunks);
    let remainder = minutes % chunks;

    // If the base is still too large (can happen with caps), increase chunks as needed
    while (base > hardMaxM) {
      chunks++;
      base = Math.floor(minutes / chunks);
      remainder = minutes % chunks;
    }

    const chunkMinutes: number[] = [];
    for (let i = 0; i < chunks; i++) {
      const m = base + (i < remainder ? 1 : 0);
      chunkMinutes.push(m);
    }

    // If chunks are still very large, try to split down towards the soft max.
    // (but never exceed the max-per-leaf cap unless needed)
    const average = minutes / chunkMinutes.length;
    if (average > softMaxM) {
      const targetChunks = Math.min(
        Math.max(minChunks, Math.ceil(minutes / softMaxM)),
        Math.max(minChunks, this.microTaskMaxPerLeaf),
      );
      if (targetChunks > chunkMinutes.length) {
        const newBase = Math.floor(minutes / targetChunks);
        const newRemainder = minutes % targetChunks;
        const next: number[] = [];
        for (let i = 0; i < targetChunks; i++) {
          next.push(newBase + (i < newRemainder ? 1 : 0));
        }
        return next;
      }
    }

    return chunkMinutes;
  }

  private normalizePreferredPomodoros(value?: number): number {
    const v = Number(value);
    if (!Number.isFinite(v)) return Math.ceil(this.microTaskPreferredMinutes / 25);
    return Math.max(1, Math.min(3, Math.round(v)));
  }

  private normalizeTitle(title?: string): string {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[0-9]+/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z\u00c0-\u017f\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private templateTitle(title?: string): string {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[0-9]+/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\b(parte|modulo|módulo|tarefa|micro[-\s]?tarefa|dia|semana)\b/gi, '')
      .replace(/[^a-z\u00c0-\u017f\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractVerb(title?: string): string {
    if (!title) return 'unknown';
    const normalized = title.trim().toLowerCase();
    const first = normalized.split(/\s+/)[0];
    return first || 'unknown';
  }

  private computeBatchMetrics(
    tasks: Array<{ name?: string; description?: string; themeTag?: string; microTaskType?: string }>,
  ): {
    total: number;
    uniqueTitles: number;
    dupScore: number;
    uniqueTemplates: number;
    similarScore: number;
    verbVariety: number;
    verbsCount: number;
    cognitiveVariety: number;
    cognitiveTypesCount: number;
    themesCount: number;
  } {
    const total = tasks.length || 0;
    if (!total) {
      return {
        total: 0,
        uniqueTitles: 0,
        dupScore: 0,
        uniqueTemplates: 0,
        similarScore: 0,
        verbVariety: 0,
        verbsCount: 0,
        cognitiveVariety: 0,
        cognitiveTypesCount: 0,
        themesCount: 0,
      };
    }

    const normalizedTitles = tasks.map((t) => this.normalizeTitle(t.name));
    const templateTitles = tasks.map((t) => this.templateTitle(t.name));
    const verbs = tasks.map((t) => this.extractVerb(t.name));
    const themes = tasks.flatMap((t) => {
      if (Array.isArray(t.themeTag)) return t.themeTag.filter((x) => x);
      if (t.themeTag) return [t.themeTag];
      if (t.microTaskType) return [t.microTaskType];
      return [];
    });
    const cognitiveTypes = tasks.map((t) => this.inferCognitiveType(t.name, t.description));

    const uniqueTitles = new Set(normalizedTitles).size;
    const uniqueTemplates = new Set(templateTitles).size;
    const uniqueVerbs = new Set(verbs).size;
    const uniqueThemes = new Set(themes).size;
    const uniqueCognitiveTypes = new Set(cognitiveTypes.filter((t) => t !== 'other')).size;

    const dupScore = 1 - uniqueTitles / total;
    const similarScore = 1 - uniqueTemplates / total;
    const verbVariety = uniqueVerbs / total;
    const cognitiveVariety = uniqueCognitiveTypes / total;

    return {
      total,
      uniqueTitles,
      dupScore,
      uniqueTemplates,
      similarScore,
      verbVariety,
      verbsCount: uniqueVerbs,
      cognitiveVariety,
      cognitiveTypesCount: uniqueCognitiveTypes,
      themesCount: uniqueThemes,
    };
  }

  private inferCognitiveType(title?: string, description?: string): string {
    const text = `${title || ''} ${description || ''}`.toLowerCase();
    if (!text.trim()) return 'other';

    if (/(teste|testar|simulad|quiz|prova|avaliar|verificar|checagem)/i.test(text)) return 'test';
    if (/(revisar|review|reforç|consolidar|flashcard|recall)/i.test(text)) return 'review';
    if (/(escrever|redigir|produzir|criar|implementar|codificar|construir|diagramar|desenvolver)/i.test(text)) {
      return 'deep';
    }
    if (/(capturar|coletar|levantar|listar|mapear|pesquisar|ler|ouvir|anotar|preparar|organizar|configurar)/i.test(text)) {
      return 'capture';
    }

    return 'other';
  }

  private extractDefinitionOfDone(description?: string): string | undefined {
    if (!description) return undefined;
    const match = description.split(/defini[cç][aã]o de pronto\s*:/i);
    if (match.length < 2) return undefined;
    const trimmed = (match[1] || '').trim();
    return trimmed ? trimmed : undefined;
  }

  private applyGoldilocksAndMilestones(
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
    chunkMinutes: number[],
  ) {
    const totalMinutes = chunkMinutes.reduce((sum, m) => sum + m, 0);
    const chunks = chunkMinutes.length;

    // Normalize first (keeps existing microTaskType/theme decisions when present)
    const normalized = drafts.map((d, idx) => this.normalizeDraft(d, idx, chunks));
    if (chunks <= 1) return normalized;

    // Milestones/checkpoints: every ~5h (within 4–6h) for big leaves.
    const milestoneRequired = totalMinutes >= 240; // 4h
    const milestoneEveryMinutes = 300; // 5h

    if (!milestoneRequired) return normalized;

    // Mark the chunk that crosses each milestone boundary as a checkpoint.
    const checkpointIndices = new Set<number>();
    if (milestoneRequired) {
      let cumulative = 0;
      let nextBoundary = milestoneEveryMinutes;
      for (let i = 0; i < chunks; i++) {
        cumulative += chunkMinutes[i];
        while (cumulative >= nextBoundary) {
          checkpointIndices.add(i);
          nextBoundary += milestoneEveryMinutes;
        }
      }
      // Ensure closure.
      checkpointIndices.add(chunks - 1);
    }

    // Assign milestoneIndex per task based on cumulative minutes.
    let cumulative = 0;
    return normalized.map((d, idx) => {
      cumulative += chunkMinutes[idx];
      const milestoneIndex = Math.max(1, Math.ceil(cumulative / milestoneEveryMinutes));

      if (milestoneRequired && checkpointIndices.has(idx)) {
        const checkpointType = milestoneIndex % 2 === 0 ? 'consolidate' : 'test';
        const cognitiveMode = this.normalizeCognitiveMode(
          d.cognitiveMode || this.mapMicroTaskTypeToCognitiveMode(checkpointType),
        );
        return {
          ...d,
          milestoneIndex,
          microTaskType: checkpointType,
          cognitiveMode,
          contextTag: String(d.contextTag || this.mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
        };
      }

      return {
        ...d,
        milestoneIndex,
      };
    });
  }

  private applyThemeWorkflowAndProgression(
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
    chunkMinutes: number[],
  ) {
    if (!drafts.length) return drafts;

    const byTheme = new Map<string, number[]>();
    drafts.forEach((d, idx) => {
      const theme = String(d.themeTag || '').trim() || '__no_theme__';
      if (!byTheme.has(theme)) byTheme.set(theme, []);
      byTheme.get(theme)!.push(idx);
    });

    const buildThemeWorkflow = (total: number): string[] => {
      if (total <= 1) return ['practice'];
      if (total === 2) return ['prepare', 'produce'];
      if (total === 3) return ['prepare', 'practice', 'produce'];
      const base = ['prepare', 'practice', 'produce', 'test'];
      while (base.length < total) base.splice(base.length - 1, 0, 'practice');
      return base.slice(0, total);
    };

    const progressiveMode = (index: number, total: number): string => {
      if (total <= 1) return 'medium';
      if (index === 0) return 'low';
      if (index === total - 1) return 'high';
      return 'medium';
    };

    for (const [theme, indices] of byTheme.entries()) {
      if (theme === '__no_theme__') continue;
      const total = indices.length;
      if (total <= 1) continue;
      const workflow = buildThemeWorkflow(total);

      indices.forEach((idx, localIdx) => {
        const microTaskType = this.normalizeMicroTaskType(workflow[localIdx]);
        const cognitiveMode = this.normalizeCognitiveMode(progressiveMode(localIdx, total));
        drafts[idx] = {
          ...drafts[idx],
          microTaskType,
          cognitiveMode,
          contextTag:
            String(drafts[idx].contextTag || this.mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
        };
      });
    }

    return drafts;
  }

  private dedupeCheckAndMitigate(
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
  ) {
    const seenTitles = new Map<string, number>();
    const seenTemplates = new Map<string, number>();

    return drafts.map((d) => {
      const baseName = this.stripDedupeSuffix(d.name);
      const normalized = this.normalizeTitle(baseName);
      const templated = this.templateTitle(baseName);
      const titleCount = (seenTitles.get(normalized) || 0) + 1;
      const templateCount = (seenTemplates.get(templated) || 0) + 1;
      seenTitles.set(normalized, titleCount);
      seenTemplates.set(templated, templateCount);

      if (titleCount <= 1 && templateCount <= 1) return d;

      const themeSuffix = String(d.themeTag || '').trim() || 'tema';
      const typeSuffix = String(d.microTaskType || '').trim() || 'tarefa';
      const suffix = `${themeSuffix}-${typeSuffix}-${titleCount}`;

      return {
        ...d,
        name: `${this.sanitizeTitle(baseName)} — ${suffix}`.trim(),
      };
    });
  }

  private normalizeDraft(
    d: {
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    },
    idx: number,
    total: number,
  ) {
    const microTaskType = this.normalizeMicroTaskType(d.microTaskType);
    const cognitiveMode = this.normalizeCognitiveMode(
      d.cognitiveMode || this.mapMicroTaskTypeToCognitiveMode(microTaskType),
    );
    return {
      ...d,
      name: String(d.name || `Micro-tarefa (${idx + 1}/${total})`).trim(),
      microTaskType,
      cognitiveMode,
      contextTag: String(d.contextTag || this.mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
    };
  }

  private normalizeMicroTaskType(value?: string): string {
    const v = String(value || '').toLowerCase().trim();
    if (['prepare', 'practice', 'produce', 'review', 'test', 'consolidate'].includes(v)) return v;
    return 'practice';
  }

  private normalizeCognitiveMode(value?: string): string {
    const v = String(value || '').toLowerCase().trim();
    if (['low', 'medium', 'high'].includes(v)) return v;
    return 'medium';
  }

  private mapCognitiveTypeToMicroTaskType(type?: string): string {
    switch (type) {
      case 'capture':
        return 'prepare';
      case 'review':
        return 'review';
      case 'test':
        return 'test';
      case 'deep':
        return 'produce';
      default:
        return 'practice';
    }
  }

  private mapMicroTaskTypeToCognitiveMode(type?: string): string {
    switch (String(type || '').toLowerCase()) {
      case 'prepare':
        return 'low';
      case 'review':
        return 'low';
      case 'practice':
        return 'medium';
      case 'produce':
        return 'high';
      case 'test':
        return 'high';
      case 'consolidate':
        return 'medium';
      default:
        return 'medium';
    }
  }

  private mapCognitiveModeToContextTag(mode?: string): string {
    switch (String(mode || '').toLowerCase()) {
      case 'low':
        return '@celular/offline';
      case 'high':
        return '@mesa/foco';
      default:
        return '@computador';
    }
  }

  private extractJsonArray<T = any>(response: string): T[] {
    if (!response || typeof response !== 'string') {
      throw new Error('Resposta da IA vazia');
    }

    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    // Try to isolate the array
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) cleaned = match[0];

    // If it looks like JSON started but was truncated, fail fast so caller can retry/batch.
    const hasArrayStart = cleaned.includes('[');
    const endsAsArray = cleaned.trim().endsWith(']');
    if (hasArrayStart && !endsAsArray) {
      throw new Error('Resposta JSON parece truncada (array incompleto)');
    }

    const tryParse = (text: string): any => {
      return JSON.parse(text);
    };

    try {
      const parsed = tryParse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('IA não retornou um array JSON');
      return parsed as T[];
    } catch {
      // Common cleanups: remove trailing commas & control chars
      let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');
      repaired = repaired.replace(/[\x00-\x1F\x7F]/g, ' ');
      // Normalize “smart quotes” that break JSON parsing.
      repaired = repaired
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      const parsed = tryParse(repaired);
      if (!Array.isArray(parsed)) {
        throw new Error('IA não retornou um array JSON');
      }
      return parsed as T[];
    }
  }

  private extractJsonObject<T = any>(response: string): T {
    if (!response || typeof response !== 'string') {
      throw new Error('Resposta da IA vazia');
    }

    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    const hasObjStart = cleaned.includes('{');
    const endsAsObj = cleaned.trim().endsWith('}');
    if (hasObjStart && !endsAsObj) {
      throw new Error('Resposta JSON parece truncada (objeto incompleto)');
    }

    const tryParse = (text: string): any => {
      return JSON.parse(text);
    };

    try {
      const parsed = tryParse(cleaned);
      if (!parsed || Array.isArray(parsed)) throw new Error('IA não retornou um objeto JSON');
      return parsed as T;
    } catch {
      let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');
      repaired = repaired.replace(/[\x00-\x1F\x7F]/g, ' ');
      repaired = repaired
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      const parsed = tryParse(repaired);
      if (!parsed || Array.isArray(parsed)) {
        throw new Error('IA não retornou um objeto JSON');
      }
      return parsed as T;
    }
  }

  private validatePlannerPlan(plan: any): {
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  } {
    const parsed = this.plannerSchema.safeParse(plan);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Plano inválido: ${issues}`);
    }
    return parsed.data;
  }

  private validateDrafts(drafts: any[]): Array<{
    name: string;
    description: string;
    pomodorosPlanned: number;
    priority: number;
    difficult: number;
    microTaskType: string;
    themeTag: string;
    contextTag: string;
    cognitiveMode: string;
  }> {
    const parsed = this.draftsSchema.safeParse(drafts);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Drafts inválidos: ${issues}`);
    }
    return parsed.data as any;
  }

  private normalizeWorkflowTypes(types: string[], total: number): string[] {
    const allowed = ['prepare', 'practice', 'produce', 'review', 'test', 'consolidate'];
    const cleaned = (types || [])
      .map((t) => String(t || '').toLowerCase().trim())
      .filter((t) => allowed.includes(t));

    if (!total) return [];

    if (cleaned.length === 0) {
      if (total === 1) return ['practice'];
      if (total === 2) return ['prepare', 'produce'];
      if (total === 3) return ['prepare', 'practice', 'produce'];
      const base = ['prepare', 'practice', 'practice', 'produce'];
      while (base.length < total) base.splice(base.length - 1, 0, 'practice');
      return base.slice(0, total);
    }

    const out: string[] = [];
    for (let i = 0; i < total; i++) {
      out.push(cleaned[i % cleaned.length]);
    }
    return out;
  }

  private getThemeSuggestions(params: {
    project?: any;
    node: WBSNodeDto;
  }): { category: 'vocab' | 'tech' | 'general'; themes: string[] } {
    const projectSummary =
      params.project?.smartObjective?.summary || params.project?.description || '';
    const text = `${params.node.name} ${params.node.description || ''} ${projectSummary}`
      .toLowerCase()
      .trim();

    const isVocab = /vocab|vocabul|hsk|palavr|idiom|flashcard|kanji|hanzi|pinyin|词汇|词彙/i.test(text);
    const isTech =
      /api|backend|frontend|infra|deploy|docker|kubernetes|k8s|database|banco|sql|postgres|mysql|mongo|redis|cache|fila|queue|mensager|event|test|qa|unit|integration|e2e|observabil|monitor|log|seguran|auth|oauth|jwt|performance|latenc|ui|ux/i.test(
        text,
      );

    if (isVocab) {
      return {
        category: 'vocab',
        themes: [
          'comida',
          'casa',
          'trabalho',
          'viagem',
          'saude',
          'escola',
          'tecnologia',
          'financas',
          'tempo',
          'relacoes',
          'lazer',
          'cultura',
        ].slice(0, 6),
      };
    }

    if (isTech) {
      const prioritized = new Set<string>();
      if (/frontend|ui|ux|interface/.test(text)) prioritized.add('ui');
      if (/api|endpoint|rest|graphql/.test(text)) prioritized.add('api');
      if (/database|banco|sql|postgres|mysql|mongo/.test(text)) prioritized.add('dados');
      if (/test|qa|unit|integration|e2e/.test(text)) prioritized.add('testes');
      if (/observabil|monitor|log|trace|metric/.test(text)) prioritized.add('observabilidade');
      if (/seguran|auth|oauth|jwt/.test(text)) prioritized.add('seguranca');
      if (/deploy|docker|kubernetes|k8s|infra/.test(text)) prioritized.add('deploy');

      const defaults = [
        'setup',
        'core',
        'integracao',
        'testes',
        'observabilidade',
        'seguranca',
        'performance',
        'documentacao',
        'deploy',
      ];

      const themes = Array.from(prioritized);
      for (const t of defaults) {
        if (themes.length >= 6) break;
        if (!themes.includes(t)) themes.push(t);
      }

      return {
        category: 'tech',
        themes,
      };
    }

    return {
      category: 'general',
      themes: ['fundamentos', 'aplicacao', 'revisao', 'integracao'].slice(0, 6),
    };
  }

  private extractThemeSegments(text: string): string[] {
    if (!text) return [];
    const cleaned = text.replace(/\r/g, ' ').replace(/\t/g, ' ').replace(/\u0000/g, ' ');

    const parts = cleaned
      .split(/[\n;•]+/)
      .flatMap((p) => p.split(/[.!?]+/))
      .flatMap((p) => p.split(/\s+-\s+|\s+—\s+|\s+–\s+/))
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 20);

    const unique = new Set<string>();
    for (const part of parts) {
      if (!unique.has(part)) unique.add(part);
    }
    return Array.from(unique);
  }

  private summarizeThemeFromSegment(segment: string): string {
    if (!segment) return '';
    const stop = new Set([
      'de',
      'da',
      'do',
      'das',
      'dos',
      'e',
      'ou',
      'para',
      'por',
      'com',
      'em',
      'no',
      'na',
      'nos',
      'nas',
      'um',
      'uma',
      'uns',
      'umas',
      'ao',
      'aos',
      'à',
      'às',
      'se',
      'que',
      'como',
      'sobre',
      'entre',
      'mais',
      'menos',
    ]);

    const tokens = segment
      .toLowerCase()
      .replace(/[^a-z\u00c0-\u017f0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.length > 2 && !stop.has(t));

    const title = tokens.slice(0, 4).join(' ');
    return title || segment.slice(0, 40).trim();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  private normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (!norm) return vec;
    return vec.map((v) => v / norm);
  }

  private kMeansClusters(vectors: number[][], k: number): { clusters: number[][]; centroids: number[][] } {
    const safeK = Math.max(1, Math.min(k, vectors.length));
    const centroids = vectors.slice(0, safeK).map((v) => this.normalizeVector([...v]));
    const clusters: number[][] = Array.from({ length: safeK }, () => []);

    for (let iter = 0; iter < 6; iter++) {
      for (const c of clusters) c.length = 0;

      vectors.forEach((v, idx) => {
        let best = 0;
        let bestScore = -Infinity;
        centroids.forEach((c, cIdx) => {
          const score = this.cosineSimilarity(v, c);
          if (score > bestScore) {
            bestScore = score;
            best = cIdx;
          }
        });
        clusters[best].push(idx);
      });

      centroids.forEach((c, cIdx) => {
        const members = clusters[cIdx];
        if (!members.length) return;
        const next = new Array(c.length).fill(0);
        members.forEach((idx) => {
          const v = vectors[idx];
          for (let i = 0; i < v.length; i++) next[i] += v[i];
        });
        for (let i = 0; i < next.length; i++) next[i] = next[i] / members.length;
        centroids[cIdx] = this.normalizeVector(next);
      });
    }

    return { clusters, centroids };
  }

  private async getThemeSuggestionsForLeaf(params: {
    project?: any;
    node: WBSNodeDto;
  }): Promise<{ category: 'vocab' | 'tech' | 'general' | 'embedding'; themes: string[] }> {
    const projectSummary =
      params.project?.smartObjective?.summary || params.project?.description || '';
    const baseText = `${params.node.name}. ${params.node.description || ''} ${projectSummary}`.trim();

    if (baseText.length < this.minEmbeddingTextLength) {
      return this.getThemeSuggestions(params);
    }

    const segments = this.extractThemeSegments(baseText);
    if (segments.length < this.minEmbeddingSegments) {
      return this.getThemeSuggestions(params);
    }

    const embeddings: { segment: string; vector: number[] }[] = [];
    for (const segment of segments) {
      const vector = await this.geminiService.generateEmbedding(segment);
      if (vector.length) embeddings.push({ segment, vector: this.normalizeVector(vector) });
    }

    if (embeddings.length < 2) {
      return this.getThemeSuggestions(params);
    }

    const k = Math.min(
      this.maxEmbeddingClusters,
      Math.max(2, Math.round(Math.sqrt(embeddings.length))),
    );
    const { clusters, centroids } = this.kMeansClusters(
      embeddings.map((e) => e.vector),
      k,
    );

    const themes: string[] = [];
    clusters.forEach((cluster, idx) => {
      if (!cluster.length) return;
      let bestSegment = embeddings[cluster[0]].segment;
      let bestScore = -Infinity;
      cluster.forEach((segIdx) => {
        const score = this.cosineSimilarity(embeddings[segIdx].vector, centroids[idx]);
        if (score > bestScore) {
          bestScore = score;
          bestSegment = embeddings[segIdx].segment;
        }
      });
      const theme = this.summarizeThemeFromSegment(bestSegment);
      if (theme) themes.push(theme);
    });

    const uniqueThemes = Array.from(new Set(themes)).slice(0, this.maxEmbeddingClusters);
    if (!uniqueThemes.length) {
      return this.getThemeSuggestions(params);
    }

    return { category: 'embedding', themes: uniqueThemes };
  }

  private buildMicroTasksPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    const minutesList = params.chunkMinutes.map((m, i) => `${i + 1}: ${m}min`).join(', ');

    return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de uma WBS.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha, regra 8/80):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

Preciso que você gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas, uma para cada parte com duração alvo:
${minutesList}

REGRAS IMPORTANTES (para não ficar genérico):
1) Cada micro-tarefa deve ter um RESULTADO verificável (entregável), não apenas "estudar".
2) A descrição deve incluir:
   - Passos objetivos (2-5 itens)
   - Definição de pronto (como saber que terminou)
   - Qualquer recurso/entrada necessário (se aplicável)
3) Evite frases vagas como "pesquisar" ou "estudar" sem critério.
4) Use linguagem direta e prática.
5) Prefira micro-tarefas pequenas (1-3 pomodoros). Use 4-6 apenas se a parte exigir.
6) O nome da micro-tarefa deve começar com um VERBO de ação (Próxima Ação GTD).

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). Cada item deve ter EXATAMENTE:
- "name": string
- "description": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)
- "microTaskType": string (prepare|practice|produce|review|test|consolidate)
- "themeTag": string
- "contextTag": string (ex.: @computador, @mesa/foco, @celular/offline)
- "cognitiveMode": string (low|medium|high)

Use hoje como ${today}.`;
  }

  private buildMicroTasksPlannerPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    themeHints?: string[];
    workflowMix?: Record<string, number>;
  }): string {
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
    const minutesList = params.chunkMinutes.map((m, i) => `${i + 1}: ${m}min`).join(', ');
    const themeHintsText = params.themeHints?.length
      ? params.themeHints.join(', ')
      : 'Sem sugestões';

    const mixHint = params.workflowMix
      ? `

Preferência de mix de tipos (soma 1.0):
${Object.entries(params.workflowMix)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
`
      : '';

    return `Você é um planejador de micro-tarefas. Sua função é CRIAR UM PLANO (temas + workflow) para evitar repetição.

Contexto do projeto: ${projectSummary || 'Sem resumo'}

Pacote WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas: ${params.node.estimatedHours}h

Tamanhos alvo (minutos) das micro-tarefas:
${minutesList}

Sugestões de temas (use se fizer sentido):
${themeHintsText}
${mixHint}

REGRAS IMPORTANTES:
1) Gere de 2 a 6 TEMAS (themes) com um critério claro.
2) Workflow deve ser uma sequência de tipos para ${params.chunkMinutes.length} tarefas.
3) Proibido “Parte 1/24” e repetição de verbo entre temas.
4) Inclua milestones quando fizer sentido (a cada 4–6h de esforço agregado).

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON válido, sem markdown):
{
  "themes": [ { "name": "string", "criteria": "string" } ],
  "workflow": ["prepare","practice","produce"],
  "milestones": [ { "name": "string", "goal": "string", "atMinutes": number } ],
  "constraints": { "avoidRepeatingVerbs": true, "minVerbVariety": 4 }
}
`;
  }

  private buildMicroTasksGeneratorPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    plan: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
      milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    };
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    const workflow = this.normalizeWorkflowTypes(params.plan.workflow || [], params.chunkMinutes.length);
    const minutesList = params.chunkMinutes
      .map((m, i) => `${i + 1}: ${m}min (tipo: ${workflow[i] || 'practice'})`)
      .join(', ');

    const themes = (params.plan.themes || [])
      .map((t, i) => `${i + 1}. ${t.name}${t.criteria ? ` — ${t.criteria}` : ''}`)
      .join('\n');

    const milestones = (params.plan.milestones || [])
      .map((m, i) => `${i + 1}. ${m?.name || 'Milestone'} (${m?.atMinutes || '?'}min): ${m?.goal || ''}`)
      .join('\n');

    const verbLibrary = `
prepare: preparar, organizar, coletar, listar, configurar, selecionar
practice: praticar, aplicar, resolver, exercitar, repetir, consolidar
produce: produzir, escrever, criar, implementar, construir, sintetizar
review: revisar, corrigir, comparar, reforçar, relembrar
test: testar, avaliar, simular, verificar, validar
consolidate: resumir, conectar, padronizar, registrar, documentar
`;

    return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de um PLANO.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

PLANO (temas):
${themes || 'Sem temas'}

PLANO (workflow):
${workflow.join(' → ')}

Milestones:
${milestones || 'Sem milestones'}

Tamanhos alvo (minutos) das micro-tarefas:
${minutesList}

Biblioteca de verbos (use para variar):${verbLibrary}

REGRAS IMPORTANTES (anti-repetição):
1) Gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas.
2) Cada micro-tarefa deve ter um RESULTADO verificável (entregável).
3) A descrição deve incluir passos (2-5) + Definição de pronto.
4) Proibido “Parte 1/24” ou títulos repetidos.
5) Varie verbo + output + tema entre itens.
6) Cada item deve usar um "themeTag" de um dos temas acima.
7) O nome da micro-tarefa deve começar com um VERBO de ação (GTD).

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). Cada item deve ter EXATAMENTE:
- "name": string
- "description": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)
- "microTaskType": string (prepare|practice|produce|review|test|consolidate)
- "themeTag": string
- "contextTag": string (ex.: @computador, @mesa/foco, @celular/offline)
- "cognitiveMode": string (low|medium|high)

Use hoje como ${today}.`;
  }

  private async generateMicroTasksDraftsForLeaf(
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number },
    chunkMinutes: number[],
  ): Promise<
    Array<{
      name: string;
      description: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    // Generate in batches to avoid JSON truncation (common when JSON-mode is unsupported).
    const maxPerCall = 8;

    const isJsonishError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return (
        msg.includes('json') ||
        msg.includes('truncad') ||
        msg.includes('incomplet') ||
        msg.includes('parse') ||
        msg.includes('array') ||
        msg.includes('object')
      );
    };

    const generateDraftsForSlice = async (sliceMinutes: number[]): Promise<any[]> => {
      const prompt = this.buildMicroTasksPrompt({
        ...params,
        chunkMinutes: sliceMinutes,
      });

      const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
        const response = await this.geminiService.generateContent(prompt, {
          responseMimeType: 'application/json',
          maxOutputTokens: opts.maxOutputTokens,
          temperature: opts.temperature,
        });
        const drafts = this.extractJsonArray<any>(response);
        const validated = this.validateDrafts(drafts);
        if (validated.length !== sliceMinutes.length) {
          throw new Error(`IA retornou ${validated.length} itens; esperado ${sliceMinutes.length}`);
        }
        return validated;
      };

      try {
        // Prefer lower temperature to reduce verbosity/rambling.
        return await attempt({ maxOutputTokens: 1600, temperature: 0.3 });
      } catch (err: any) {
        // If JSON is truncated or malformed, split the request into smaller slices.
        if (sliceMinutes.length > 1 && isJsonishError(err)) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
          const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
          return [...left, ...right];
        }

        // Last try: slightly higher token budget and stricter temperature.
        if (isJsonishError(err)) {
          return await attempt({ maxOutputTokens: 2200, temperature: 0.15 });
        }
        throw err;
      }
    };

    const validatedDrafts: any[] = [];
    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      const sliceDrafts = await generateDraftsForSlice(sliceMinutes);
      validatedDrafts.push(...sliceDrafts);
    }

    if (validatedDrafts.length !== chunkMinutes.length) {
      throw new Error(`IA retornou ${validatedDrafts.length} itens; esperado ${chunkMinutes.length}`);
    }

    // Normalize
    return validatedDrafts.map((d: any, idx: number) => {
      const targetMinutes = chunkMinutes[idx];
      const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
      const normalizedName = String(d?.name || `${params.node.name} (${idx + 1}/${chunkMinutes.length})`).trim();
      const inferredType = this.normalizeMicroTaskType(
        d?.microTaskType || this.mapCognitiveTypeToMicroTaskType(this.inferCognitiveType(normalizedName, d?.description)),
      );
      const inferredMode = this.normalizeCognitiveMode(
        d?.cognitiveMode || this.mapMicroTaskTypeToCognitiveMode(inferredType),
      );
      const inferredContext =
        String(d?.contextTag || this.mapCognitiveModeToContextTag(inferredMode)).trim() || undefined;
      return {
        name: normalizedName,
        description: String(d?.description || '').trim(),
        pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || fallbackPomodoros)),
        priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
        difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
        microTaskType: inferredType,
        themeTag: String(d?.themeTag || '').trim() || undefined,
        contextTag: inferredContext,
        cognitiveMode: inferredMode,
      };
    });
  }

  private async generateMicroTasksPlanForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    workflowMix?: Record<string, number>;
  }): Promise<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> {
    const themeHints = await this.getThemeSuggestionsForLeaf({
      project: params.project,
      node: params.node,
    });
    const prompt = this.buildMicroTasksPlannerPrompt({
      ...params,
      themeHints: themeHints.themes,
    });

    const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      const plan = this.extractJsonObject<any>(response);
      return this.validatePlannerPlan(plan);
    };

    try {
      return await attempt({ maxOutputTokens: 1200, temperature: 0.6 });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      // Common with models that don't support JSON mode or when output is truncated.
      if (/json/i.test(msg) || /truncad|incomplet|parse/i.test(msg)) {
        return await attempt({ maxOutputTokens: 2200, temperature: 0.2 });
      }
      throw err;
    }
  }

  private async generateMicroTasksDraftsForLeafWithPlan(
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number; plan: any },
    chunkMinutes: number[],
  ): Promise<
    Array<{
      name: string;
      description: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    // Generate in batches to avoid JSON truncation on big leaves.
    const maxPerCall = 10;
    const out: Array<any> = [];

    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      const slicedPlan = {
        ...params.plan,
        workflow: Array.isArray(params.plan?.workflow)
          ? params.plan.workflow.slice(start, end)
          : params.plan?.workflow,
      };

      const prompt = this.buildMicroTasksGeneratorPrompt({
        project: params.project,
        node: params.node,
        currentPath: params.currentPath,
        level: params.level,
        chunkMinutes: sliceMinutes,
        plan: slicedPlan,
      });

      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 1800,
      });

      const drafts = this.extractJsonArray<any>(response);
      const validatedDrafts = this.validateDrafts(drafts);

      if (validatedDrafts.length !== sliceMinutes.length) {
        throw new Error(`IA retornou ${validatedDrafts.length} itens; esperado ${sliceMinutes.length}`);
      }

      const mapped = validatedDrafts.map((d: any, localIdx: number) => {
        const globalIdx = start + localIdx;
        const targetMinutes = chunkMinutes[globalIdx];
        const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
        const normalizedName = String(
          d?.name || `${params.node.name} (${globalIdx + 1}/${chunkMinutes.length})`,
        ).trim();
        const inferredType = this.normalizeMicroTaskType(
          d?.microTaskType ||
            this.mapCognitiveTypeToMicroTaskType(
              this.inferCognitiveType(normalizedName, d?.description),
            ),
        );
        const inferredMode = this.normalizeCognitiveMode(
          d?.cognitiveMode || this.mapMicroTaskTypeToCognitiveMode(inferredType),
        );
        const inferredContext =
          String(d?.contextTag || this.mapCognitiveModeToContextTag(inferredMode)).trim() || undefined;

        return {
          name: normalizedName,
          description: String(d?.description || '').trim(),
          pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || fallbackPomodoros)),
          priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
          difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
          microTaskType: inferredType,
          themeTag: String(d?.themeTag || '').trim() || undefined,
          contextTag: inferredContext,
          cognitiveMode: inferredMode,
        };
      });

      out.push(...mapped);
    }

    return out;
  }

  private fallbackMicroTasksDraftsForLeaf(
    params: { node: WBSNodeDto; currentPath: string; level: number },
    chunkMinutes: number[],
  ): Array<{
    name: string;
    description: string;
    pomodorosPlanned: number;
    priority: number;
    difficult: number;
    microTaskType?: string;
    themeTag?: string;
    contextTag?: string;
    cognitiveMode?: string;
  }> {
    const nameLower = (params.node.name || '').toLowerCase();
    const isVocab = /vocab|vocabul|hsk/.test(nameLower);
    const isGrammar = /gram[aá]t/.test(nameLower);
    const isListening = /audi|oral|compreens[aã]o/.test(nameLower);
    const isMock = /simulad|prova|revis/.test(nameLower);
    const themeHints = this.getThemeSuggestions({ node: params.node });

    // Fallback workflow + verb variation (prevents homogeneous “Parte X/N” series)
    const workflow = this.normalizeWorkflowTypes([], chunkMinutes.length);
    const verbsByType: Record<string, string[]> = {
      prepare: ['Preparar', 'Organizar', 'Selecionar', 'Coletar', 'Mapear', 'Listar'],
      practice: ['Praticar', 'Aplicar', 'Exercitar', 'Treinar', 'Resolver', 'Repetir'],
      produce: ['Criar', 'Escrever', 'Produzir', 'Montar', 'Construir', 'Sintetizar'],
      review: ['Revisar', 'Corrigir', 'Refinar', 'Reforçar', 'Comparar', 'Relembrar'],
      test: ['Testar', 'Avaliar', 'Simular', 'Validar', 'Verificar', 'Checar'],
      consolidate: ['Consolidar', 'Resumir', 'Registrar', 'Documentar', 'Conectar', 'Padronizar'],
    };
    const pickVerb = (type: string, idx: number) => {
      const list = verbsByType[type] || verbsByType.practice;
      return list[idx % list.length];
    };

    const basePriority = Math.max(1, Math.min(4, 5 - params.level));

    return chunkMinutes.map((minutes, idx) => {
      const pomodorosPlanned = Math.max(1, Math.min(6, Math.ceil(minutes / 25)));
      const difficult = minutes >= 120 ? 3 : minutes >= 60 ? 2 : 1;

      const microTaskType = this.normalizeMicroTaskType(workflow[idx]);
      const verb = pickVerb(microTaskType, idx);
      const hintedTheme = themeHints.themes.length
        ? themeHints.themes[idx % themeHints.themes.length]
        : 'geral';

      if (isVocab) {
        const words = Math.max(15, Math.round(minutes / 3));
        return {
          name: `${verb} ${words} palavras — tema: ${hintedTheme}`,
          description:
            `Passos:\n` +
            `- Selecione ~${words} palavras do pacote "${params.node.name}" (tema: ${hintedTheme})\n` +
            `- Crie flashcards (frente: PT/EN, verso: 汉字 + pinyin + significado + 1 frase exemplo)\n` +
            `- Faça 2 rodadas de recall ativo (sem olhar resposta)\n` +
            `- Escreva 3 frases curtas usando 3 palavras difíceis\n` +
            `\nDefinição de pronto:\n- ${words} flashcards criados + 1 rodada de acertos registrada (>=70% ideal)\n` +
            `\nDica: foque nas mais difíceis e marque para revisão.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
          microTaskType,
          themeTag: hintedTheme || 'vocabulario',
          cognitiveMode: this.mapMicroTaskTypeToCognitiveMode(microTaskType),
          contextTag: this.mapCognitiveModeToContextTag(this.mapMicroTaskTypeToCognitiveMode(microTaskType)),
        };
      }

      if (isGrammar) {
        return {
          name: `${verb} padrão gramatical — ${hintedTheme}`,
          description:
            `Passos:\n` +
            `- Escolha 1-2 tópicos de "${params.node.name}"\n` +
            `- Escreva 8-12 frases originais usando o padrão\n` +
            `- Valide com exemplos de referência e corrija 3 erros comuns\n` +
            `\nDefinição de pronto:\n- 8-12 frases revisadas + lista de 3 erros e correções.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
          microTaskType,
          themeTag: hintedTheme || 'gramatica',
          cognitiveMode: this.mapMicroTaskTypeToCognitiveMode(microTaskType),
          contextTag: this.mapCognitiveModeToContextTag(this.mapMicroTaskTypeToCognitiveMode(microTaskType)),
        };
      }

      if (isListening) {
        return {
          name: `${verb} escuta + shadowing — ${hintedTheme}`,
          description:
            `Passos:\n` +
            `- Escolha 1 áudio curto relacionado a "${params.node.name}"\n` +
            `- Ouça 2x sem legenda e anote palavras-chave\n` +
            `- Ouça 1x com legenda/transcrição e corrija\n` +
            `- Faça 5 minutos de shadowing (repetição em voz alta)\n` +
            `\nDefinição de pronto:\n- Anotações + 5 frases/transcrições curtas validadas.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
          microTaskType,
          themeTag: hintedTheme || 'listening',
          cognitiveMode: this.mapMicroTaskTypeToCognitiveMode(microTaskType),
          contextTag: this.mapCognitiveModeToContextTag(this.mapMicroTaskTypeToCognitiveMode(microTaskType)),
        };
      }

      if (isMock) {
        return {
          name: `${pickVerb('test', idx)} mini-simulado — ${hintedTheme}`,
          description:
            `Passos:\n` +
            `- Resolva 10-20 questões relacionadas a "${params.node.name}"\n` +
            `- Registre tempo e acertos\n` +
            `- Analise 3 erros e escreva a regra/razão do erro\n` +
            `\nDefinição de pronto:\n- Resultado do mini-simulado + lista de 3 aprendizados acionáveis.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
          microTaskType: 'test',
          themeTag: hintedTheme || 'simulado',
          cognitiveMode: 'high',
          contextTag: '@mesa/foco',
        };
      }

      // Generic fallback (still non-generic: includes deliverable + DoD)
      return {
        name: `${verb} entregável — ${hintedTheme}`,
        description:
          `Passos:\n` +
          `- Defina o resultado específico para "${params.node.name}" (1 frase)\n` +
          `- Faça uma lista de verificação (3-6 itens)\n` +
          `- Produza evidência (texto/link/arquivo)\n` +
          `\nDefinição de pronto:\n- Checklist concluído + evidência do entregável (texto/link/arquivo).`,
        pomodorosPlanned,
        priority: basePriority,
        difficult,
        microTaskType,
        themeTag: hintedTheme,
        cognitiveMode: this.mapMicroTaskTypeToCognitiveMode(microTaskType),
        contextTag: this.mapCognitiveModeToContextTag(this.mapMicroTaskTypeToCognitiveMode(microTaskType)),
      };
    });
  }

  /**
   * Save WBS nodes to the database
   */
  async saveWBS(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    console.log(`🗑️  Deletando WBS antiga do projeto ${projectId}...`);
    const deleteResult = await this.wbsNodeModel.deleteMany({ projectId }).exec();
    console.log(`✅ ${deleteResult.deletedCount} nós deletados`);

    const savedNodes: WBSNodeDocument[] = [];

    // Limpar _id de todos os nós recursivamente antes de salvar
    const cleanNodeIds = (nodeList: WBSNodeDto[]): WBSNodeDto[] => {
      return nodeList.map(node => {
        const { _id, ...cleanNode } = node as any;
        return {
          ...cleanNode,
          children: node.children && node.children.length > 0 
            ? cleanNodeIds(node.children)
            : []
        };
      });
    };

    const cleanedNodes = cleanNodeIds(nodes);
    console.log(`🧹 IDs antigos removidos, salvando ${cleanedNodes.length} nós raiz`);

    const saveRecursive = async (
      nodeList: WBSNodeDto[],
      parentId: string | null = null,
      level = 1,
    ) => {
      for (const node of nodeList) {
        const doc = new this.wbsNodeModel({
          projectId,
          name: node.name,
          description: node.description || '',
          level: level, // ✅ Usa o level da recursão, não do node
          parentId,
          estimatedHours: node.estimatedHours,
          order: node.order || 0,
          status: 'planned',
        });

        const saved = await doc.save();
        savedNodes.push(saved);
        
        const savedId = String(saved._id);
        console.log(`  ${'  '.repeat(level - 1)}✅ Salvo level ${level}: "${node.name}" (ID: ${savedId}) parentId: ${parentId || 'null'}`);

        if (node.children && node.children.length > 0) {
          await saveRecursive(node.children, savedId, level + 1);
        }
      }
    };

    await saveRecursive(cleanedNodes);
    console.log(`💾 ${savedNodes.length} nós salvos no banco de dados`);
    return savedNodes;
  }

  /**
   * Get WBS for a project, reconstructed as a tree
   */
  async getWBS(projectId: string): Promise<WBSNodeDto[]> {
    const allNodes = await this.wbsNodeModel
      .find({ projectId })
      .sort({ level: 1, order: 1 })
      .exec();

    console.log(`🔍 Encontrados ${allNodes.length} nós no banco para projeto ${projectId}`);

    if (allNodes.length === 0) return [];

    // Build tree from flat list
    const nodeMap = new Map<string, WBSNodeDto & { _id: string }>();
    const roots: (WBSNodeDto & { _id: string })[] = [];

    // Primeiro, adiciona todos os nós ao mapa
    for (const doc of allNodes) {
      const node: WBSNodeDto & { _id: string } = {
        _id: String(doc._id), // ✅ Converte ObjectId para string
        name: doc.name,
        description: doc.description,
        level: doc.level,
        parentId: doc.parentId || undefined,
        estimatedHours: doc.estimatedHours,
        order: doc.order,
        children: [],
      };
      nodeMap.set(node._id, node);
    }

    // Depois, constrói a hierarquia
    for (const node of nodeMap.values()) {
      if (node.parentId) {
        // Tem pai - adiciona como filho
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children!.push(node);
        } else {
          console.warn(`⚠️ Nó órfão encontrado: "${node.name}" (level ${node.level}) - parentId não existe: ${node.parentId}`);
          // Nós órfãos são ignorados - não devem aparecer como raiz
        }
      } else {
        // Não tem pai - deve ser raiz (level 1)
        if (node.level === 1) {
          roots.push(node);
        } else {
          console.warn(`⚠️ Nó inválido: "${node.name}" (level ${node.level}) sem parentId - deveria ser level 1`);
        }
      }
    }

    console.log(`🌳 Reconstruídos ${roots.length} nós raiz válidos`);
    return roots;
  }

  /**
   * Parse WBS JSON from Gemini response (handling markdown code blocks)
   */
  private parseWBSFromResponse(response: string): WBSNodeDto[] {
    try {
      let cleanResponse = response.trim();

      // Remove markdown code blocks
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```(?:json)?\s*/, '')
          .replace(/```\s*$/, '');
      }

      cleanResponse = cleanResponse.trim();
      
      // Check if response looks truncated (incomplete JSON)
      if (!cleanResponse.endsWith(']') && !cleanResponse.endsWith('}')) {
        console.warn('Response appears truncated:', cleanResponse.substring(cleanResponse.length - 100));
        throw new Error('Resposta da IA foi truncada. Tente simplificar o objetivo SMART ou divida em etapas menores.');
      }

      const parsed = JSON.parse(cleanResponse);

      if (!Array.isArray(parsed)) {
        throw new Error('WBS response is not an array');
      }

      return this.normalizeWBSNodes(parsed, 1);
    } catch (error) {
      console.error('Erro ao fazer parse da WBS:', error);
      console.error('Resposta recebida (primeiros 500 chars):', response.substring(0, 500));
      console.error('Resposta recebida (últimos 200 chars):', response.substring(Math.max(0, response.length - 200)));
      
      if (error.message && error.message.includes('truncada')) {
        throw error;
      }
      throw new Error('Não foi possível processar a WBS gerada pela IA. A resposta pode estar incompleta ou mal formatada.');
    }
  }

  /**
   * Normalize and validate parsed WBS nodes
   */
  private normalizeWBSNodes(nodes: any[], level: number): WBSNodeDto[] {
    return nodes.map((node, index) => ({
      name: node.name || `Entrega ${index + 1}`,
      description: node.description || '',
      level,
      estimatedHours: typeof node.estimatedHours === 'number' ? node.estimatedHours : 0,
      order: node.order || index + 1,
      children: node.children && Array.isArray(node.children)
        ? this.normalizeWBSNodes(node.children, level + 1)
        : [],
    }));
  }
}
