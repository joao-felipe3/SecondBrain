import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';

/**
 * Handles WBS generation from SMART objectives using Gemini AI
 */
@Injectable()
export class WbsGenerationService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Generate a WBS from a SMART objective using Gemini
   */
  async generate(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    weeklyHours?: number;
    budgetHours?: number;
    weeksAvailable?: number;
    summary?: string;
  }): Promise<WBSNodeDto[]> {
    const hasBudgetContext =
      Number.isFinite(Number(smartObjective.budgetHours)) && Number(smartObjective.budgetHours) > 0;
    const weeklyHours = Number(smartObjective.weeklyHours);
    const weeksAvailable = Number(smartObjective.weeksAvailable);

    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

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

    try {
      const response = await this.geminiService.generateContent(prompt);
      return this.parseFromResponse(response);
    } catch (error) {
      console.error('Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
    }
  }

  private parseFromResponse(response: string): WBSNodeDto[] {
    try {
      let cleanResponse = response.trim();

      // Remove markdown code blocks
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```(?:json)?\s*/, '')
          .replace(/```\s*$/, '')
          .trim();
      }

      const parsed = JSON.parse(cleanResponse);

      if (!Array.isArray(parsed)) {
        throw new Error('Resposta da IA não é um array JSON válido');
      }

      return this.normalizeNodes(parsed, 1);
    } catch (error) {
      console.error('Erro ao fazer parse da resposta da IA:', error);
      console.error('Resposta recebida:', response);
      throw new Error('Não foi possível interpretar a resposta da IA');
    }
  }

  private normalizeNodes(nodes: any[], level: number): WBSNodeDto[] {
    return nodes.map((node, index) => ({
      name: String(node.name || 'Sem nome'),
      description: String(node.description || ''),
      level: level,
      estimatedHours: Number(node.estimatedHours) || 0,
      order: node.order || index + 1,
      children:
        node.children && Array.isArray(node.children)
          ? this.normalizeNodes(node.children, level + 1)
          : [],
    }));
  }
}
