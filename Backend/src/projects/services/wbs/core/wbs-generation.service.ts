import { Injectable } from '@nestjs/common';
import { WbsAiService } from '../../../../ai/services/projects/wbs-ai.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { GenerateWbsInput } from '../../../interfaces';

// Handles WBS generation from SMART objectives using Gemini AI
@Injectable()
export class WbsGenerationService {
  constructor(private readonly wbsAiService: WbsAiService) {}

  // Generate a WBS from a SMART objective using Gemini
  async generate(smartObjective: GenerateWbsInput): Promise<WBSNodeDto[]> {
    try {
      const parsed = await this.wbsAiService.generateWbs(smartObjective);
      return this.normalizeNodes(parsed, 1);
    } catch (error) {
      console.error('Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
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
