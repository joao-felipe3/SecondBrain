import {
  ChecklistPromptParams,
  ChecklistWithHistoryPromptParams,
  CompletionFeedbackPromptParams,
  NextStepsPromptParams,
  PertEstimatePromptParams,
  TaskSuggestionsPromptParams,
} from '../../interfaces';

export function buildChecklistGenerationPrompt(params: ChecklistPromptParams): string {
  const { taskName, description, microTaskType } = params;
  return [
    'Gere um checklist objetivo para uma micro-tarefa.',
    `Tipo: ${microTaskType || 'generic'}`,
    `Nome: ${taskName}`,
    `Descricao: ${description || ''}`,
    'Retorne APENAS um JSON array de strings com 3 a 8 itens, sem texto adicional.',
  ].join('\n');
}

export function buildChecklistWithHistoryPrompt(params: ChecklistWithHistoryPromptParams): string {
  const { taskName, description, microTaskType, historicalContext } = params;
  return [
    'Gere um checklist objetivo para uma micro-tarefa, baseado no histórico de tarefas similares.',
    `Tipo: ${microTaskType || 'generic'}`,
    `Nome: ${taskName}`,
    `Descricao: ${description || ''}`,
    historicalContext || '',
    'Use o histórico para criar um checklist mais preciso. Retorne APENAS um JSON array de strings com 3 a 8 itens.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPertEstimatePrompt(params: PertEstimatePromptParams): string {
  const { taskType, description, projectContext } = params;
  return [
    'Você é um especialista em estimativas de software usando técnica PERT.',
    `Tarefa: ${description}`,
    `Tipo: ${taskType}`,
    projectContext ? `Contexto: ${projectContext}` : '',
    '',
    'Estime APENAS 3 valores em minutos (inteiros positivos):',
    '- O (Otimista): melhor caso, sem atrasos',
    '- M (Mais Provável): caso normal, alguns atrasos esperados',
    '- P (Pessimista): pior caso, muitos atrasos',
    '',
    'Validação: O <= M <= P (obrigatório)',
    'Retorne APENAS um JSON válido, sem explicações:',
    '{"optimistic": número, "likely": número, "pessimistic": número}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCompletionFeedbackPrompt(params: CompletionFeedbackPromptParams): string {
  const { taskName, taskDescription } = params;
  const normalize = (value?: string | null): string => (value || '').replace(/\s+/g, ' ').trim();

  return [
    'Você é um mentor de produtividade e aprendizado.',
    '',
    'Contexto: uma pessoa acabou de concluir uma tarefa.',
    `Nome da tarefa: ${normalize(taskName)}`,
    taskDescription ? `Descrição: ${normalize(taskDescription)}` : '',
    '',
    'TAREFA:',
    'Gere um feedback curto e útil em Português (Brasil), amigável mas profissional.',
    'Sem emojis. Sem exageros. Não repita o contexto.',
    '',
    'FORMATO OBRIGATÓRIO:',
    'Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON).',
    'O JSON deve conter EXATAMENTE estas chaves (todas strings):',
    '- "praise": reconhecimento do esforço/progresso (1 frase curta)',
    '- "learning": aprendizado/padrão observado (1 frase curta)',
    '- "nextStep": sugestão leve do próximo passo (1 frase curta)',
    '- "finalText": versão final em 2-3 linhas, usando as 3 frases acima',
    '',
    'Regras:',
    '- finalText deve ter quebras de linha (\\n) entre as frases.',
    '- Não inclua listas, bullets, tentativas, rascunhos, checagens, nem as palavras "Role", "Attempt", "Draft".',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildGeminiNextStepsPrompt(params: NextStepsPromptParams): string {
  const { taskName, feedback } = params;
  const feedbackText: string =
    typeof feedback === 'string' ? feedback : String(JSON.stringify(feedback || ''));
  const lines: string[] = [
    'Você é um assistente de produtividade e mentor de execução.',
    'Com base na tarefa recém-concluída e no feedback do usuário, sugira de 2 a 3 ações futuras ou próximas tarefas lógicas.',
    '',
    `Tarefa Concluída: "${taskName}"`,
    `Feedback/Reflexão: "${feedbackText}"`,
    '',
    'FORMATO DE RETORNO:',
    'Responda APENAS com um array JSON válido de objetos.',
    'Sem markdown, sem explicações.',
    '',
    'Estrutura do JSON:',
    '[',
    '  { "title": "Nome da ação sugerida", "description": "Explicação breve de por que fazer isso e como começar" }',
    ']',
  ];
  return lines.join('\n');
}

export function buildTaskSuggestionsPrompt(params: TaskSuggestionsPromptParams): string {
  const {
    projectName,
    shortTermGoal,
    midTermGoal,
    longTermGoal,
    userPrompt,
    existingTaskNames,
    remainingHours,
  } = params;
  let prompt = `Gere sugestões de tarefas para o projeto "${projectName}".\n\n`;

  if (shortTermGoal) prompt += `Objetivo de Curto Prazo: ${shortTermGoal}\n`;
  if (midTermGoal) prompt += `Objetivo de Médio Prazo: ${midTermGoal}\n`;
  if (longTermGoal) prompt += `Objetivo de Longo Prazo: ${longTermGoal}\n`;
  if (userPrompt) prompt += `\nInstruções adicionais: ${userPrompt}\n`;

  if (remainingHours && remainingHours > 0) {
    prompt += `\nObjetivo: gerar tarefas de curto, médio e longo prazo cuja soma (pomodoros * 0.5h) aproxime ${remainingHours.toFixed(1)} horas (tolerância ±1h).\n`;
  }

  if (existingTaskNames && existingTaskNames.length > 0) {
    prompt += `\nIMPORTANTE: As seguintes tarefas já foram geradas. NÃO repita nenhuma delas:\n`;
    existingTaskNames.forEach((name, index) => {
      prompt += `${index + 1}. ${name}\n`;
    });
    prompt += `\nGere tarefas DIFERENTES e complementares às já existentes.\n`;
  }

  prompt += `\nFORMATO DE RESPOSTA OBRIGATÓRIO:\nRetorne APENAS um array JSON válido. NÃO inclua explicações, markdown, ou texto adicional.\nNÃO use aspas especiais ou caracteres unicode em strings - use apenas aspas duplas ASCII normais.\n\nCada objeto do array deve ter EXATAMENTE estas propriedades:\n- "name": string\n- "deadline": string no formato YYYY-MM-DD\n- "pomodoros": number (1-6)\n- "priority": number (1-4)\n- "difficulty": number (1-4)\n- "selected": boolean\n\nRetorne de 3 a 5 tarefas relevantes. Responda APENAS com o array JSON, nada mais.`;

  return prompt;
}
