/**
 * Pure prompt builder functions for the Planning/Catchball domain.
 * No NestJS decorators, no side effects — only string construction.
 */

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

  return `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Um usuário tem um projeto com as seguintes informações:

Nome do Projeto: "${projectData.projectName}"
Descrição: "${projectData.projectDescription}"
${goalsContext.length > 0 ? `\nObjetivos existentes:\n${goalsContext.join('\n')}` : ''}

Sua tarefa é fazer perguntas estratégicas para refinar esse objetivo em um objetivo SMART, usando a técnica Catchball (Hoshin Kanri).
Faça 4-5 perguntas que ajudem a esclarecer:
1. Público-alvo e usuários específicos
2. Escopo e funcionalidades principais
3. Restrições de tempo e recursos
4. Integrações e dependências técnicas
5. Critérios de sucesso mensuráveis

Retorne APENAS um array JSON com as perguntas, sem texto adicional:
["pergunta 1", "pergunta 2", "pergunta 3", "pergunta 4", "pergunta 5"]`;
}

export function buildSuggestAnswerPrompt(params: {
  questionIndex: number;
  question: string;
  projectContext: string;
  previousAnswers: string[];
}): string {
  const previousContext =
    params.previousAnswers.length > 0
      ? `\n\nRespostas anteriores:\n${params.previousAnswers.map((ans, i) => `Pergunta ${i + 1}: ${ans}`).join('\n')}`
      : '';

  return `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Contexto do projeto:
${params.projectContext}${previousContext}

Pergunta atual (${params.questionIndex + 1}):
"${params.question}"

Com base nas informações do projeto e nas respostas anteriores (se houver), sugira uma resposta objetiva e concreta para esta pergunta. A resposta deve ser prática e específica para este projeto.

Retorne APENAS a resposta sugerida, sem explicações adicionais ou formatação JSON.`;
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
