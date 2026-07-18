/**
 * Pure prompt builder functions for WBS domain.
 * No NestJS decorators, no side effects — only string construction.
 */

export function buildWbsGenerationPrompt(smartObjective: {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  temporal: string;
  weeklyHours?: number;
  budgetHours?: number;
  weeksAvailable?: number;
  summary?: string;
}): string {
  const hasBudgetContext =
    Number.isFinite(Number(smartObjective.budgetHours)) && Number(smartObjective.budgetHours) > 0;
  const weeklyHours = Number(smartObjective.weeklyHours);
  const weeksAvailable = Number(smartObjective.weeksAvailable);

  return `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

Baseado no objetivo SMART abaixo, gere uma WBS hierárquica CONCISA para o projeto.

Objetivo SMART:
- Específico: ${smartObjective.specific}
- Mensurável: ${smartObjective.measurable}
- Atingível: ${smartObjective.achievable}
- Relevante: ${smartObjective.relevant}
- Temporal: ${smartObjective.temporal}
${Number.isFinite(weeklyHours) && weeklyHours > 0 ? `- Capacidade semanal: ${weeklyHours}h/semana` : ''}
${hasBudgetContext ? `- Budget global alvo da WBS: ${Number(smartObjective.budgetHours).toFixed(1)}h` : ''}
${Number.isFinite(weeksAvailable) && weeksAvailable > 0 ? `- Janela temporal estimada: ${Math.round(weeksAvailable)} semanas` : ''}
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
${hasBudgetContext ? `9. A soma total dos nós folha deve ficar o mais próximo possível de ${Number(smartObjective.budgetHours).toFixed(1)}h sem ultrapassar significativamente o budget` : ''}

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
        "children": [
          {
            "name": "Sub-pacote",
            "description": "Descrição",
            "level": 3,
            "estimatedHours": 20,
            "order": 1,
            "children": []
          }
        ]
      }
    ]
  }
]`;
}

export function buildWbsDecompositionPrompt(node: {
  name: string;
  description?: string;
  estimatedHours: number;
}): string {
  return `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${
  node.estimatedHours > 80
    ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
    : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[{
  "name": "Nome do sub-pacote",
  "description": "Descrição",
  "estimatedHours": 20,
  "level": 3,
  "order": 1,
  "children": []
}]`;
}
