/**
 * Utilities for parsing and cleaning JSON responses from AI
 */

/**
 * Extract and parse a JSON array from AI response (handles markdown, truncation, etc)
 */
export function extractJsonArray<T = any>(response: string): T[] {
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
    // Normalize "smart quotes" that break JSON parsing.
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

/**
 * Extract and parse a JSON object from AI response (handles markdown, truncation, etc)
 */
export function extractJsonObject<T = any>(response: string): T {
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
