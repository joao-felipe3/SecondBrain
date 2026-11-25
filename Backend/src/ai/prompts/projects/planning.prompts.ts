/**
 * Pure prompt builder functions for the Planning/Catchball domain.
 * No NestJS decorators, no side effects — only string construction.
 */

/** Dimensões do SMART cobertas pelas perguntas, na ordem em que são feitas. */
export const CATCHBALL_DIMENSIONS = [
  'Específico: o que exatamente será entregue ou alcançado',
  'Mensurável: como medir o progresso e o sucesso (números, indicadores, marcos)',
  'Atingível: recursos, conhecimento e restrições atuais que afetam a viabilidade',
  'Relevante: por que isso importa e qual resultado ou benefício se espera',
  'Temporal: prazo final e marcos intermediários',
  'Capacidade: quantas horas por semana é possível dedicar',
] as const;

export function buildCatchballQuestionsPrompt(projectData: {
  projectName: string;
  projectDescription: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
}): string {
  const goalsContext: string[] = [];
  if (projectData.shortTermGoal) goalsContext.push(`Curto prazo: ${projectData.shortTermGoal}`);
  if (projectData.midTermGoal) goalsContext.push(`Médio prazo: ${projectData.midTermGoal}`);
  if (projectData.longTermGoal) goalsContext.push(`Longo prazo: ${projectData.longTermGoal}`);

  const dimensions = CATCHBALL_DIMENSIONS.map((dimension, i) => `${i + 1}. ${dimension}`).join('\n');

  return `Você é um consultor de planejamento especializado em metas SMART e na técnica Catchball (Hoshin Kanri).

Informações do projeto:
Nome: "${projectData.projectName}"
Descrição: "${projectData.projectDescription}"
${goalsContext.length > 0 ? `Objetivos já definidos:\n${goalsContext.join('\n')}` : 'Objetivos já definidos: nenhum'}

Sua tarefa é criar perguntas para refinar este projeto em um objetivo SMART. Faça UMA pergunta para cada dimensão abaixo, nesta ordem:
${dimensions}

Regras:
- Adapte o conteúdo e o vocabulário ao TIPO de projeto (software, estudo, saúde, finanças, trabalho, vida pessoal etc.). Não use jargão de software (stakeholders, integrações, funcionalidades) se o projeto não for desse tipo.
- Cada pergunta deve se referir a elementos concretos deste projeto (nome, descrição ou objetivos) sempre que fizer sentido.
- Não pergunte o que a descrição ou os objetivos já respondem; aprofunde o que ainda falta saber.
- Cada pergunta deve poder ser respondida em 1 a 3 frases, em português do Brasil, em tom direto.

Retorne APENAS um array JSON com as ${CATCHBALL_DIMENSIONS.length} perguntas, sem texto adicional:
["pergunta 1", "pergunta 2", "pergunta 3", "pergunta 4", "pergunta 5", "pergunta 6"]`;
}

export function buildSuggestAnswerPrompt(params: {
  questionIndex: number;
  question: string;
  projectContext: string;
  previousAnswers: string[];
}): string {
  const previousContext =
    params.previousAnswers.length > 0
      ? `\n\nRespostas anteriores do usuário:\n${params.previousAnswers.map((ans, i) => `Pergunta ${i + 1}: ${ans}`).join('\n')}`
      : '';

  return `Você é um consultor de planejamento especializado em metas SMART.

Contexto do projeto:
${params.projectContext || '(sem contexto adicional)'}${previousContext}

Pergunta atual (${params.questionIndex + 1}):
"${params.question}"

Escreva uma resposta SUGERIDA para esta pergunta, como se fosse o próprio usuário respondendo (primeira pessoa), com base no contexto e nas respostas anteriores.
Regras:
- Seja concreto e específico para este projeto, em 1 a 3 frases, em português do Brasil.
- Se faltar informação, proponha uma suposição razoável e realista; o usuário vai revisar e editar.
- Mantenha coerência com as respostas anteriores.

Retorne APENAS o texto da resposta sugerida, sem aspas, sem explicações, sem formatação JSON ou Markdown.`;
}

export function buildSmartObjectivePrompt(params: {
  projectContext: string;
  answers: string[];
}): string {
  return `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Contexto do projeto:
${params.projectContext}

Respostas do usuário às perguntas estratégicas:
${params.answers.map((answer, i) => `${i + 1}. ${answer}`).join('\n')}

Agora, crie um objetivo SMART (Specific, Measurable, Achievable, Relevant, Temporal) para este projeto.
IMPORTANTE: inclua explicitamente a capacidade semanal de execução em horas (weeklyHours), baseada nas respostas do usuário.

Retorne APENAS um objeto JSON no seguinte formato, sem texto adicional:
{
  "specific": "Descrição clara e específica do que será feito",
  "measurable": "Métricas quantificáveis (ex: 500 produtos, 100k visitantes/mês)",
  "achievable": "Análise de viabilidade com recursos disponíveis",
  "relevant": "Por que este projeto é importante para o negócio",
  "temporal": "Prazo específico com data de conclusão",
  "weeklyHours": 12,
  "summary": "Resumo executivo em 1-2 frases",
  "risks": ["risco 1", "risco 2", "risco 3"]
}`;
}
