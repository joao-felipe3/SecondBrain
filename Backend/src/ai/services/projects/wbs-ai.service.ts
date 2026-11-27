import { Injectable } from '@nestjs/common';
import { GeminiExecutorService } from '../core/gemini-executor.service';
import {
  buildWbsGenerationPrompt,
  buildWbsDecompositionPrompt,
  buildAuditPrompt,
  buildFixMonotonyPrompt,
} from '../../prompts';
import {
  extractJsonArray,
  extractJsonObject,
} from '../../../projects/services/wbs/utils/json-parser.util';
import {
  AuditAction,
  AuditDiagnosis,
  AuditLeafDiscrepancyAiInput,
  AuditLeafDiscrepancyAiResult,
  GenerateWbsInput,
  FixMonotonyBatchParams,
} from '../../../projects/interfaces';

@Injectable()
export class WbsAiService {
  constructor(private readonly geminiExecutor: GeminiExecutorService) {}

  // Generate WBS nodes from a SMART objective
  async generateWbs(smartObjective: GenerateWbsInput): Promise<Record<string, unknown>[]> {
    const prompt = buildWbsGenerationPrompt(smartObjective);
    // Modelos sem JSON mode (ex.: Gemma) às vezes respondem com texto em volta do JSON.
    // extractJsonArray isola o array, repara e salva o que for possível; se nada sair,
    // pede uma nova resposta uma vez. Falhas da própria chamada à IA não são repetidas aqui
    // (o GeminiExecutorService já faz os retries de quota e sobrecarga).
    const maxParseAttempts = 2;
    let lastParseError: unknown = null;

    for (let attempt = 1; attempt <= maxParseAttempts; attempt++) {
      const response = await this.geminiExecutor.generateContent(prompt).catch((error: unknown) => {
        console.error('[WbsAiService] Erro ao gerar WBS:', error);
        throw new Error('Não foi possível gerar a WBS com IA');
      });

      try {
        const nodes = extractJsonArray<Record<string, unknown>>(response);
        if (nodes.length === 0) throw new Error('Resposta da IA sem nós de WBS');
        return nodes;
      } catch (error) {
        lastParseError = error;
        console.warn(
          `[WbsAiService] Resposta sem JSON utilizável (tentativa ${attempt}/${maxParseAttempts}).`,
        );
      }
    }

    console.error('[WbsAiService] Erro ao gerar WBS:', lastParseError);
    throw new Error('Não foi possível gerar a WBS com IA');
  }

  // Suggest decomposition for a WBS node violating 8/80
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    const prompt = buildWbsDecompositionPrompt(node);
    try {
      return await this.geminiExecutor.generateContent(prompt);
    } catch (error) {
      console.error('[WbsAiService] Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
  }

  // Audit discrepancy between WBS leaf node estimate and generated micro-tasks
  async auditLeafDiscrepancy(
    params: AuditLeafDiscrepancyAiInput,
  ): Promise<AuditLeafDiscrepancyAiResult> {
    const prompt = buildAuditPrompt(params);
    const attemptCall = async (maxOutputTokens: number, temperature: number): Promise<string> => {
      return this.geminiExecutor.generateContent(prompt, {
        model: params.modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens,
        temperature,
      });
    };

    let response: string;
    try {
      response = await attemptCall(2048, 0.2);
    } catch {
      response = await attemptCall(4096, 0.1);
    }

    const parsed = extractJsonObject<{
      diagnosis?: string;
      suggestedAction?: string;
      rationale?: string;
      suggestedEstimatedHours?: unknown;
    }>(response);

    const diagnosisRaw = String(parsed?.diagnosis || '').trim();
    const knownDiagnoses: AuditDiagnosis[] = ['gold_plating', 'mixed', 'overestimated', 'incomplete'];
    const diagnosis: AuditDiagnosis = knownDiagnoses.find((d) => d === diagnosisRaw) ?? 'underestimated';

    const suggestedActionRaw = String(parsed?.suggestedAction || '').trim();
    const suggestedAction: AuditAction =
      suggestedActionRaw === 'simplify' || suggestedActionRaw === 'regenerate'
        ? suggestedActionRaw
        : 'rebaseline';

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

  // Regenerate a batch of drafts to resolve monotony issues
  async fixMonotonyBatch(params: FixMonotonyBatchParams): Promise<Record<string, unknown>[]> {
    const prompt = buildFixMonotonyPrompt(params);
    const isJsonishError = (err: unknown) => {
      const msg = String(
        err && typeof err === 'object' && 'message' in err ? err.message : err,
      ).toLowerCase();
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
      const response = await this.geminiExecutor.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
        model: params.modelOverride,
      });
      const parsed = extractJsonArray<Record<string, unknown>>(response);
      if (!Array.isArray(parsed) || parsed.length !== params.indices.length) {
        throw new Error(
          `IA retornou ${Array.isArray(parsed) ? parsed.length : 0} itens; esperado ${params.indices.length}`,
        );
      }
      return parsed;
    };

    try {
      return await attempt({ maxOutputTokens: 1400, temperature: 0.65 });
    } catch (err: unknown) {
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
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    const match = raw.match(/\d+(?:[.,]\d+)?/);
    if (!match) return undefined;
    const normalized = match[0].replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
}
