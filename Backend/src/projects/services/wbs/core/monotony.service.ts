import { Injectable } from '@nestjs/common';
import { normalizeTitle, templateTitle } from '../utils/normalizers.util';
import { MAX_MONOTONY_FIX_ROUNDS, MONOTONY_FIX_BATCH_SIZE } from '../constants/wbs.constants';
import { WbsAiService } from '../../../../ai/services/projects/wbs-ai.service';
import { AutoFixMonotonyParams, MicroTaskDraft } from '../../../interfaces';

/**
 * Service for detecting and auto-fixing monotony issues in micro-task batches using AI.
 */
@Injectable()
export class MonotonyService {
  constructor(private readonly wbsAiService: WbsAiService) {}

  /**
   * Detect monotony issues: duplicates and repeated templates
   *
   * Identifies task indices that have:
   * - Normalized titles matching other tasks (exact duplicates)
   * - Templates matching other tasks (similar structure/pattern)
   *
   * Used in the monotony correction loop to determine which tasks need regeneration.
   */
  detectMonotonyIssues(drafts: Array<{ name?: string }>): {
    badIndices: number[];
    hasForbiddenPatterns: boolean;
  } {
    const bad = new Set<number>();

    const normalizedTitles = drafts.map((d) => normalizeTitle(d?.name));
    const templateTitles = drafts.map((d) => templateTitle(d?.name));

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

    return {
      badIndices: Array.from(bad.values()).sort((a, b) => a - b),
      hasForbiddenPatterns: false,
    };
  }

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
  async autoFixMonotonyForLeaf(
    params: AutoFixMonotonyParams,
  ): Promise<{ drafts: MicroTaskDraft[]; aiCallsUsed: number }> {
    let drafts = params.drafts.slice().map((d) => ({
      ...d,
      name: this.sanitizeTitle(d?.name),
    }));
    let aiCallsUsed = 0;

    const forcedIndices = Array.from(
      new Set((params.forceIndices || []).filter((n) => Number.isInteger(n))),
    ).sort((a, b) => a - b);

    for (let round = 0; round < MAX_MONOTONY_FIX_ROUNDS; round++) {
      const issues = this.detectMonotonyIssues(drafts);
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

        let items: any[];
        try {
          items = await this.wbsAiService.fixMonotonyBatch({
            project: params.project,
            node: params.node,
            currentPath: params.currentPath,
            chunkMinutes: params.chunkMinutes,
            drafts,
            indices,
            round,
            modelOverride: params.modelOverride,
          });
        } catch (err: any) {
          console.warn(
            `[WBS-Monotony] AI regeneration failed for round ${round}: ${err?.message || err}`,
          );
          continue;
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
