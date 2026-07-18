/**
 * Pure prompt builder functions for Rolling Wave planning domain.
 * No NestJS decorators, no side effects — only string construction.
 */

export function buildPlanWaveStructurePrompt(params: {
  projectName: string;
  todayIso: string;
  deadlineIso: string;
  availableDays: number;
  taskCount: number;
  totalTaskHours: number;
  dailyCapacityHours: number;
}): string {
  return `Você é especialista em Rolling Waves. Determine número ideal de ondas.

PROJETO: ${params.projectName}
Data: ${params.todayIso} até ${params.deadlineIso}
Dias: ${params.availableDays} | Tarefas: ${params.taskCount} | Trabalho: ${params.totalTaskHours.toFixed(1)}h | Capacidade: ${params.dailyCapacityHours}h/dia

Recomende ondas que cubram EXATAMENTE ${params.availableDays} dias (cada onda: 14-45 dias, total: 3-15 ondas).

RETORNE APENAS JSON (SEM MARKDOWN, STRINGS EM UMA LINHA):
{"recommendedWaveCount":NUMERO,"totalDurationDays":${params.availableDays},"description":"Descrição breve em uma linha","reasoning":"Explicação em uma linha sem quebras"}`;
}

export function buildPlanWaveGroupingPrompt(params: {
  projectName: string;
  totalAvailableDays: number;
  waveCount: number;
  totalTasks: number;
  tasksPerWave: number;
  minTasksPerWave: number;
  maxTasksPerWave: number;
  waveDurations: number[];
  wbsWithExamples: Array<{ wbs: string; count: number; examples: string[] }>;
}): string {
  return `
Você é um especialista em Rolling Waves. Aloque pacotes WBS às ondas com alocação equilibrada.

PROJETO: ${params.projectName}
Período: ${params.totalAvailableDays} dias, ${params.waveCount} ondas, ${params.totalTasks} tarefas
Meta por onda: ${params.tasksPerWave} tarefas (${params.minTasksPerWave}-${params.maxTasksPerWave} aceitável)
Duracões exatas por onda: ${params.waveDurations.join(', ')} dias

PACOTES WBS:
${JSON.stringify(params.wbsWithExamples, null, 2)}

REGRAS CRÍTICAS:
0. RETORNE EXATAMENTE ${params.waveCount} ondas, numeradas de 1 até ${params.waveCount}
1. CADA WBS ALOCADO A EXATAMENTE UMA ONDA (sem duplicação)
2. NENHUMA QUANTIDADE 0 (se aloca WBS, quantidade maior que 0)
3. SOMA TOTAL = ${params.totalTasks} tarefas
4. CADA ONDA: ${params.minTasksPerWave}-${params.maxTasksPerWave} tarefas
5. JSON VÁLIDO, SEM MARKDOWN, SEM TRUNCAÇÃO

ESTRUTURA JSON OBRIGATÓRIA:
{
  "waves": [
    {
      "waveNumber": 1,
      "name": "Nome da Onda",
      "description": "Descrição clara do que será feito nesta onda, resumindo os principais WBS blocos alocados",
      "durationDays": DURACAO_EXATA_DA_ONDA,
      "focus": "Foco principal desta onda",
      "wbsAllocation": {
        "WBS_NAME": NUMERO,
        "WBS_NAME2": NUMERO
      }
    }
  ],
  "rationale": "Soma total tarefas = ${params.totalTasks}"
}

REQUISITOS CRÍTICOS:
- Use NÚMEROS para quantidades (não strings entre aspas)
- SEM ASPAS no início/fim de strings (use aspas simples se necessário)
- DESCRIPTION obrigatória: resumir em 1-2 linhas os principais WBS blocos (ex: "Vocabulário HSK N2 parte 1, Gramática básica e Compreensão auditiva")
- As ${params.waveCount} ondas devem existir mesmo que algumas tenham poucos WBS; nunca retorne menos de ${params.waveCount} ondas
- Use estas durações exatamente nesta ordem: ${params.waveDurations.join(', ')}
- Sem caracteres especiais em descriptions (acentos OK)
- JSON deve ser válido: JSON.parse() sem erros
- Sem markdown, sem truncação, JSON completo
`;
}
