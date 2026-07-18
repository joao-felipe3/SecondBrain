/**
 * Pure prompt builder functions for the Risk Assessment domain.
 * No NestJS decorators, no side effects — only string construction.
 */

export function buildRiskAssessmentPrompt(projectDescription: string): string {
  return `Você é um especialista em gerenciamento de projetos. 
Analise a descrição do projeto e identifique os principais riscos.

Descrição do Projeto:
${projectDescription}

Retorne um JSON com um array de riscos. Cada risco deve ter:
- description (string): descrição clara do risco
- probability (number): probabilidade de 0-100 (%)
- impact (number): impacto de 1-5
- severity (string): 'baixa', 'média' ou 'alta' (baseado em probability * impact / 5)
- mitigationPlan (string): plano inicial de mitigação

Exemplo de resposta:
{
  "risks": [
    {
      "description": "Falta de recursos técnicos especializados",
      "probability": 40,
      "impact": 4,
      "severity": "média",
      "mitigationPlan": "Contratar consultoria externa ou treinar equipe com antecedência"
    }
  ]
}

Retorne APENAS o JSON, sem markdown ou formatação extra.`;
}
