import { JourneyKind, RequirementType, Requirement } from '../../../schemas/requirement.schema';

function safeStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'string') {
    return val;
  }
  if (
    typeof val === 'number' ||
    typeof val === 'boolean' ||
    typeof val === 'bigint' ||
    typeof val === 'symbol'
  ) {
    return String(val);
  }
  return '';
}

export function normalizeKind(value: unknown): JourneyKind {
  const raw = safeStringify(value).trim().toLowerCase();
  if (raw === 'objective' || raw === 'objetivo') return 'objective';
  if (raw === 'habit' || raw === 'habito' || raw === 'hábito') return 'habit';
  if (raw === 'stage' || raw === 'etapa') return 'stage';
  return 'action';
}

export function normalizeType(value: unknown, fallbackKind?: JourneyKind): RequirementType {
  const raw = safeStringify(value).trim().toLowerCase();
  if (raw === 'functional') return 'functional';
  if (raw === 'non_functional' || raw === 'non-functional' || raw === 'nonfunctional') {
    return 'non_functional';
  }
  if (raw === 'constraint') return 'constraint';
  if (raw === 'objective' || raw === 'objetivo') return 'objective';
  if (raw === 'habit' || raw === 'habito' || raw === 'hábito') return 'habit';
  if (raw === 'stage' || raw === 'etapa') return 'stage';
  if (raw === 'action' || raw === 'acao' || raw === 'ação') return 'action';
  if (fallbackKind) return fallbackKind;
  return 'action';
}

export function levelForKind(kind: JourneyKind): number {
  if (kind === 'objective') return 0;
  if (kind === 'habit') return 1;
  if (kind === 'stage') return 2;
  return 3;
}

export function getLinkedActions(requirement: Partial<Requirement>): string[] {
  const modern = Array.isArray(requirement?.traceableActionItems)
    ? requirement.traceableActionItems.map(String)
    : [];
  if (modern.length > 0) return modern;
  const legacy = Array.isArray(requirement?.traceableItems)
    ? requirement.traceableItems.map(String)
    : [];
  return legacy;
}

export function parseJsonArray(rawResponse: string): unknown[] | null {
  const cleaned = String(rawResponse || '')
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();
  const tryParse = (text: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match?.[0]) {
    return tryParse(match[0]);
  }
  return null;
}
