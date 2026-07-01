/**
 * Pure prompt builder functions for the RTM (Requirements Traceability Matrix) domain.
 * Extracted from `src/tasks/services/traceability/utils/rtm-ai.utils.ts`.
 * No NestJS decorators, no side effects — only string construction.
 */

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
