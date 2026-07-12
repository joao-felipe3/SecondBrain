import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../../ai/gemini.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { MonotonyDetectionService } from './monotony-detection.service';
import { extractJsonArray } from '../utils/json-parser.util';
import { normalizeTitle } from '../utils/normalizers.util';
import { MAX_MONOTONY_FIX_ROUNDS, MONOTONY_FIX_BATCH_SIZE } from '../constants/wbs.constants';
import { buildFixMonotonyPrompt } from '../../../../ai/prompts/monotony.prompts';
import { MicroTaskDraft } from '../../../interfaces';

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
    t = t
      .replace(/\s*-\s*$/g, '')
      .replace(/\s*—\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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

    const forcedIndices = Array.from(
      new Set((params.forceIndices || []).filter((n) => Number.isInteger(n))),
    ).sort((a, b) => a - b);

    for (let round = 0; round < MAX_MONOTONY_FIX_ROUNDS; round++) {
      const issues = this.monotonyDetection.detectMonotonyIssues(drafts);
      const mergedBad = Array.from(new Set([...(issues.badIndices || []), ...forcedIndices])).sort(
        (a, b) => a - b,
      );
      if (!mergedBad.length) break;
      if (aiCallsUsed >= params.maxCalls) break;

      // Regenerate in small batches to reduce truncation.
      for (
        let start = 0;
        start < mergedBad.length && aiCallsUsed < params.maxCalls;
        start += MONOTONY_FIX_BATCH_SIZE
      ) {
        const indices = mergedBad.slice(start, start + MONOTONY_FIX_BATCH_SIZE);
        const prompt = buildFixMonotonyPrompt({
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
            throw new Error(
              `IA retornou ${Array.isArray(parsed) ? parsed.length : 0} itens; esperado ${indices.length}`,
            );
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
            ? (it.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
            : undefined;

          if (!nextName || !nextDefinitionOfDone || !nextChecklist || nextChecklist.length < 2) continue;

          drafts[idx] = {
            ...current,
            name: nextName,
            description: nextDesc || current.description,
            definitionOfDone: nextDefinitionOfDone,
            checklist: nextChecklist,
            pomodorosPlanned: Math.max(
              1,
              Math.min(6, Number(it?.pomodorosPlanned) || current.pomodorosPlanned || fallbackPomodoros),
            ),
            priority: Math.max(
              1,
              Math.min(
                4,
                Number(it?.priority) || current.priority || Math.max(1, Math.min(4, 5 - params.level)),
              ),
            ),
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
}
