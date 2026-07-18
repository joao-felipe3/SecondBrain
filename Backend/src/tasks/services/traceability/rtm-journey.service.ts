import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../ai/services/core/gemini.service';
import { RequirementType, JourneyKind } from '../../schemas/requirement.schema';
import { parseJsonArray } from './utils/rtm.utils';
import { buildGenerateRequirementsPrompt, normalizeGeneratedItems } from './utils/rtm-ai.utils';

@Injectable()
export class RTMJourneyService {
  private readonly logger = new Logger(RTMJourneyService.name);

  constructor(private readonly geminiService: GeminiService) {}

  // Envia um Smart Objective ao Gemini e retorna a estrutura de jornada
  // (objetivo → hábito → etapa → ação) com 10–24 itens.
  async generateRequirements(smartObjective: Record<string, string | undefined>): Promise<
    Array<{
      description: string;
      type: RequirementType;
      kind?: JourneyKind;
      ref?: string;
      parentRef?: string;
    }>
  > {
    this.logger.log('Gerando itens de jornada para Smart Objective...');

    if (!smartObjective) {
      this.logger.warn('Smart Objective vazio, retornando array vazio');
      return [];
    }

    try {
      const prompt = buildGenerateRequirementsPrompt(smartObjective);
      const response = await this._callGemini(prompt);
      return this._parseAndNormalize(response);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao gerar itens de jornada: ${err.message}`);
      return [];
    }
  }

  // ===========================================================================
  // Métodos Auxiliares
  // ===========================================================================

  private async _callGemini(prompt: string): Promise<string> {
    return this.geminiService.generateContent(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 3072,
    });
  }

  private _parseAndNormalize(response: string): Array<{
    description: string;
    type: RequirementType;
    kind?: JourneyKind;
    ref?: string;
    parentRef?: string;
  }> {
    const parsed = parseJsonArray(response);
    if (!parsed) {
      this.logger.warn('Resposta da IA não contém um JSON array válido');
      return [];
    }

    const deduped = normalizeGeneratedItems(parsed);

    this.logger.log(`${deduped.length} itens de jornada extraídos com sucesso`);
    return deduped.map((item) => ({
      description: item.description,
      type: item.type || item.kind,
      kind: item.kind,
      ref: item.ref,
      parentRef: item.parentRef,
    }));
  }
}
