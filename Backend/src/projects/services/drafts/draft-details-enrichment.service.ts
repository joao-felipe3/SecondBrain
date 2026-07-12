import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { PromptBuilderService } from '../wbs';
import { extractJsonArray, extractJsonObject } from '../wbs/utils/json-parser.util';
import {
  validateDraftDetails,
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
  ) {}

  async enrichOutlinesWithDetails(
    outlines: any[],
    sliceMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
  ): Promise<any[]> {
    const { detailsConcurrency, detailsBatchSize, detailsBatchConcurrency } =
      this.getConcurrencyParams();

    const enriched =
      detailsBatchSize <= 1
        ? await this.enrichWithoutBatching(
            outlines,
            sliceMinutes,
            params,
            detailsModelOverride,
            detailsConcurrency,
          )
        : await this.enrichWithBatching(
            outlines,
            sliceMinutes,
            params,
            detailsModelOverride,
            detailsBatchSize,
            detailsBatchConcurrency,
          );

    return validateDrafts(enriched);
  }

  private getConcurrencyParams(): {
    detailsConcurrency: number;
    detailsBatchSize: number;
    detailsBatchConcurrency: number;
  } {
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

    return { detailsConcurrency, detailsBatchSize, detailsBatchConcurrency };
  }

  private async enrichWithoutBatching(
    outlines: any[],
    sliceMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
    concurrency: number,
  ): Promise<any[]> {
    return mapWithConcurrency(outlines, concurrency, async (outline, index) => {
      const details = await this.generateDetailsForBatch(
        [outline],
        [sliceMinutes[index]],
        params,
        detailsModelOverride,
      );
      return { ...outline, ...details[0] };
    });
  }

  private async enrichWithBatching(
    outlines: any[],
    sliceMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
    batchSize: number,
    batchConcurrency: number,
  ): Promise<any[]> {
    const batches = this.createBatches(outlines, sliceMinutes, batchSize);

    const batchResults = await mapWithConcurrency(batches, batchConcurrency, async (b) => {
      const detailsList = await this.generateDetailsForBatch(
        b.outlines,
        b.minutes,
        params,
        detailsModelOverride,
      );
      return { start: b.start, detailsList };
    });

    return this.assembleEnrichedBatches(outlines, batchResults);
  }

  private createBatches(
    outlines: any[],
    sliceMinutes: number[],
    batchSize: number,
  ): Array<{ start: number; outlines: any[]; minutes: number[] }> {
    const batches: Array<{ start: number; outlines: any[]; minutes: number[] }> = [];
    for (let i = 0; i < outlines.length; i += batchSize) {
      batches.push({
        start: i,
        outlines: outlines.slice(i, i + batchSize),
        minutes: sliceMinutes.slice(i, i + batchSize),
      });
    }
    return batches;
  }

  private assembleEnrichedBatches(
    outlines: any[],
    batchResults: Array<{ start: number; detailsList: any[] }>,
  ): any[] {
    const enriched = new Array(outlines.length);
    for (const r of batchResults) {
      for (let j = 0; j < r.detailsList.length; j++) {
        const idx = r.start + j;
        enriched[idx] = { ...outlines[idx], ...r.detailsList[j] };
      }
    }
    return enriched;
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
      return this.generateSingleDetails(
        batchOutlines[0],
        batchMinutes[0],
        params,
        detailsModelOverride,
        detailsMaxTokens,
        detailsRetryMaxTokens,
      );
    }

    return this.generateMultipleDetails(
      batchOutlines,
      batchMinutes,
      params,
      detailsModelOverride,
      detailsMaxTokens,
      detailsRetryMaxTokens,
      depth,
    );
  }

  private async generateSingleDetails(
    outline: any,
    targetMinutes: number,
    params: any,
    detailsModelOverride: string | undefined,
    maxTokens: number,
    retryMaxTokens: number,
  ): Promise<
    Array<{
      checklist: string[];
      definitionOfDone: string;
      description?: string;
    }>
  > {
    const detailsPrompt = this.promptBuilder.buildMicroTaskDetailsPrompt({
      ...params,
      targetMinutes,
      outline,
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
        maxOutputTokens: maxTokens,
        temperature: 0.15,
      });
    } catch (err: any) {
      if (this.isJsonishError(err)) {
        return await attemptDetails({
          maxOutputTokens: retryMaxTokens,
          temperature: 0.1,
        });
      }
      throw err;
    }
  }

  private async generateMultipleDetails(
    batchOutlines: any[],
    batchMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
    detailsMaxTokens: number,
    detailsRetryMaxTokens: number,
    depth: number,
  ): Promise<
    Array<{
      checklist: string[];
      definitionOfDone: string;
      description?: string;
    }>
  > {
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
        throw new Error(`IA retornou ${detailsList.length} details; esperado ${batchOutlines.length}`);
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
        if (depth < 3) {
          return this.splitAndGenerateDetails(
            batchOutlines,
            batchMinutes,
            params,
            detailsModelOverride,
            depth,
          );
        }
        return await attemptBatch({
          maxOutputTokens: detailsBatchRetryMaxTokens,
          temperature: 0.1,
        });
      }
      throw err;
    }
  }

  private async splitAndGenerateDetails(
    batchOutlines: any[],
    batchMinutes: number[],
    params: any,
    detailsModelOverride: string | undefined,
    depth: number,
  ): Promise<
    Array<{
      checklist: string[];
      definitionOfDone: string;
      description?: string;
    }>
  > {
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
}
