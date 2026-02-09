import { Injectable } from '@nestjs/common';

/**
 * Service for validating and sanitizing task titles
 * Detects generic patterns, bad quality, forbidden patterns, etc
 */
@Injectable()
export class TitleValidationService {
  /**
   * Strip dedupe suffix from title (e.g. "Task — part2" -> "Task")
   */
  stripDedupeSuffix(name?: string): string {
    const t = String(name || '').trim();
    if (!t) return '';
    return t.split(' — ')[0].trim();
  }

  /**
   * Get base title (stripped and sanitized)
   */
  baseTitle(name?: string): string {
    return this.sanitizeTitle(this.stripDedupeSuffix(name));
  }

  /**
   * Sanitize title removing forbidden patterns
   * - Removes fraction markers like "1/4"
   * - Fixes degenerate ranges like "(50-50)" -> "(50)"
   * - Cleans dangling separators
   */
  sanitizeTitle(name?: string): string {
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

  /**
   * Check if title is a generic template
   * (e.g., "entregável", "mini-simulado", "bloco de questões")
   */
  isGenericTemplateTitle(title?: string): boolean {
    const t = String(title || '').trim().toLowerCase();
    if (!t) return false;
    if (/\bentreg[aá]vel\b/.test(t)) return true;
    if (/\bmini\s*-?\s*simulad[oa]\b/.test(t)) return true;
    if (/\bbloco de quest[oõ]es\b/.test(t)) return true;
    // Old-style one-item-per-type fallback artifacts (low variety)
    if (/^\w+\s+(sessão de prática|treino dirigido|aplicação controlada|exercício guiado)\s*[—-]/i.test(t)) return true;
    return false;
  }

  /**
   * Check if title is generic "N palavras" without concrete artifact
   */
  isGenericWordsCountTitle(title?: string): boolean {
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

  /**
   * Check if title has bad quality patterns
   * - Empty parentheses "()"
   * - Suspicious tiny ranges like "(50-51)"
   */
  isBadTitleQuality(title?: string): boolean {
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

  /**
   * Check if title has forbidden patterns like fractions
   */
  hasForbiddenTitlePattern(title?: string): boolean {
    const t = String(title || '').trim();
    if (!t) return false;
    // Avoid "Parte 1/4", "1/4", etc. (but allow "Parte 2" in general).
    if (/\b\d+\s*\/\s*\d+\b/.test(t)) return true;
    // Avoid generic placeholders leaking into saved tasks.
    if (/\bmicro[-\s]?tarefa\b/i.test(t)) return true;
    // Avoid generic placeholder template "entregável".
    if (/\bentreg[aá]vel\b/i.test(t)) return true;
    // Avoid "N palavras" without concrete artifact.
    if (this.isGenericWordsCountTitle(t)) return true;
    // Avoid old single-template fallback names.
    if (/\bbloco de quest[oõ]es\b/i.test(t)) return true;
    return false;
  }
}
