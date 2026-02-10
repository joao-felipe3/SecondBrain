import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { normalizeWorkflowTypes } from '../utils/normalizers.util';

/**
 * Service for building AI prompts for WBS and micro-task generation
 */
@Injectable()
export class PromptBuilderService {
  /**
   * Build prompt for generating WBS from SMART objective
   */
  buildGenerateWBSPrompt(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    summary?: string;
  }): string {
    return `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

Baseado no objetivo SMART abaixo, gere uma WBS hierárquica CONCISA para o projeto.

Objetivo SMART:
- Específico: ${smartObjective.specific}
- Mensurável: ${smartObjective.measurable}
- Atingível: ${smartObjective.achievable}
- Relevante: ${smartObjective.relevant}
- Temporal: ${smartObjective.temporal}
${smartObjective.summary ? `- Resumo: ${smartObjective.summary}` : ''}

REGRAS IMPORTANTES:
1. A WBS deve ter MÁXIMO 3 níveis de profundidade
2. Inclua APENAS 3-4 entregas principais (nível 1)
3. Cada entrega deve ter 2-4 pacotes de trabalho (nível 2)
4. Evite nível 3 sempre que possível
5. Cada pacote de trabalho (nó folha) deve ter entre 8 e 80 horas estimadas (regra 8/80)
6. Nós intermediários: estimatedHours = soma dos filhos
7. Use nomes claros e descritivos mas CURTOS
8. Descrições BREVES (máximo 1 linha)

Retorne APENAS um array JSON válido e completo, sem texto adicional:
[
  {
    "name": "Nome da Entrega Principal",
    "description": "Descrição breve",
    "level": 1,
    "estimatedHours": 120,
    "order": 1,
    "children": [
      {
        "name": "Pacote de Trabalho",
        "description": "Descrição",
        "level": 2,
        "estimatedHours": 40,
        "order": 1,
        "children": []
      }
    ]
  }
]`;
  }

  /**
   * Build prompt for suggesting WBS node decomposition (8/80 rule violation)
   */
  buildDecompositionPrompt(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): string {
    return `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${node.estimatedHours > 80
  ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
  : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[
  {
    "name": "Nome do sub-pacote",
    "description": "Descrição",
    "estimatedHours": 20,
    "level": 3,
    "order": 1,
    "children": []
  }
]`;
  }

  /**
   * Build simple prompt for generating micro-tasks from WBS leaf node
   * (Single-shot generation without planning phase)
   */
  buildMicroTasksPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    const minutesList = params.chunkMinutes.map((m, i) => `${i + 1}: ${m}min`).join(', ');

    return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de uma WBS.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha, regra 8/80):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

Preciso que você gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas, uma para cada parte com duração alvo:
${minutesList}

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
Retorne APENAS um array JSON válido (sem markdown). Cada item deve ter APENAS as propriedades abaixo.

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

  /**
   * Build planner prompt (two-phase generation: plan first, then generate)
   */
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

  /**
   * Build generator prompt (two-phase generation: use plan to generate tasks)
   */
  buildMicroTasksGeneratorPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
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
