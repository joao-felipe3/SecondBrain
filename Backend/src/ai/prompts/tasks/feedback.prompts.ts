/**
 * Pure prompt builder functions for the Task Completion Feedback domain.
 * Extracted from `src/tasks/services/intelligence/feedback.service.ts`.
 * No NestJS decorators, no side effects — only string construction.
 */

export function buildFeedbackPrompt(params: {
  taskName: string;
  taskDescription?: string;
  percent: number;
  checklistLength: number;
  timeSpentMinutes?: number;
}): string {
  return [
    'Você é um receptor de bola (catchball) que fornece feedback curto e acionável quando uma tarefa é concluída.',
    `Tarefa: ${String(params.taskName || '')}`,
    params.taskDescription ? `Descrição: ${String(params.taskDescription)}` : '',
    `Checklist completion: ${params.percent}% (${params.checklistLength} items)`,
    params.timeSpentMinutes ? `Tempo gasto (minutos): ${params.timeSpentMinutes}` : '',
    '',
    'Gere um JSON válido com exatamente essas chaves (strings):',
    '- celebration: uma frase curta parabenizando e reconhecendo o esforço',
    '- validation: resumo objetivo sobre o checklist e se a entrega atende critérios de aceitação (1 frase)',
    '- question: uma pergunta aberta sobre impedimentos ou riscos (1 frase)',
    '- suggestion: uma sugestão PDCA/next step (1 frase)',
    'Responda APENAS com o JSON, sem texto adicional, sem markdown.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildNextStepsPrompt(params: {
  taskName: string;
  feedback: string | Record<string, unknown>;
}): string {
  return [
    'Baseado no feedback abaixo, gere 3 próximos passos acionáveis e curtos (título + descrição).',
    `Tarefa: ${String(params.taskName || '')}`,
    params.feedback
      ? `Feedback: ${typeof params.feedback === 'string' ? params.feedback : JSON.stringify(params.feedback)}`
      : '',
    '',
    'Retorne APENAS um array JSON de objetos com chaves: title (string), description (string).',
    'Exemplo: [{"title":"Revisar checklist","description":"Corrigir item X e atualizar definição de pronto"}]',
  ]
    .filter(Boolean)
    .join('\n');
}
