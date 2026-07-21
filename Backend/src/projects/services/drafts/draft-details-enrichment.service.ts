import { Injectable } from '@nestjs/common';
import {
  validateDrafts,
  getNumericEnv,
  mapWithConcurrency,
  createBatches,
  assembleEnrichedBatches,
  isJsonishError,
  getConcurrencyParams,
} from './utils/draft-generation-helpers.util';
import {
  EnrichOutlinesParamsDto,
  MicroTaskDetails,
  MicroTaskDraft,
  DraftBatchResult,
  SingleDetailsParamsDto,
  MultipleDetailsParamsDto,
} from '../../interfaces/drafts.interface';
import { DraftsAiService } from '../../../ai/services/tasks/drafts-ai.service';

@Injectable()
export class DraftDetailsEnrichmentService {
  constructor(private readonly draftsAi: DraftsAiService) {}

  async enrichOutlinesWithDetails(dto: EnrichOutlinesParamsDto): Promise<MicroTaskDraft[]> {
    const { detailsConcurrency, detailsBatchSize, detailsBatchConcurrency } = getConcurrencyParams();

    const enriched =
      detailsBatchSize <= 1
        ? await this.enrichWithoutBatching(dto, detailsConcurrency)
        : await this.enrichWithBatching(dto, detailsBatchSize, detailsBatchConcurrency);

    return validateDrafts(enriched);
  }

  private async enrichWithoutBatching(
    dto: EnrichOutlinesParamsDto,
    concurrency: number,
  ): Promise<MicroTaskDraft[]> {
    const { outlines, sliceMinutes, params, detailsModelOverride } = dto;
    return mapWithConcurrency(outlines, concurrency, async (outline, index) => {
      const details = await this.generateDetailsForBatch({
        outlines: [outline],
        sliceMinutes: [sliceMinutes[index]],
        params,
        detailsModelOverride,
      });
      return { ...outline, ...details[0] } as MicroTaskDraft;
    });
  }

  private async enrichWithBatching(
    dto: EnrichOutlinesParamsDto,
    batchSize: number,
    batchConcurrency: number,
  ): Promise<MicroTaskDraft[]> {
    const { outlines, sliceMinutes, params, detailsModelOverride } = dto;
    const batches = createBatches(outlines, sliceMinutes, batchSize);

    const batchResults = await mapWithConcurrency(batches, batchConcurrency, async (b) => {
      const detailsList = await this.generateDetailsForBatch({
        outlines: b.outlines,
        sliceMinutes: b.minutes,
        params,
        detailsModelOverride,
      });
      return { start: b.start, detailsList } as DraftBatchResult;
    });

    return assembleEnrichedBatches(outlines, batchResults);
  }

  private async generateDetailsForBatch(
    dto: EnrichOutlinesParamsDto,
    depth = 0,
  ): Promise<MicroTaskDetails[]> {
    const { outlines, sliceMinutes, params, detailsModelOverride } = dto;
    if (outlines.length !== sliceMinutes.length) {
      throw new Error('Details batch inválido: tamanho de sliceMinutes não confere');
    }

    const detailsMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);

    if (outlines.length === 1) {
      return this.generateSingleDetails({
        outline: outlines[0],
        targetMinutes: sliceMinutes[0],
        params,
        detailsModelOverride,
        maxTokens: detailsMaxTokens,
        retryMaxTokens: detailsRetryMaxTokens,
      });
    }

    return this.generateMultipleDetails({
      enrichParams: dto,
      detailsMaxTokens,
      detailsRetryMaxTokens,
      depth,
    });
  }

  private async generateSingleDetails(paramsDto: SingleDetailsParamsDto): Promise<MicroTaskDetails[]> {
    const attemptDetails = async (opts: { maxOutputTokens: number; temperature: number }) => {
      return this.draftsAi.generateDetails(paramsDto, opts.maxOutputTokens, opts.temperature);
    };

    try {
      return await attemptDetails({
        maxOutputTokens: paramsDto.maxTokens,
        temperature: 0.15,
      });
    } catch (err: any) {
      if (isJsonishError(err)) {
        return await attemptDetails({
          maxOutputTokens: paramsDto.retryMaxTokens,
          temperature: 0.1,
        });
      }
      throw err;
    }
  }

  private async generateMultipleDetails(
    paramsDto: MultipleDetailsParamsDto,
  ): Promise<MicroTaskDetails[]> {
    const { enrichParams, detailsMaxTokens, detailsRetryMaxTokens, depth } = paramsDto;
    const { outlines } = enrichParams;

    const detailsBatchMaxTokens = getNumericEnv(
      'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
      Math.min(detailsMaxTokens * outlines.length, 3500),
    );
    const detailsBatchRetryMaxTokens = getNumericEnv(
      'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
      Math.min(detailsRetryMaxTokens * outlines.length, 5000),
    );

    const attemptBatch = async (opts: { maxOutputTokens: number; temperature: number }) => {
      return this.draftsAi.generateDetailsBatch(paramsDto, opts.maxOutputTokens, opts.temperature);
    };

    try {
      return await attemptBatch({
        maxOutputTokens: detailsBatchMaxTokens,
        temperature: 0.15,
      });
    } catch (err: any) {
      if (isJsonishError(err)) {
        if (depth < 3) {
          return this.splitAndGenerateDetails(enrichParams, depth);
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
    dto: EnrichOutlinesParamsDto,
    depth: number,
  ): Promise<MicroTaskDetails[]> {
    const { outlines, sliceMinutes, params, detailsModelOverride } = dto;
    const mid = Math.ceil(outlines.length / 2);
    const left = await this.generateDetailsForBatch(
      {
        outlines: outlines.slice(0, mid),
        sliceMinutes: sliceMinutes.slice(0, mid),
        params,
        detailsModelOverride,
      },
      depth + 1,
    );
    const right = await this.generateDetailsForBatch(
      {
        outlines: outlines.slice(mid),
        sliceMinutes: sliceMinutes.slice(mid),
        params,
        detailsModelOverride,
      },
      depth + 1,
    );
    return [...left, ...right];
  }
}
