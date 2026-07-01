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
