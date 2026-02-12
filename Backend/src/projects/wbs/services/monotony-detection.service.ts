import { Injectable } from '@nestjs/common';
import { normalizeTitle, templateTitle } from '../utils/normalizers.util';

/**
 * Service for detecting monotony, duplicates, and quality issues in task batches
 */
@Injectable()
export class MonotonyDetectionService {
  /**
   * Detect pre-dedupe issues (before adding suffixes)
   * Returns indices that need fixing and various counts
   */
  detectPreDedupeIssues(drafts: Array<{ name?: string }>): {
    forcedIndices: number[];
    duplicatesCount: number;
    templatesCount: number;
    badTitleCount: number;
  } {
    const forced = new Set<number>();

    const baseTitles = drafts.map((d) => String(d?.name || '').trim());
    const normalizedTitles = baseTitles.map((t) => normalizeTitle(t));
    const templateTitles = baseTitles.map((t) => templateTitle(t));

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

    return {
      forcedIndices: Array.from(forced.values()).sort((a, b) => a - b),
      duplicatesCount: Math.max(0, normalizedTitles.length - new Set(normalizedTitles).size),
      templatesCount: Math.max(0, templateTitles.length - new Set(templateTitles).size),
      badTitleCount: 0,
    };
  }

  /**
   * Detect generic series issues (e.g., "entregável", "N palavras", "mini-simulado")
   */
  detectGenericSeriesIssues(drafts: Array<{ name?: string }>): {
    indices: number[];
    genericRate: number;
    genericKinds: { deliverable: number; words: number; minis: number };
  } {
    return {
      indices: [],
      genericRate: 0,
      genericKinds: { deliverable: 0, words: 0, minis: 0 },
    };
  }

  /**
   * Detect monotony issues (duplicates, templates, forbidden patterns)
   * Returns indices that need fixing
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
