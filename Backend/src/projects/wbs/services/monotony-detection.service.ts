import { Injectable } from '@nestjs/common';
import { normalizeTitle, templateTitle } from '../utils/normalizers.util';


@Injectable()
export class MonotonyDetectionService {
  /**
   * Detect monotony issues: duplicates and repeated templates
   *
   * Identifies task indices that have:
   * - Normalized titles matching other tasks (exact duplicates)
   * - Templates matching other tasks (similar structure/pattern)
   *
   * Used in the monotony correction loop to determine which tasks need regeneration.
   *
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
}
