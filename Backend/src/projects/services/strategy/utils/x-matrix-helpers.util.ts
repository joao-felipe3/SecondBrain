import { XMatrixStrength } from '../../../dto/x-matrix.dto';

export function splitGoalText(input: string | undefined): string[] {
  const text = String(input || '').trim();
  if (!text) return [];

  const parts = text
    .split(/\n|;|\||•|\u2022|\.|,/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [text];
  return parts;
}

export function tokenize(text: string): Set<string> {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

  const stopwords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'a',
    'o',
    'as',
    'os',
    'um',
    'uma',
    'para',
    'com',
    'por',
    'no',
    'na',
    'nos',
    'nas',
    'em',
    'the',
    'and',
    'to',
    'of',
    'for',
    'in',
    'on',
    'at',
    'is',
    'are',
    'be',
    'ser',
    'estar',
    'que',
  ]);

  const tokens = normalized
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token));

  return new Set(tokens);
}

export function scoreStrength(
  fromText: string,
  toText: string,
): { strength: XMatrixStrength; score: number; rationale: string } {
  const fromTokens = tokenize(fromText);
  const toTokens = tokenize(toText);

  if (fromTokens.size === 0 || toTokens.size === 0) {
    return {
      strength: 'none',
      score: 0,
      rationale: 'Sem termos suficientes para correlacionar.',
    };
  }

  let intersection = 0;
  for (const token of fromTokens) {
    if (toTokens.has(token)) intersection += 1;
  }

  const minSize = Math.max(1, Math.min(fromTokens.size, toTokens.size));
  const score = Number((intersection / minSize).toFixed(2));

  if (score >= 0.5) {
    return {
      strength: 'strong',
      score,
      rationale: `Alta convergencia de termos (${intersection}).`,
    };
  }

  if (score >= 0.25) {
    return {
      strength: 'medium',
      score,
      rationale: `Convergencia moderada de termos (${intersection}).`,
    };
  }

  if (score > 0) {
    return {
      strength: 'weak',
      score,
      rationale: `Convergencia fraca de termos (${intersection}).`,
    };
  }

  return {
    strength: 'none',
    score: 0,
    rationale: 'Nao ha intersecao clara de termos.',
  };
}

export function inferInitiativeFromWbsPath(path: string | undefined, levels: Set<number>): string | null {
  const raw = String(path || '').trim();
  if (!raw) return null;

  const segments = raw
    .split(/\s*(?:>|\/|\||::|->|›|»)\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;

  const maxLevel = Math.max(...Array.from(levels.values()), 1);
  const selected = segments.slice(0, Math.min(maxLevel, segments.length));
  return selected.join(' > ');
}
