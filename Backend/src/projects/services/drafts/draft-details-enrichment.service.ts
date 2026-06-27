import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { PromptBuilderService } from '../wbs';
import { extractJsonArray, extractJsonObject } from '../wbs/utils/json-parser.util';
import {
  validateDraftDetails,
  validateDraftOutlines,
  validateDrafts,
  getNumericEnv,
  logWithTimestamp,
  mapWithConcurrency,
} from './utils/draft-generation-helpers.util';

@Injectable()
export class DraftDetailsEnrichmentService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
  ) { }

  async enrichOutlinesWithDetails(
    outlines: any[],
    sliceMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
  ): Promise<any[]> {
    const detailsConcurrency = getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
    const detailsBatchSize = getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
    const detailsBatchConcurrency =
      detailsBatchSize > 1
        ? getNumericEnv(
          'WBS_DETAILS_BATCH_CONCURRENCY',
          Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
        )
        : detailsConcurrency;

    if (detailsBatchSize > 1) {
      logWithTimestamp(
        `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
      );
    }

    let enriched: any[];
    if (detailsBatchSize <= 1) {
      enriched = await mapWithConcurrency(
        outlines,
        detailsConcurrency,
        async (outline, index) => {
          const details = await this.generateDetailsForBatch([outline], [sliceMinutes[index]], params, detailsModelOverride);
          return { ...outline, ...details[0] };
        },
      );
    } else {
      const batches: Array<{
        start: number;
        outlines: any[];
        minutes: number[];
      }> = [];
      for (let i = 0; i < outlines.length; i += detailsBatchSize) {
        batches.push({
          start: i,
          outlines: outlines.slice(i, i + detailsBatchSize),
          minutes: sliceMinutes.slice(i, i + detailsBatchSize),
        });
      }

      const batchResults = await mapWithConcurrency(
        batches,
        detailsBatchConcurrency,
        async (b) => {
          const detailsList = await this.generateDetailsForBatch(b.outlines, b.minutes, params, detailsModelOverride);
          return { start: b.start, detailsList };
        },
      );

      enriched = new Array(outlines.length);
      for (const r of batchResults) {
        for (let j = 0; j < r.detailsList.length; j++) {
          const idx = r.start + j;
          enriched[idx] = { ...outlines[idx], ...r.detailsList[j] };
        }
      }
    }

    return validateDrafts(enriched);
  }

  private isJsonishError(err: any): boolean {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('json') ||
      msg.includes('truncad') ||
      msg.includes('incomplet') ||
      msg.includes('parse') ||
      msg.includes('array') ||
      msg.includes('object')
    );
  }

  private async generateDetailsForBatch(
    batchOutlines: any[],
    batchMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
    depth = 0,
  ): Promise<
    Array<{
      checklist: string[];
      definitionOfDone: string;
      description?: string;
    }>
  > {
    if (batchOutlines.length !== batchMinutes.length) {
      throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
    }

    const detailsMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);

    if (batchOutlines.length === 1) {
      const detailsPrompt = this.promptBuilder.buildMicroTaskDetailsPrompt({
        ...params,
        targetMinutes: batchMinutes[0],
        outline: batchOutlines[0],
      });

      const attemptDetails = async (opts: { maxOutputTokens: number; temperature: number }) => {
        const response = await this.geminiService.generateContent(detailsPrompt, {
          model: detailsModelOverride,
          responseMimeType: 'application/json',
          maxOutputTokens: opts.maxOutputTokens,
          temperature: opts.temperature,
        });
        const details = extractJsonObject<any>(response);
        return [validateDraftDetails(details)];
      };

      try {
        return await attemptDetails({
          maxOutputTokens: detailsMaxTokens,
          temperature: 0.15,
        });
      } catch (err: any) {
        if (this.isJsonishError(err)) {
          return await attemptDetails({
            maxOutputTokens: detailsRetryMaxTokens,
            temperature: 0.1,
          });
        }
        throw err;
      }
    }

    const detailsBatchMaxTokens = getNumericEnv(
      'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
      Math.min(detailsMaxTokens * batchOutlines.length, 3500),
    );
    const detailsBatchRetryMaxTokens = getNumericEnv(
      'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
      Math.min(detailsRetryMaxTokens * batchOutlines.length, 5000),
    );

    const batchPrompt = this.promptBuilder.buildMicroTaskDetailsBatchPrompt({
      ...params,
      items: batchOutlines.map((outline, i) => ({
        outline,
        targetMinutes: batchMinutes[i],
      })),
    });

    const attemptBatch = async (opts: { maxOutputTokens: number; temperature: number }) => {
      const response = await this.geminiService.generateContent(batchPrompt, {
        model: detailsModelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      const detailsList = extractJsonArray<any>(response);
      if (!Array.isArray(detailsList)) {
        throw new Error('Details batch inválido: não retornou array JSON');
      }
      if (detailsList.length < batchOutlines.length) {
        throw new Error(
          `IA retornou ${detailsList.length} details; esperado ${batchOutlines.length}`,
        );
      }
      return detailsList.slice(0, batchOutlines.length).map((d) => validateDraftDetails(d));
    };

    try {
      return await attemptBatch({
        maxOutputTokens: detailsBatchMaxTokens,
        temperature: 0.15,
      });
    } catch (err: any) {
      if (this.isJsonishError(err)) {
        if (batchOutlines.length > 1 && depth < 3) {
          const mid = Math.ceil(batchOutlines.length / 2);
          const left = await this.generateDetailsForBatch(
            batchOutlines.slice(0, mid),
            batchMinutes.slice(0, mid),
            params,
            detailsModelOverride,
            depth + 1,
          );
          const right = await this.generateDetailsForBatch(
            batchOutlines.slice(mid),
            batchMinutes.slice(mid),
            params,
            detailsModelOverride,
            depth + 1,
          );
          return [...left, ...right];
        }
        return await attemptBatch({
          maxOutputTokens: detailsBatchRetryMaxTokens,
          temperature: 0.1,
        });
      }
      throw err;
    }
  }
}
