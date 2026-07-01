import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../../ai/gemini.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { buildWbsGenerationPrompt } from '../../../../ai/prompts/wbs.prompts';

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

    const prompt = buildWbsGenerationPrompt(smartObjective);

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
