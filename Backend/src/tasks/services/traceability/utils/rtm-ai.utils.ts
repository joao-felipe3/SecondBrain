import { RequirementType, JourneyKind } from '../../../schemas/requirement.schema';
import { Task } from '../../../entities/task.entity';
import { normalizeKind, normalizeType } from './rtm.utils';

// ===========================================================================
// Types
// ===========================================================================

export type JourneyDraft = {
  ref: string;
  parentRef?: string;
  kind: JourneyKind;
  description: string;
  type?: RequirementType;
};

export type RawMappingEntry = Record<string, unknown>;

// ===========================================================================
// Prompt Builders — re-exported from centralized AI prompts module
// ===========================================================================

export {
  buildGenerateRequirementsPrompt,
  buildAutoMapBatchPrompt,
  buildGenerateTasksPrompt,
} from '../../../../ai/prompts';

// ===========================================================================
// Response Normalizers
// ===========================================================================

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

// Normaliza e deduplica itens brutos retornados pelo Gemini para geração de jornada.
export function normalizeGeneratedItems(parsed: unknown[]): JourneyDraft[] {
  const normalized: JourneyDraft[] = parsed
    .map((item: unknown, index: number) => {
      const anyItem = item as Record<string, unknown>;
      const kind = normalizeKind(anyItem.kind);
      const defaultRefPrefix =
        kind === 'objective' ? 'O' : kind === 'habit' ? 'H' : kind === 'stage' ? 'E' : 'A';
      const refVal = safeStringify(anyItem.ref).trim();
      const ref = refVal || `${defaultRefPrefix}${index + 1}`;
      const parentRef = anyItem.parentRef == null ? undefined : safeStringify(anyItem.parentRef).trim();
      const description = safeStringify(anyItem.description).trim();

      return { ref, parentRef, kind, description, type: normalizeType(anyItem.type, kind) };
    })
    .filter((item) => item.description.length > 0);

  const deduped: JourneyDraft[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    const key = `${item.kind}::${item.description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

// Formata a lista de tarefas de um batch para inserção no prompt.
export function formatTasksForPrompt(batch: Task[]): string {
  return batch.map((t) => `- "${t.name}" (ID: ${t.id})`).join('\n');
}

// Processa a resposta do Gemini para um batch de auto-mapeamento.
// Distribui cada entrada entre `mappings` (reqId → taskIds[]) ou `orphanTasks`.
export function processMappingResponse(
  mappingArray: unknown[],
  batch: Task[],
  mappings: Record<string, string[]>,
  orphanTasks: Task[],
): void {
  for (const mapping of mappingArray) {
    const anyMapping = mapping as RawMappingEntry;
    const taskId = safeStringify(anyMapping.taskId).trim();
    if (!taskId) continue;

    if (safeStringify(anyMapping.requirementId).trim().toUpperCase() === 'ORPHAN') {
      const orphan = batch.find((t) => String(t.id) === taskId);
      if (orphan) orphanTasks.push(orphan);
      continue;
    }

    const reqId = safeStringify(anyMapping.requirementId).trim();
    if (!mappings[reqId]) mappings[reqId] = [];
    mappings[reqId].push(taskId);
  }
}

// Aplica o fallback de mapeamento quando a resposta da IA falha:
export function applyFallbackMapping(
  batch: Task[],
  fallbackActionId: string,
  mappings: Record<string, string[]>,
): void {
  if (!mappings[fallbackActionId]) mappings[fallbackActionId] = [];
  for (const task of batch) {
    mappings[fallbackActionId].push(String(task.id));
  }
}
