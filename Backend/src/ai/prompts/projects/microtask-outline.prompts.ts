import { WBSNodeDto } from '../../../projects/dto/wbs.dto';
import { normalizeWorkflowTypes } from '../../../projects/services/wbs/utils/normalizers.util';
import { WBSLeafProjectContext } from '../../../projects/interfaces/drafts.interface';

export function buildMicroTasksOutlinePrompt(params: {
  project?: WBSLeafProjectContext | null;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  avoidTaskTitles?: string[];
}): string {
  const today = new Date().toISOString().split('T')[0];
  const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

  const minutesList = JSON.stringify(params.chunkMinutes);

  const avoidTitles = (params.avoidTaskTitles || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(-20);
  const avoidTitlesBlock = avoidTitles.length
    ? `\n\nANTI-REPETIÇÃO (títulos já usados; NÃO repita nem gere muito similar):\n${avoidTitles
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}\n`
    : '';

  return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de uma WBS.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha, regra 8/80):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

Gere APENAS O ESQUELETO (título + campos essenciais) de EXATAMENTE ${params.chunkMinutes.length} micro-tarefas.
NÃO gere checklist nem definitionOfDone nesta etapa.

As durações alvo em minutos (na mesma ordem das tarefas) são:
${minutesList}
${avoidTitlesBlock}

REGRAS IMPORTANTES:
1) O "name" deve começar com um VERBO de ação (GTD) e ter um output claro.
2) Proibido "Parte 1/24" ou títulos repetidos.
3) Varie verbo + output + tema.
4) Preencha também microTaskType/themeTag/contextTag/cognitiveMode.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). NÃO inclua texto fora do JSON.
Cada item deve ter APENAS as propriedades abaixo.

Obrigatórias:
- "name": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)
- "microTaskType": string (prepare|practice|produce|review|test|consolidate)
- "themeTag": string
- "contextTag": string
- "cognitiveMode": string (low|medium|high)

Use hoje como ${today}.`;
}

export function buildMicroTasksOutlineWithPlanPrompt(params: {
  project?: WBSLeafProjectContext | null;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  avoidTaskTitles?: string[];
  plan: {
    themes?: Array<{ name: string; criteria?: string }>;
    workflow?: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
  };
}): string {
  const today = new Date().toISOString().split('T')[0];
  const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

  const workflow = normalizeWorkflowTypes(params.plan.workflow || [], params.chunkMinutes.length);
  const minutesList = params.chunkMinutes
    .map((m, i) => `${i + 1}: ${m}min (tipo: ${workflow[i] || 'practice'})`)
    .join(', ');

  const themes = (params.plan.themes || [])
    .map((t, i) => `${i + 1}. ${t.name}${t.criteria ? ` — ${t.criteria}` : ''}`)
    .join('\n');

  const avoidTitles = (params.avoidTaskTitles || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(-20);
  const avoidTitlesBlock = avoidTitles.length
    ? `\n\nANTI-REPETIÇÃO (títulos já usados; NÃO repita nem gere muito similar):\n${avoidTitles
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}\n`
    : '';

  return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de um PLANO.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

PLANO (temas):
${themes || 'Sem temas'}

PLANO (workflow):
${workflow.join(' → ')}

Gere APENAS O ESQUELETO (título + campos essenciais) de EXATAMENTE ${params.chunkMinutes.length} micro-tarefas.
NÃO gere checklist nem definitionOfDone nesta etapa.

Tamanhos alvo (minutos) das micro-tarefas:
${minutesList}
${avoidTitlesBlock}

REGRAS IMPORTANTES:
1) O "name" deve começar com um VERBO de ação (GTD) e ter output verificável.
2) Proibido "Parte 1/24" ou títulos repetidos.
3) Varie verbo + output + tema.
4) "microTaskType" deve respeitar o tipo indicado no workflow.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). NÃO inclua texto fora do JSON.
Cada item deve ter APENAS as propriedades abaixo.

Obrigatórias:
- "name": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)
- "microTaskType": string (prepare|practice|produce|review|test|consolidate)
- "themeTag": string
- "contextTag": string
- "cognitiveMode": string (low|medium|high)

Use hoje como ${today}.`;
}

export function buildMicroTasksPlannerPrompt(params: {
  project?: WBSLeafProjectContext | null;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  themeHints?: string[];
  workflowMix?: Record<string, number>;
}): string {
  const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
  const minutesList = params.chunkMinutes.map((m, i) => `${i + 1}: ${m}min`).join(', ');
  const themeHintsText = params.themeHints?.length ? params.themeHints.join(', ') : 'Sem sugestões';

  const mixHint = params.workflowMix
    ? `

Preferência de mix de tipos (soma 1.0):
${Object.entries(params.workflowMix)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
`
    : '';

  return `Você é um planejador de micro-tarefas. Sua função é CRIAR UM PLANO (temas + workflow) para evitar repetição.

Contexto do projeto: ${projectSummary || 'Sem resumo'}

Pacote WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas: ${params.node.estimatedHours}h

Tamanhos alvo (minutos) das micro-tarefas:
${minutesList}

Sugestões de temas (use se fizer sentido):
${themeHintsText}
${mixHint}

REGRAS IMPORTANTES:
1) Gere de 2 a 6 TEMAS (themes) com um critério claro.
2) Workflow deve ser uma sequência de tipos para ${params.chunkMinutes.length} tarefas.
3) Proibido "Parte 1/24" e repetição de verbo entre temas.
4) Inclua milestones quando fizer sentido (a cada 4–6h de esforço agregado).

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON válido, sem markdown):
{
  "themes": [ { "name": "string", "criteria": "string" } ],
  "workflow": ["prepare","practice","produce"],
  "milestones": [ { "name": "string", "goal": "string", "atMinutes": number } ],
  "constraints": { "avoidRepeatingVerbs": true, "minVerbVariety": 4 }
}
`;
}

export function buildMicroTasksPrompt(params: {
  project?: WBSLeafProjectContext | null;
  node: WBSNodeDto;
  currentPath: string;
  level: number;
  chunkMinutes: number[];
  avoidTaskTitles?: string[];
}): string {
  const today = new Date().toISOString().split('T')[0];
  const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

  const compact = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.WBS_COMPACT_OUTPUT || '')
      .trim()
      .toLowerCase(),
  );

  const minutesList = JSON.stringify(params.chunkMinutes);

  const avoidTitles = (params.avoidTaskTitles || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(-20);
  const avoidTitlesBlock = avoidTitles.length
    ? `\n\nANTI-REPETIÇÃO (títulos já usados; NÃO repita nem gere muito similar):\n${avoidTitles
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}\n`
    : '';

  return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de uma WBS.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha, regra 8/80):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

Preciso que você gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas, uma para cada parte.

As durações alvo em minutos (na mesma ordem das tarefas) são:
${minutesList}
${avoidTitlesBlock}

REGRAS IMPORTANTES (para não ficar genérico):
1) Cada micro-tarefa deve ter um RESULTADO verificável (entregável), não apenas "estudar".
2) O mais importante é retornar:
  - checklist: passos objetivos (2-5 itens)
  - definitionOfDone: como saber que terminou
3) "description" é OPCIONAL e, se existir, deve ser BREVE (1-2 linhas) e NÃO duplicar checklist/DoD.
4) Evite frases vagas como "pesquisar" ou "estudar" sem critério.
5) Use linguagem direta e prática.
6) Prefira micro-tarefas pequenas (1-3 pomodoros). Use 4-6 apenas se a parte exigir.
7) O nome da micro-tarefa deve começar com um VERBO de ação (Próxima Ação GTD).

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). NÃO inclua nenhum texto fora do JSON.
Cada item deve ter APENAS as propriedades abaixo.

${
  compact
    ? `MODO COMPACTO (priorize latência):
- Strings CURTAS. Sem explicações.
- checklist: EXATAMENTE 2 itens curtos (<= 60 caracteres cada).
- definitionOfDone: EXATAMENTE 1 frase curta (<= 80 caracteres).
- NÃO inclua "description".
`
    : ''
}

Obrigatórias:
- "name": string
- "checklist": string[] (2-5 itens, cada item 1 frase, sem numeração)
- "definitionOfDone": string (1-2 frases)
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)
- "microTaskType": string (prepare|practice|produce|review|test|consolidate)
- "themeTag": string
- "contextTag": string (ex.: @computador, @mesa/foco, @celular/offline)
- "cognitiveMode": string (low|medium|high)

Opcional:
- "description": string (breve, 0-2 linhas)

Use hoje como ${today}.`;
}
