import { Logger } from '@nestjs/common';

export function sanitizeJSON(jsonString: string): string {
  try {
    let result = jsonString.trim();
    const chars: string[] = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < result.length; i++) {
      const char = result[i];

      if (escapeNext) {
        chars.push(char);
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        chars.push(char);
        escapeNext = true;
        continue;
      }

      if (char === '"' && (i === 0 || result[i - 1] !== '\\')) {
        inString = !inString;
        chars.push(char);
        continue;
      }

      if (inString && (char === '\n' || char === '\r')) {
        chars.push(' ');
        continue;
      }

      chars.push(char);
    }

    result = chars.join('');
    result = result.replace(/,\s*}/g, '}');
    result = result.replace(/,\s*]/g, ']');

    result = result.replace(/"([^"]*?)(['"])([^"]*?)"/g, (match, _prefix, quote) => {
      if (quote === "'") {
        return match;
      }
      return match;
    });

    return result;
  } catch {
    return jsonString;
  }
}

export function extractAndValidateJSON<T extends Record<string, any>>(
  responseText: string,
  requiredFields: string[],
  logger?: Logger,
): T | null {
  try {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^[\s\n]*```/gm, '')
      .replace(/```[\s\n]*$/gm, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      logger?.warn(`[JSON_EXTRACT] Nenhum JSON encontrado na resposta`);
      return null;
    }

    let jsonString = cleaned.substring(jsonStart, jsonEnd + 1);

    if (!jsonString.endsWith('}')) {
      logger?.warn(
        `[JSON_INCOMPLETE] JSON não termina com "}" - truncado?\nEnd: ...${jsonString.substring(Math.max(0, jsonString.length - 100))}`,
      );
      return null;
    }

    jsonString = sanitizeJSON(jsonString);

    const parsedObj = JSON.parse(jsonString) as Record<string, unknown>;

    for (const field of requiredFields) {
      if (!(field in parsedObj)) {
        logger?.warn(`[JSON_MISSING_FIELD] Campo obrigatório ausente: ${field}`);
        return null;
      }
    }

    return parsedObj as T;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger?.warn(`[JSON_PARSE_ERROR] ${message}\nResponse: ${responseText.substring(0, 400)}`);
    return null;
  }
}
