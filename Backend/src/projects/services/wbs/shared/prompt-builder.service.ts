import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { normalizeWorkflowTypes } from '../utils/normalizers.util';

/**
 * Service for building AI prompts for WBS and micro-task generation
 */
@Injectable()
export class PromptBuilderService {
  buildMicroTasksOutlinePrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    avoidTaskTitles?: string[];
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    // Short payload, preserves order.
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

  buildMicroTasksOutlineWithPlanPrompt(params: {
    project: any;
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

  buildMicroTaskDetailsPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    targetMinutes: number;
    outline: {
      name: string;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      pomodorosPlanned?: number;
    };
    plan?: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
    };
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
    const themes = (params.plan?.themes || [])
      .map((t, i) => `${i + 1}. ${t.name}${t.criteria ? ` — ${t.criteria}` : ''}`)
      .join('\n');

    return `Você é um especialista em micro-tarefas de execução. Você já recebeu o TÍTULO e metadados; agora gere apenas os detalhes.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"

${themes ? `PLANO (temas):\n${themes}\n\n` : ''}Tarefa (não altere o título):
- name: "${String(params.outline.name || '').trim()}"
- targetMinutes: ${params.targetMinutes}min
- microTaskType: ${String(params.outline.microTaskType || '')}
- themeTag: ${String(params.outline.themeTag || '')}
- contextTag: ${String(params.outline.contextTag || '')}
- cognitiveMode: ${String(params.outline.cognitiveMode || '')}

REGRAS IMPORTANTES:
1) Gere checklist com 2 a 5 itens, objetivos, cada item 1 frase, sem numeração.
2) definitionOfDone: 1 a 2 frases, verificável.
3) description é OPCIONAL e deve ser breve (1 linha) e NÃO duplicar checklist/DoD.
4) Não mude o nome, nem invente campos extras.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um JSON object válido (sem markdown), com APENAS estas propriedades:
{
  "checklist": string[],
  "definitionOfDone": string,
  "description"?: string
}

Use hoje como ${today}.`;
  }

  buildMicroTaskDetailsBatchPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    items: Array<{
      targetMinutes: number;
      outline: {
        name: string;
        microTaskType?: string;
        themeTag?: string;
        contextTag?: string;
        cognitiveMode?: string;
        pomodorosPlanned?: number;
      };
    }>;
    plan?: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
    };
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
    const themes = (params.plan?.themes || [])
      .map((t, i) => `${i + 1}. ${t.name}${t.criteria ? ` — ${t.criteria}` : ''}`)
      .join('\n');

    const tasksBlock = params.items
      .map((it, i) => {
        const o = it.outline || ({} as any);
        return [
          `${i + 1}) name: "${String(o.name || '').trim()}"`,
          `   targetMinutes: ${it.targetMinutes}min`,
          `   microTaskType: ${String(o.microTaskType || '')}`,
          `   themeTag: ${String(o.themeTag || '')}`,
          `   contextTag: ${String(o.contextTag || '')}`,
          `   cognitiveMode: ${String(o.cognitiveMode || '')}`,
        ].join('\n');
      })
      .join('\n\n');

    return `Você é um especialista em micro-tarefas de execução. Você já recebeu o TÍTULO e metadados; agora gere apenas os detalhes.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"

${themes ? `PLANO (temas):\n${themes}\n\n` : ''}TAREFAS (NÃO altere nenhum título):
${tasksBlock}

Gere os detalhes de EXATAMENTE ${params.items.length} tarefas, na MESMA ORDEM.

REGRAS IMPORTANTES (para cada item):
1) checklist com 2 a 5 itens, objetivos, cada item 1 frase, sem numeração.
2) definitionOfDone: 1 a 2 frases, verificável.
3) description é OPCIONAL e deve ser breve (1 linha) e NÃO duplicar checklist/DoD.
4) Não invente campos extras.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown), com EXATAMENTE ${params.items.length} objetos.
Cada objeto deve ter APENAS estas propriedades:
{
  "checklist": string[],
  "definitionOfDone": string,
  "description"?: string
}

Use hoje como ${today}.`;
  }

  buildMicroTasksPrompt(params: {
    project: any;
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

    // Shorter payload than "1: 50min, 2: 50min..." while still preserving order.
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

  buildMicroTasksPlannerPrompt(params: {
    project: any;
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

  buildMicroTasksGeneratorPrompt(params: {
    project: any;
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

    const compact = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WBS_COMPACT_OUTPUT || '')
        .trim()
        .toLowerCase(),
    );

    const workflow = normalizeWorkflowTypes(params.plan.workflow || [], params.chunkMinutes.length);
    const minutesList = params.chunkMinutes
      .map((m, i) => `${i + 1}: ${m}min (tipo: ${workflow[i] || 'practice'})`)
      .join(', ');

    const themes = (params.plan.themes || [])
      .map((t, i) => `${i + 1}. ${t.name}${t.criteria ? ` — ${t.criteria}` : ''}`)
      .join('\n');

    const milestones = (params.plan.milestones || [])
      .map((m, i) => `${i + 1}. ${m?.name || 'Milestone'} (${m?.atMinutes || '?'}min): ${m?.goal || ''}`)
      .join('\n');

    const verbLibrary = `
prepare: preparar, organizar, coletar, listar, configurar, selecionar
practice: praticar, aplicar, resolver, exercitar, repetir, consolidar
produce: produzir, escrever, criar, implementar, construir, sintetizar
review: revisar, corrigir, comparar, reforçar, relembrar
test: testar, avaliar, simular, verificar, validar
consolidate: resumir, conectar, padronizar, registrar, documentar
`;

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

Milestones:
${milestones || 'Sem milestones'}

Tamanhos alvo (minutos) das micro-tarefas:
${minutesList}

${avoidTitlesBlock}

Biblioteca de verbos (use para variar):${verbLibrary}

REGRAS IMPORTANTES (anti-repetição):
1) Gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas.
2) Cada micro-tarefa deve ter um RESULTADO verificável (entregável).
3) O mais importante é retornar checklist (2-5) + definitionOfDone.
4) "description" é opcional e deve ser breve (1-2 linhas) e não duplicar checklist/DoD.
5) Proibido "Parte 1/24" ou títulos repetidos.
6) Varie verbo + output + tema entre itens.
7) Cada item deve usar um "themeTag" de um dos temas acima.
8) O nome da micro-tarefa deve começar com um VERBO de ação (GTD).

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). Cada item deve ter APENAS as propriedades abaixo.

${
  compact
    ? `MODO COMPACTO (priorize qualidade e evitar truncamento):
- Strings CURTAS. Sem explicações longas.
- checklist: EXATAMENTE 2 itens curtos (<= 60 caracteres cada).
- definitionOfDone: EXATAMENTE 1 frase curta (<= 90 caracteres).
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
}
