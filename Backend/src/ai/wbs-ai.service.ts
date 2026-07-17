import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import {
  buildWbsGenerationPrompt,
  buildWbsDecompositionPrompt,
  buildAuditPrompt,
  buildFixMonotonyPrompt,
} from './prompts';
import { WBSNodeDto } from '../projects/dto/wbs.dto';
import { extractJsonArray, extractJsonObject } from '../projects/services/wbs/utils/json-parser.util';
import { MicroTaskDraft } from '../projects/interfaces/drafts.interface';
import { AuditLeafDiscrepancyAiInput, AuditLeafDiscrepancyAiResult, GenerateWbsInput } from '../projects/interfaces';

@Injectable()
export class WbsAiService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Generate WBS nodes from a SMART objective
   */
  async generateWbs(smartObjective: GenerateWbsInput): Promise<any[]> {
    const prompt = buildWbsGenerationPrompt(smartObjective);
    try {
      const response = await this.geminiService.generateContent(prompt);
      let cleanResponse = response.trim();

      // Remove markdown JSON code blocks
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
      return parsed;
    } catch (error) {
      console.error('[WbsAiService] Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
    }
  }

  /**
   * Suggest decomposition for a WBS node violating 8/80
   */
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    const prompt = buildWbsDecompositionPrompt(node);
    try {
      return await this.geminiService.generateContent(prompt);
    } catch (error) {
      console.error('[WbsAiService] Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
  }

  /**
   * Audit discrepancy between WBS leaf node estimate and generated micro-tasks
   */
  async auditLeafDiscrepancy(params: AuditLeafDiscrepancyAiInput): Promise<AuditLeafDiscrepancyAiResult> {
    const prompt = buildAuditPrompt(params);
    const attemptCall = async (maxOutputTokens: number, temperature: number): Promise<string> => {
      return this.geminiService.generateContent(prompt, {
        model: params.modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens,
        temperature,
      });
    };

    let response: string;
    try {
      response = await attemptCall(2048, 0.2);
    } catch (err: any) {
      response = await attemptCall(4096, 0.1);
    }

    const parsed = extractJsonObject<any>(response);
    const diagnosisRaw = String(parsed?.diagnosis || '').trim();
    const diagnosis: 'underestimated' | 'gold_plating' | 'mixed' =
      diagnosisRaw === 'gold_plating'
        ? 'gold_plating'
        : diagnosisRaw === 'mixed'
          ? 'mixed'
          : 'underestimated';

    const suggestedActionRaw = String(parsed?.suggestedAction || '').trim();
    const suggestedAction: 'rebaseline' | 'simplify' =
      suggestedActionRaw === 'simplify' ? 'simplify' : 'rebaseline';

    const rationale = String(parsed?.rationale || '').trim() || 'Sem justificativa.';
    let suggestedEstimatedHours: number | undefined;

    if (parsed?.suggestedEstimatedHours !== undefined && parsed?.suggestedEstimatedHours !== null) {
      const parsedHours = this.parseHoursValue(parsed.suggestedEstimatedHours);
      if (parsedHours !== undefined) {
        suggestedEstimatedHours = Math.round(parsedHours * 2) / 2;
      }
    }

    return { diagnosis, rationale, suggestedAction, suggestedEstimatedHours };
  }

  /**
   * Regenerate a batch of drafts to resolve monotony issues
   */
  async fixMonotonyBatch(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    chunkMinutes: number[];
    drafts: MicroTaskDraft[];
    indices: number[];
    round: number;
    modelOverride?: string;
  }): Promise<any[]> {
    const prompt = buildFixMonotonyPrompt(params);
    const isJsonishError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return (
        msg.includes('json') ||
        msg.includes('truncad') ||
        msg.includes('incomplet') ||
        msg.includes('parse') ||
        msg.includes('array') ||
        msg.includes('object')
      );
    };

    const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
        model: params.modelOverride,
      });
      const parsed = extractJsonArray<any>(response);
      if (!Array.isArray(parsed) || parsed.length !== params.indices.length) {
        throw new Error(
          `IA retornou ${Array.isArray(parsed) ? parsed.length : 0} itens; esperado ${params.indices.length}`,
        );
      }
      return parsed;
    };

    try {
      return await attempt({ maxOutputTokens: 1400, temperature: 0.65 });
    } catch (err: any) {
      if (isJsonishError(err)) {
        return await attempt({ maxOutputTokens: 2200, temperature: 0.35 });
      } else {
        throw err;
      }
    }
  }

  private parseHoursValue(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    const raw = String(value).trim();
    if (!raw) return undefined;
    const match = raw.match(/\d+(?:[\.,]\d+)?/);
    if (!match) return undefined;
    const normalized = match[0].replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
}
