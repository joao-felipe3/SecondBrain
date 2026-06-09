import { RequirementType, JourneyKind } from '../../../schemas/requirement.schema';
import { TaskDocument } from '../../../schemas/task.schema';
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
// Prompt Builders
// ===========================================================================

export function buildGenerateRequirementsPrompt(
  smartObjective: Record<string, string | undefined>,
): string {
  return `Você é um planejador de desenvolvimento pessoal.
 
Objetivo:
Gerar uma estrutura rastreável no formato objetivo -> hábito -> etapa -> ação.
 
Regras:
- Foque em projetos pessoais (aprendizado, rotina, hábitos, produtividade).
- Gere uma árvore prática e rastreável.
- Retorne entre 10 e 24 itens no total.
- Cada item deve ter:
\t- ref: identificador curto único (ex: O1, H1, E1, A1)
\t- parentRef: referência do pai (null apenas para objective)
\t- kind: objective | habit | stage | action
\t- description: descrição clara, específica e mensurável
- Ações devem ser executáveis (o que fazer de fato).
- Sem markdown.
 
Smart Objective:
- O: ${smartObjective.objective || ''}
- Específico: ${smartObjective.specific || ''}
- Mensurável: ${smartObjective.measurable || ''}
- Alcançável: ${smartObjective.achievable || ''}
- Relevante: ${smartObjective.relevant || ''}
- Temporal: ${smartObjective.temporal || ''}
 
Retorne SOMENTE um JSON array:
[
\t{ "ref": "O1", "parentRef": null, "kind": "objective", "description": "..." },
\t{ "ref": "H1", "parentRef": "O1", "kind": "habit", "description": "..." },
\t{ "ref": "E1", "parentRef": "H1", "kind": "stage", "description": "..." },
\t{ "ref": "A1", "parentRef": "E1", "kind": "action", "description": "..." }
]`;
}

export function buildAutoMapBatchPrompt(tasksDesc: string, actionsDesc: string): string {
  return `Você é um analista de rastreabilidade para desenvolvimento pessoal.
 
Vincule cada tarefa à ação da jornada mais aderente.
- Prefira vincular a ações existentes.
- Use "ORPHAN" somente quando nenhuma ação fizer sentido.
 
ACOES DISPONIVEIS:
${actionsDesc}
 
TAREFAS:
${tasksDesc}
 
Retorne JSON array:
[
\t{ "taskId": "...", "requirementId": "...", "confidence": 0.7 }
]
 
Sem markdown.`;
}

export function buildGenerateTasksPrompt(actionDescription: string): string {
  return `Você é um especialista em planejamento pessoal.
 
Ação da jornada:
"${actionDescription}"
 
Gere 1-2 tarefas práticas e executáveis para cumprir essa ação.
Retorne JSON array:
[
\t{ "title": "...", "description": "..." }
]
Sem markdown.`;
}

// ===========================================================================
// Response Normalizers
// ===========================================================================

/**
 * Normaliza e deduplica itens brutos retornados pelo Gemini para geração de jornada.
 */
export function normalizeGeneratedItems(parsed: unknown[]): JourneyDraft[] {
  const normalized: JourneyDraft[] = parsed
    .map((item: unknown, index: number) => {
      const anyItem = item as Record<string, unknown>;
      const kind = normalizeKind(anyItem.kind);
      const defaultRefPrefix =
        kind === 'objective' ? 'O' : kind === 'habit' ? 'H' : kind === 'stage' ? 'E' : 'A';
      const ref = String(anyItem.ref ?? `${defaultRefPrefix}${index + 1}`).trim();
      const parentRef = anyItem.parentRef == null ? undefined : String(anyItem.parentRef).trim();
      const description = String(anyItem.description ?? '').trim();

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

/**
 * Formata a lista de tarefas de um batch para inserção no prompt.
 */
export function formatTasksForPrompt(batch: TaskDocument[]): string {
  return batch.map((t) => `- "${t.name}" (ID: ${t._id || t.id})`).join('\n');
}

/**
 * Processa a resposta do Gemini para um batch de auto-mapeamento.
 * Distribui cada entrada entre `mappings` (reqId → taskIds[]) ou `orphanTasks`.
 */
export function processMappingResponse(
  mappingArray: unknown[],
  batch: TaskDocument[],
  mappings: Record<string, string[]>,
  orphanTasks: TaskDocument[],
): void {
  for (const mapping of mappingArray) {
    const anyMapping = mapping as RawMappingEntry;
    const taskId = String(anyMapping.taskId || '');
    if (!taskId) continue;

    if (String(anyMapping.requirementId || '').toUpperCase() === 'ORPHAN') {
      const orphan = batch.find((t) => String(t._id || t.id) === taskId);
      if (orphan) orphanTasks.push(orphan);
      continue;
    }

    const reqId = String(anyMapping.requirementId);
    if (!mappings[reqId]) mappings[reqId] = [];
    mappings[reqId].push(taskId);
  }
}

/**
 * Aplica o fallback de mapeamento quando a resposta da IA falha:
 * todas as tarefas do batch vão para a primeira ação disponível.
 */
export function applyFallbackMapping(
  batch: TaskDocument[],
  fallbackActionId: string,
  mappings: Record<string, string[]>,
): void {
  if (!mappings[fallbackActionId]) mappings[fallbackActionId] = [];
  for (const task of batch) {
    mappings[fallbackActionId].push(String(task._id || task.id));
  }
}
