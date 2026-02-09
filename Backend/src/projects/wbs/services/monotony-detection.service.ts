import { Injectable } from '@nestjs/common';
import { TitleValidationService } from './title-validation.service';
import { normalizeTitle, templateTitle } from '../utils/normalizers.util';

/**
 * Service for detecting monotony, duplicates, and quality issues in task batches
 */
@Injectable()
export class MonotonyDetectionService {
  constructor(private readonly titleValidation: TitleValidationService) {}

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

    const baseTitles = drafts.map((d) => this.titleValidation.baseTitle(d?.name));
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

    baseTitles.forEach((t, idx) => {
      if (this.titleValidation.isBadTitleQuality(t)) forced.add(idx);
      if (this.titleValidation.isGenericTemplateTitle(t)) forced.add(idx);
      if (this.titleValidation.isGenericWordsCountTitle(t)) forced.add(idx);
    });

    return {
      forcedIndices: Array.from(forced.values()).sort((a, b) => a - b),
      duplicatesCount: Math.max(0, normalizedTitles.length - new Set(normalizedTitles).size),
      templatesCount: Math.max(0, templateTitles.length - new Set(templateTitles).size),
      badTitleCount: baseTitles.filter(
        (t) =>
          this.titleValidation.isBadTitleQuality(t) ||
          this.titleValidation.isGenericTemplateTitle(t) ||
          this.titleValidation.isGenericWordsCountTitle(t),
      ).length,
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
    const indices: number[] = [];
    let deliverable = 0;
    let words = 0;
    let minis = 0;

    drafts.forEach((d, idx) => {
      const title = this.titleValidation.baseTitle(d?.name);
      const t = title.toLowerCase();
      const isDeliverable = /\bentreg[aá]vel\b/.test(t);
      const isMini = /\bmini\s*-?\s*simulad[oa]\b/.test(t);
      const isWords = this.titleValidation.isGenericWordsCountTitle(title);

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

  /**
   * Detect monotony issues (duplicates, templates, forbidden patterns)
   * Returns indices that need fixing
   */
  detectMonotonyIssues(drafts: Array<{ name?: string }>): {
    badIndices: number[];
    hasForbiddenPatterns: boolean;
  } {
    const bad = new Set<number>();
    const hasForbiddenPatterns = drafts.some((d) => this.titleValidation.hasForbiddenTitlePattern(d?.name));

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

    drafts.forEach((d, idx) => {
      if (this.titleValidation.hasForbiddenTitlePattern(d?.name)) bad.add(idx);
    });

    return {
      badIndices: Array.from(bad.values()).sort((a, b) => a - b),
      hasForbiddenPatterns,
    };
  }
}
