import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../tasks/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { MonotonyDetectionService } from './monotony-detection.service';
import { extractJsonArray } from '../utils/json-parser.util';
import { normalizeTitle, templateTitle, extractVerb } from '../utils/normalizers.util';
import { MAX_MONOTONY_FIX_ROUNDS, MONOTONY_FIX_BATCH_SIZE } from '../constants/wbs.constants';

export interface MicroTaskDraft {
  name: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: string[];
  pomodorosPlanned?: number;
  priority?: number;
  difficult?: number;
  microTaskType?: string;
  themeTag?: string;
  contextTag?: string;
  cognitiveMode?: string;
  milestoneIndex?: number;
}

/**
 * Service for auto-fixing monotony issues in micro-task batches using AI
 */
@Injectable()
export class MonotonyFixService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly monotonyDetection: MonotonyDetectionService,
  ) {}

  /**
   * Simple sanitization: remove "1/4" patterns and clean whitespace
   */
  private sanitizeTitle(name?: string): string {
    let t = String(name || '').trim();
    if (!t) return '';
    t = t.replace(/\b\d+\s*\/\s*\d+\b/g, '').trim();
    t = t.replace(/\s*-\s*$/g, '').replace(/\s*—\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
    return t;
  }

  /**
   * Auto-fix monotony issues for a leaf node using AI regeneration
   * Regenerates problematic tasks in small batches to avoid truncation
   */
  async autoFixMonotonyForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    drafts: MicroTaskDraft[];
    maxCalls: number;
    forceIndices?: number[];
    modelOverride?: string;
  }): Promise<{ drafts: MicroTaskDraft[]; aiCallsUsed: number }> {
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

    for (let round = 0; round < MAX_MONOTONY_FIX_ROUNDS; round++) {
      const issues = this.monotonyDetection.detectMonotonyIssues(drafts);
      const mergedBad = Array.from(new Set([...(issues.badIndices || []), ...forcedIndices])).sort((a, b) => a - b);
      if (!mergedBad.length) break;
      if (aiCallsUsed >= params.maxCalls) break;

      // Regenerate in small batches to reduce truncation.
      for (let start = 0; start < mergedBad.length && aiCallsUsed < params.maxCalls; start += MONOTONY_FIX_BATCH_SIZE) {
        const indices = mergedBad.slice(start, start + MONOTONY_FIX_BATCH_SIZE);
        const prompt = this.buildFixMonotonyPrompt({
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
            model: params.modelOverride,
          });
          const parsed = extractJsonArray<any>(response);
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
          const nextDefinitionOfDone = String(it?.definitionOfDone || '').trim();
          const nextChecklist = Array.isArray(it?.checklist)
            ? (it.checklist as any[])
                .map((s) => String(s || '').trim())
                .filter(Boolean)
            : undefined;

          if (!nextName || !nextDefinitionOfDone || !nextChecklist || nextChecklist.length < 2) continue;

          drafts[idx] = {
            ...current,
            name: nextName,
            description: nextDesc || current.description,
            definitionOfDone: nextDefinitionOfDone,
            checklist: nextChecklist,
            pomodorosPlanned: Math.max(1, Math.min(6, Number(it?.pomodorosPlanned) || current.pomodorosPlanned || fallbackPomodoros)),
            priority: Math.max(1, Math.min(4, Number(it?.priority) || current.priority || Math.max(1, Math.min(4, 5 - params.level)))),
            difficult: Math.max(1, Math.min(4, Number(it?.difficult) || current.difficult || 2)),
          };
        }

        aiCallsUsed++;
      }

      // Keep titles clean after regeneration.
      drafts = drafts.map((d) => ({
        ...d,
        name: this.sanitizeTitle(d?.name),
      }));
    }

    return { drafts, aiCallsUsed };
  }

  /**
   * Build prompt for fixing monotony issues
   */
  private buildFixMonotonyPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    chunkMinutes: number[];
    drafts: MicroTaskDraft[];
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
      .map((d, idx) => ({ idx, verb: extractVerb(d?.name) }))
      .filter((x) => !keepIndices.has(x.idx) && x.verb && x.verb !== 'unknown')
      .map((x) => x.verb);
    const avoidVerbs = Array.from(new Set(keepVerbs)).slice(0, 20);

    const keepTemplates = params.drafts
      .map((d, idx) => ({ idx, tpl: templateTitle(d?.name) }))
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
5) O mais importante é retornar "checklist" (2-5 passos) + "definitionOfDone".
6) "description" é opcional e, se existir, deve ser breve (1-2 linhas) e NÃO duplicar checklist/DoD.
7) Mantenha a duração alvo (targetMinutes) e respeite 1-6 pomodoros.
${strictnessHint}

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown), com EXATAMENTE ${params.indices.length} itens.
Cada item deve ter:
- "chunkIndex": number (0-based)
- "name": string
- "checklist": string[] (2-5 itens, sem numeração)
- "definitionOfDone": string (1-2 frases)
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)

Opcional:
- "description": string (breve)

Use hoje como ${today}.`;
  }
}
