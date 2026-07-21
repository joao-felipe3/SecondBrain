/**
 * Utilities for parsing and cleaning JSON responses from AI (Gemma-compatible)
 */

/** Strip markdown fences and isolate JSON content. */
function cleanMarkdown(response: string): string {
  let s = response.trim();
  // Remove markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return s.trim();
}

/**
 * Aggressive JSON repair for Gemma/open-source models that produce almost-valid JSON.
 * Handles: trailing commas, unquoted/single-quoted keys, escaped newlines, smart quotes,
 * control chars, duplicate commas, and other common LLM JSON quirks.
 */
export function repairJsonString(raw: string): string {
  let s = raw;

  // Normalize smart/curly quotes
  s = s.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
  s = s.replace(/[\u2018\u2019\u2032]/g, "'");

  // Remove control characters except \t \n \r
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');

  // Normalize literal escaped newline sequences in string values: \n → \\n etc.
  // (Gemma sometimes outputs real newlines inside JSON strings)
  // We'll handle this by replacing newlines inside string values only — risky to do globally,
  // so just replace raw \r\n inside strings with space.
  s = s.replace(/([^\\])(\r?\n)(\s*[^"[{])/g, (_, pre, _nl, post: string) => pre + ' ' + post);

  // Remove trailing commas before ] or }
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Remove duplicate commas
  s = s.replace(/,\s*,/g, ',');

  // Fix unquoted or single-quoted property names:  { key: ... } → { "key": ... }
  s = s.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
  s = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  // Fix single-quoted string values (naive — doesn't handle escaped quotes inside)
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');

  // Remove any trailing comma before end of string
  s = s.replace(/,\s*$/, '');

  return s;
}

/**
 * Try to salvage an incomplete/malformed JSON array by extracting complete objects.
 * Returns an empty array if nothing can be salvaged.
 */
function extractPartialArray(raw: string): Record<string, unknown>[] {
  // Find array start
  const arrStart = raw.indexOf('[');
  if (arrStart === -1) return [];

  const content = raw.slice(arrStart + 1);
  const objects: Record<string, unknown>[] = [];

  // Split on object boundaries: },{ or },\n{
  const parts = content.split(/\}\s*,\s*\{/);

  for (let i = 0; i < parts.length; i++) {
    let chunk = parts[i].trim();
    // Re-add braces stripped by split
    if (i > 0) chunk = '{' + chunk;
    if (i < parts.length - 1) chunk = chunk + '}';
    // Last part: strip trailing ] and garbage
    if (i === parts.length - 1) {
      chunk = chunk.replace(/\][^}]*$/, '').trim();
      if (!chunk.endsWith('}')) chunk = chunk + '}';
    }
    chunk = chunk.trim();
    if (!chunk.startsWith('{')) chunk = '{' + chunk;
    try {
      const parsed: unknown = JSON.parse(repairJsonString(chunk));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Salvage failed for this chunk — skip it
    }
  }

  return objects;
}

/**
 * Extract and parse a JSON array from AI response.
 * Handles: markdown fences, truncation, malformed JSON, partial arrays.
 */
export function extractJsonArray<T = unknown>(response: string): T[] {
  if (!response || typeof response !== 'string') {
    throw new Error('Resposta da IA vazia');
  }

  let cleaned = cleanMarkdown(response);

  // Isolate array if present anywhere in the response
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) cleaned = arrMatch[0];

  // --- Attempt 1: direct parse ---
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    /* fall through */
  }

  // --- Attempt 2: repair then parse ---
  const repaired = repairJsonString(cleaned);
  try {
    const parsed: unknown = JSON.parse(repaired);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    /* fall through */
  }

  // --- Attempt 3: partial salvage (array was truncated mid-object) ---
  const salvaged = extractPartialArray(repaired || cleaned);
  if (salvaged.length > 0) {
    console.warn(
      `[json-parser] extractJsonArray: parsing failed; salvaged ${salvaged.length} object(s) from partial response.`,
    );
    return salvaged as unknown as T[];
  }

  // Nothing worked — throw with useful context
  const preview = cleaned.slice(0, 120).replace(/\s+/g, ' ');
  throw new Error(`Não foi possível extrair array JSON da resposta da IA. Preview: ${preview}`);
}

/**
 * Try to salvage a truncated JSON object.
 *
 * Strategy: walk the string character-by-character, tracking string/brace depth.
 * The last top-level comma marks the boundary between the last COMPLETE field and
 * the partial one. We truncate there and close with `}`.
 * Handles multi-line values and quotes inside strings (Gemma's verbose rationales).
 */
function salvageIncompleteObject(raw: string): Record<string, unknown> | null {
  const objStart = raw.indexOf('{');
  if (objStart === -1) return null;

  const s = raw.slice(objStart);

  // Scan char-by-char to find last top-level comma (depth === 1, outside string)
  let depth = 0;
  let inString = false;
  let lastTopLevelComma = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '\\' && inString) {
      i++; // skip escaped character
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 1) {
      lastTopLevelComma = i;
    }
  }

  // Build candidate closing: truncate at last known-complete field
  let candidate: string;
  if (lastTopLevelComma > 0) {
    // Keep everything up to (but not including) the last top-level comma,
    // then close the object.
    candidate = s.slice(0, lastTopLevelComma) + '}';
  } else {
    // No comma found — the very first (and only) value is truncated.
    // Append closing quote + brace as last resort.
    candidate = s + '"}';
  }

  try {
    const parsed: unknown = JSON.parse(repairJsonString(candidate));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract and parse a JSON object from AI response.
 * Handles: markdown fences, truncation, malformed JSON.
 */
export function extractJsonObject<T = unknown>(response: string): T {
  if (!response || typeof response !== 'string') {
    throw new Error('Resposta da IA vazia');
  }

  let cleaned = cleanMarkdown(response);

  // Isolate object if present (greedy — finds outermost {})
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) cleaned = objMatch[0];

  // --- Attempt 1: direct parse ---
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as T;
  } catch {
    /* fall through */
  }

  // --- Attempt 2: repair then parse ---
  const repaired = repairJsonString(cleaned);
  try {
    const parsed: unknown = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as T;
  } catch {
    /* fall through */
  }

  // --- Attempt 3: salvage truncated object (AI cut off mid-string) ---
  const salvaged = salvageIncompleteObject(repaired || cleaned);
  if (salvaged) {
    console.warn('[json-parser] extractJsonObject: salvaged truncated object from partial AI response.');
    return salvaged as unknown as T;
  }

  const preview = cleaned.slice(0, 120).replace(/\s+/g, ' ');
  throw new Error(`Não foi possível extrair objeto JSON da resposta da IA. Preview: ${preview}`);
}
