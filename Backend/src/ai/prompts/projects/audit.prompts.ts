/**
 * Pure prompt builder functions for the WBS Audit domain.
 * Extracted from `src/projects/services/wbs/core/audit.service.ts`.
 * No NestJS decorators, no side effects — only string construction.
 */

export function buildAuditPrompt(params: {
  projectName: string;
  leafNodeName: string;
  nodePath: string;
  budgetHours: number;
  generatedHours: number;
  diffPct: number;
  taskCount: number;
  duplicateRatio: number;
  topDuplicateKeys: string;
  dupScore: number;
  similarScore: number;
  tasksPreview: string;
}): string {
  if (params.diffPct < 0) return buildUnderGeneratedAuditPrompt(params);
  return (
    `Você é um auditor de escopo e estimativas (WBS/PERT/EVM).\n\n` +
    `Contexto do projeto: ${params.projectName}\n` +
    `Pacote (WBS leaf): "${params.leafNodeName}"\n` +
    `Caminho: ${params.nodePath}\n` +
    `Estimativa top-down do pacote: ${params.budgetHours.toFixed(1)}h\n` +
    `Estimativa bottom-up (micro-tarefas): ${params.generatedHours.toFixed(1)}h\n` +
    `Diferença: ${params.diffPct.toFixed(0)}%\n\n` +
    `Sinais automáticos (anti-gold-plating):\n` +
    `- totalTasks: ${params.taskCount}\n` +
    `- duplicateRatio(aprox): ${(params.duplicateRatio * 100).toFixed(0)}%\n` +
    `- dupScore: ${params.dupScore.toFixed(2)}\n` +
    `- similarScore: ${params.similarScore.toFixed(2)}\n` +
    `${params.topDuplicateKeys ? `- topRepeated: ${params.topDuplicateKeys}\n` : ''}` +
    `\n` +
    `Micro-tarefas (amostra):\n${params.tasksPreview || '(sem tarefas)'}\n\n` +
    `Tarefa: classifique a discrepância como UMA destas opções:\n` +
    `- underestimated = o pacote foi subestimado (tarefas são majoritariamente distintas/necessárias)\n` +
    `- gold_plating = há escopo desnecessário OU repetição excessiva (tarefas redundantes, opcionalidade clara, ou expansão de escopo fora do pacote)\n` +
    `- mixed = há evidência forte de ambos (use SOMENTE quando realmente houver sinais fortes dos dois lados)\n\n` +
    `Regras para evitar "sempre mixed" e para reduzir falso-positivo de gold_plating:\n` +
    `- Se duplicateRatio >= 40% OU dupScore >= 0.40, trate como forte sinal de redundância e prefira gold_plating ou mixed com suggestedAction=simplify.\n` +
    `- Se duplicateRatio < 25% E dupScore < 0.25 E similarScore < 0.35, prefira underestimated. Só use mixed se você identificar escopo opcional/fora do pacote.\n` +
    `- Com redundância baixa (regras acima), NÃO use gold_plating apenas por "granularidade"; micro-tarefas detalhadas são esperadas neste sistema.\n` +
    `- Se diffPct >= 120% e houver repetição alta, suggestedAction deve ser simplify (não rebaseline).\n\n` +
    `Importante: tarefas podem parecer "parecidas" (ex: prática/análise), mas se tiverem themeTag/contextTag diferentes, considere que podem cobrir CONTEÚDO diferente e NÃO são redundância automaticamente.\n\n` +
    `Então sugira UMA ação: \n` +
    `- "rebaseline" = atualizar a estimativa do pacote para refletir o detalhamento real, ou\n` +
    `- "simplify" = simplificar o escopo para caber na estimativa original (cortar opcional, reduzir qualidade, etc).\n\n` +
    `Retorne APENAS JSON válido no formato (pode incluir campos extras opcionais):\n` +
    `{\n` +
    `  "diagnosis": "underestimated" | "gold_plating" | "mixed",\n` +
    `  "rationale": "...",\n` +
    `  "suggestedAction": "rebaseline" | "simplify",\n` +
    `  "suggestedEstimatedHours": 32,\n` +
    `  "simplifyNotes": ["...", "..."]\n` +
    `}`
  );
}

/** Discrepância negativa: as micro-tarefas somam MENOS horas que a estimativa do pacote. */
function buildUnderGeneratedAuditPrompt(params: Parameters<typeof buildAuditPrompt>[0]): string {
  return (
    `Você é um auditor de escopo e estimativas (WBS/PERT/EVM).\n\n` +
    `Contexto do projeto: ${params.projectName}\n` +
    `Pacote (WBS leaf): "${params.leafNodeName}"\n` +
    `Caminho: ${params.nodePath}\n` +
    `Estimativa top-down do pacote: ${params.budgetHours.toFixed(1)}h\n` +
    `Estimativa bottom-up (micro-tarefas): ${params.generatedHours.toFixed(1)}h\n` +
    `Diferença: ${params.diffPct.toFixed(0)}% (as micro-tarefas cobrem MENOS horas que o pacote)\n\n` +
    `Sinais automáticos:\n` +
    `- totalTasks: ${params.taskCount}\n` +
    `- duplicateRatio(aprox): ${(params.duplicateRatio * 100).toFixed(0)}%\n` +
    `- dupScore: ${params.dupScore.toFixed(2)}\n` +
    `- similarScore: ${params.similarScore.toFixed(2)}\n` +
    `${params.topDuplicateKeys ? `- topRepeated: ${params.topDuplicateKeys}\n` : ''}` +
    `\n` +
    `Micro-tarefas (amostra):\n${params.tasksPreview || '(sem tarefas)'}\n\n` +
    `Tarefa: classifique a discrepância como UMA destas opções:\n` +
    `- overestimated = o pacote foi superestimado: as micro-tarefas já cobrem todo o escopo do pacote e a estimativa top-down está alta demais\n` +
    `- incomplete = o detalhamento está incompleto: o escopo do pacote exige mais trabalho do que as micro-tarefas cobrem (faltam etapas, temas ou entregas)\n\n` +
    `Regras:\n` +
    `- Se o nome do pacote sugere escopo que não aparece nas micro-tarefas, ou há poucos temas/tipos de tarefa, prefira incomplete.\n` +
    `- Se as tarefas cobrem o escopo de forma variada e completa, prefira overestimated.\n` +
    `- Com incomplete, a ação é "regenerate" (o sistema remove as tarefas repetidas e gera só as que faltam, sem refazer as boas). Com overestimated, a ação é "rebaseline" e suggestedEstimatedHours deve ficar próximo das horas bottom-up.\n\n` +
    `Retorne APENAS JSON válido no formato:\n` +
    `{\n` +
    `  "diagnosis": "overestimated" | "incomplete",\n` +
    `  "rationale": "...",\n` +
    `  "suggestedAction": "rebaseline" | "regenerate",\n` +
    `  "suggestedEstimatedHours": 40\n` +
    `}`
  );
}
