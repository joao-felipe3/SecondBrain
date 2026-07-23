import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../core/gemini.service';
import { PromptBuilderService } from '../projects/prompt-builder.service';
import {
  extractJsonArray,
  extractJsonObject,
} from '../../../projects/services/wbs/utils/json-parser.util';
import {
  MicroTaskOutline,
  MicroTaskDetails,
  MicroTaskDraft,
  WBSLeafPlanResultDto,
  WBSLeafPlanParamsDto,
  WBSLeafGenerationContext,
  WBSLeafWithPlanGenerationContext,
  SingleDetailsParamsDto,
  MultipleDetailsParamsDto,
} from '../../../projects/interfaces/drafts.interface';
import {
  plannerSchema,
  draftsSchema,
  draftOutlinesSchema,
  draftDetailsSchema,
} from '../../../projects/schemas/drafts-validation.schema';
import {
  getNumericEnv,
  isJsonishError,
} from '../../../projects/services/drafts/utils/draft-generation-helpers.util';

@Injectable()
export class DraftsAiService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async generatePlan(
    params: WBSLeafPlanParamsDto,
    themeHints: string[],
    modelOverride?: string,
  ): Promise<WBSLeafPlanResultDto> {
    const prompt = this.promptBuilder.buildMicroTasksPlannerPrompt({
      ...params,
      themeHints,
    });

    const rawResponse = await this.geminiService.generateContent(prompt, {
      model: modelOverride,
      responseMimeType: 'application/json',
      temperature: 0.25,
    });

    const planJson = extractJsonObject<unknown>(rawResponse);
    const parsed = plannerSchema.safeParse(planJson);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Plano inválido: ${issues}`);
    }
    return parsed.data;
  }

  async generateSinglePassWithoutPlan(
    params: WBSLeafGenerationContext,
    chunkMinutes: number[],
    avoidTaskTitles: string[],
    modelOverride?: string,
    maxOutputTokens?: number,
    temperature?: number,
  ): Promise<MicroTaskDraft[]> {
    const baseMaxTokens = maxOutputTokens || getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const attempt = async (tokens: number, temp: number) => {
      const prompt = this.promptBuilder.buildMicroTasksPrompt({
        ...params,
        chunkMinutes,
        avoidTaskTitles,
      });

      const response = await this.geminiService.generateContent(prompt, {
        model: modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: temp,
      });

      const drafts = extractJsonArray<any>(response);
      const parsed = draftsSchema.safeParse(drafts);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(`Drafts inválidos: ${issues}`);
      }
      if (parsed.data.length !== chunkMinutes.length) {
        throw new Error(`IA retornou ${parsed.data.length} itens; esperado ${chunkMinutes.length}`);
      }
      return parsed.data;
    };

    try {
      return await attempt(baseMaxTokens, temperature ?? 0.2);
    } catch (err: any) {
      if (chunkMinutes.length > 1 && isJsonishError(err)) {
        const mid = Math.ceil(chunkMinutes.length / 2);
        const left = await this.generateSinglePassWithoutPlan(
          params,
          chunkMinutes.slice(0, mid),
          avoidTaskTitles,
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        const right = await this.generateSinglePassWithoutPlan(
          params,
          chunkMinutes.slice(mid),
          [...avoidTaskTitles, ...left.map((t) => t.name)],
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        return [...left, ...right];
      }

      if (isJsonishError(err)) {
        return await attempt(retryMaxTokens, 0.15);
      }
      throw err;
    }
  }

  async generateSinglePassWithPlan(
    params: WBSLeafWithPlanGenerationContext,
    chunkMinutes: number[],
    avoidTaskTitles: string[],
    modelOverride?: string,
    maxOutputTokens?: number,
    temperature?: number,
  ): Promise<MicroTaskDraft[]> {
    const baseMaxTokens = maxOutputTokens || getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const attempt = async (tokens: number, temp: number) => {
      const prompt = this.promptBuilder.buildMicroTasksGeneratorPrompt({
        ...params,
        chunkMinutes,
        avoidTaskTitles,
      });

      const response = await this.geminiService.generateContent(prompt, {
        model: modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: temp,
      });

      const drafts = extractJsonArray<any>(response);
      const parsed = draftsSchema.safeParse(drafts);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(`Drafts inválidos: ${issues}`);
      }
      if (parsed.data.length !== chunkMinutes.length) {
        throw new Error(`IA retornou ${parsed.data.length} itens; esperado ${chunkMinutes.length}`);
      }
      return parsed.data;
    };

    try {
      return await attempt(baseMaxTokens, temperature ?? 0.2);
    } catch (err: any) {
      if (chunkMinutes.length > 1 && isJsonishError(err)) {
        const mid = Math.ceil(chunkMinutes.length / 2);
        const left = await this.generateSinglePassWithPlan(
          params,
          chunkMinutes.slice(0, mid),
          avoidTaskTitles,
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        const right = await this.generateSinglePassWithPlan(
          params,
          chunkMinutes.slice(mid),
          [...avoidTaskTitles, ...left.map((t) => t.name)],
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        return [...left, ...right];
      }

      if (isJsonishError(err)) {
        return await attempt(retryMaxTokens, 0.15);
      }
      throw err;
    }
  }

  async generateOutlineWithoutPlan(
    params: WBSLeafGenerationContext,
    chunkMinutes: number[],
    avoidTaskTitles: string[],
    modelOverride?: string,
    maxOutputTokens?: number,
    temperature?: number,
  ): Promise<MicroTaskOutline[]> {
    const baseMaxTokens = maxOutputTokens || getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const attempt = async (tokens: number, temp: number) => {
      const prompt = this.promptBuilder.buildMicroTasksOutlinePrompt({
        ...params,
        chunkMinutes,
        avoidTaskTitles,
      });

      const response = await this.geminiService.generateContent(prompt, {
        model: modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: temp,
      });

      const outlines = extractJsonArray<any>(response);
      const parsed = draftOutlinesSchema.safeParse(outlines);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(`Outlines inválidos: ${issues}`);
      }
      if (parsed.data.length !== chunkMinutes.length) {
        throw new Error(`IA retornou ${parsed.data.length} outlines; esperado ${chunkMinutes.length}`);
      }
      return parsed.data;
    };

    try {
      return await attempt(Math.min(baseMaxTokens, 1400), temperature ?? 0.2);
    } catch (err: any) {
      if (chunkMinutes.length > 1 && isJsonishError(err)) {
        const mid = Math.ceil(chunkMinutes.length / 2);
        const left = await this.generateOutlineWithoutPlan(
          params,
          chunkMinutes.slice(0, mid),
          avoidTaskTitles,
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        const right = await this.generateOutlineWithoutPlan(
          params,
          chunkMinutes.slice(mid),
          [...avoidTaskTitles, ...left.map((t) => t.name)],
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        return [...left, ...right];
      }

      if (isJsonishError(err)) {
        return await attempt(Math.min(retryMaxTokens, 2000), 0.15);
      }
      throw err;
    }
  }

  async generateOutlineWithPlan(
    params: WBSLeafWithPlanGenerationContext,
    chunkMinutes: number[],
    avoidTaskTitles: string[],
    modelOverride?: string,
    maxOutputTokens?: number,
    temperature?: number,
  ): Promise<MicroTaskOutline[]> {
    const baseMaxTokens = maxOutputTokens || getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const attempt = async (tokens: number, temp: number) => {
      const prompt = this.promptBuilder.buildMicroTasksOutlineWithPlanPrompt({
        ...params,
        chunkMinutes,
        avoidTaskTitles,
      });

      const response = await this.geminiService.generateContent(prompt, {
        model: modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: tokens,
        temperature: temp,
      });

      const outlines = extractJsonArray<any>(response);
      const parsed = draftOutlinesSchema.safeParse(outlines);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(`Outlines inválidos: ${issues}`);
      }
      if (parsed.data.length !== chunkMinutes.length) {
        throw new Error(`IA retornou ${parsed.data.length} outlines; esperado ${chunkMinutes.length}`);
      }
      return parsed.data;
    };

    try {
      return await attempt(Math.min(baseMaxTokens, 1400), temperature ?? 0.2);
    } catch (err: any) {
      if (chunkMinutes.length > 1 && isJsonishError(err)) {
        const mid = Math.ceil(chunkMinutes.length / 2);
        const left = await this.generateOutlineWithPlan(
          params,
          chunkMinutes.slice(0, mid),
          avoidTaskTitles,
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        const right = await this.generateOutlineWithPlan(
          params,
          chunkMinutes.slice(mid),
          [...avoidTaskTitles, ...left.map((t) => t.name)],
          modelOverride,
          maxOutputTokens,
          temperature,
        );
        return [...left, ...right];
      }

      if (isJsonishError(err)) {
        return await attempt(Math.min(retryMaxTokens, 2000), 0.15);
      }
      throw err;
    }
  }

  async generateDetails(
    paramsDto: SingleDetailsParamsDto,
    maxTokens: number,
    temperature: number,
  ): Promise<MicroTaskDetails[]> {
    const { outline, targetMinutes, params, detailsModelOverride } = paramsDto;
    const detailsPrompt = this.promptBuilder.buildMicroTaskDetailsPrompt({
      ...params,
      targetMinutes,
      outline,
    });

    const response = await this.geminiService.generateContent(detailsPrompt, {
      model: detailsModelOverride,
      responseMimeType: 'application/json',
      maxOutputTokens: maxTokens,
      temperature,
    });

    const details = extractJsonObject<unknown>(response);
    const parsed = draftDetailsSchema.safeParse(details);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Details inválidos: ${issues}`);
    }
    return [parsed.data as MicroTaskDetails];
  }

  async generateDetailsBatch(
    paramsDto: MultipleDetailsParamsDto,
    maxTokens: number,
    temperature: number,
  ): Promise<MicroTaskDetails[]> {
    const { enrichParams } = paramsDto;
    const { outlines, sliceMinutes, params, detailsModelOverride } = enrichParams;

    const batchPrompt = this.promptBuilder.buildMicroTaskDetailsBatchPrompt({
      ...params,
      items: outlines.map((outline, i) => ({
        outline,
        targetMinutes: sliceMinutes[i],
      })),
    });

    const response = await this.geminiService.generateContent(batchPrompt, {
      model: detailsModelOverride,
      responseMimeType: 'application/json',
      maxOutputTokens: maxTokens,
      temperature,
    });

    const detailsList = extractJsonArray<any>(response);
    if (!Array.isArray(detailsList)) {
      throw new Error('Details batch inválido: não retornou array JSON');
    }
    if (detailsList.length < outlines.length) {
      throw new Error(`IA retornou ${detailsList.length} details; esperado ${outlines.length}`);
    }

    return detailsList.slice(0, outlines.length).map((d) => {
      const parsed = draftDetailsSchema.safeParse(d);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(`Details inválidos no lote: ${issues}`);
      }
      return parsed.data as MicroTaskDetails;
    });
  }
}
