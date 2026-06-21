import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { CacheService, PromptBuilderService, ThemeExtractionService } from './index';
import { extractJsonArray, extractJsonObject } from './utils/json-parser.util';
import {
  validateDraftOutlines,
  validateDraftDetails,
  validatePlannerPlan,
  validateDrafts,
  safeEnv,
  logWithTimestamp,
  getNumericEnv,
  isTwoPassEnabled,
  isCacheDebugEnabled,
  getProjectId,
  buildDraftsCacheKey,
  getWbsGenerationModelOverride,
  getDetailsModelOverride,
  mapWithConcurrency,
  hashKey,
} from './utils/draft-generation-helpers.util';

@Injectable()
export class DraftGenerationService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
    private readonly cacheService: CacheService,
  ) {}

  async generateMicroTasksPlanForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    workflowMix?: Record<string, number>;
    modelOverride?: string;
  }): Promise<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> {
    const resolvedModelOverride = params.modelOverride || getWbsGenerationModelOverride();
    const projectId = getProjectId(params.project);

    const planFingerprint = {
      v: 1,
      kind: 'plan',
      nodeId: (params.node as any)?._id ? String((params.node as any)._id) : undefined,
      nodeName: params.node?.name,
      nodeDesc: params.node?.description,
      currentPath: params.currentPath,
      level: params.level,
      estimatedHours: params.node?.estimatedHours,
      chunkMinutes: params.chunkMinutes,
      workflowMix: params.workflowMix,
      model: resolvedModelOverride,
    };
    const planCacheKey = projectId
      ? `drafts_with_plan:${projectId}:plan:${this.hashKey(planFingerprint)}`
      : '';

    if (projectId) {
      const cachedPlan = await this.cacheService.get<any>(planCacheKey);
      if (cachedPlan) {
        if (isCacheDebugEnabled()) {
          console.log('[draft-generation][cache] hit', {
            prefix: 'drafts_with_plan:plan',
            projectId,
            keyPrefix: planCacheKey.split(':').slice(0, 4).join(':'),
          });
        }
        return validatePlannerPlan(cachedPlan);
      }
    }

    const themeHints = await this.themeExtraction.getThemeSuggestionsForLeaf({
      project: params.project,
      node: params.node,
    });

    const prompt = this.promptBuilder.buildMicroTasksPlannerPrompt({
      ...params,
      themeHints: themeHints.themes,
    });

    const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
      const response = await this.geminiService.generateContent(prompt, {
        model: resolvedModelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      const plan = extractJsonObject<any>(response);
      return validatePlannerPlan(plan);
    };

    try {
      const plan = await attempt({ maxOutputTokens: 1200, temperature: 0.6 });
      if (projectId) {
        await this.cacheService.set(planCacheKey, plan);
        if (isCacheDebugEnabled()) {
          console.log('[draft-generation][cache] set', {
            prefix: 'drafts_with_plan:plan',
            projectId,
            keyPrefix: planCacheKey.split(':').slice(0, 4).join(':'),
          });
        }
      }
      return plan;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/json/i.test(msg) || /truncad|incomplet|parse/i.test(msg)) {
        const plan = await attempt({ maxOutputTokens: 2200, temperature: 0.2 });
        if (projectId) {
          await this.cacheService.set(planCacheKey, plan);
          if (isCacheDebugEnabled()) {
            console.log('[draft-generation][cache] set', {
              prefix: 'drafts_with_plan:plan',
              projectId,
              keyPrefix: planCacheKey.split(':').slice(0, 4).join(':'),
            });
          }
        }
        return plan;
      }
      throw err;
    }
  }

  async generateMicroTasksDraftsForLeaf(
    params: {
      project: any;
      node: WBSNodeDto;
      currentPath: string;
      level: number;
    },
    chunkMinutes: number[],
    modelOverride?: string,
  ): Promise<
    Array<{
      name: string;
      description?: string;
      checklist: string[];
      definitionOfDone: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    const projectId = getProjectId(params.project);
    const resolvedModelOverride = modelOverride || getWbsGenerationModelOverride();
    if (projectId) {
      const fingerprint = {
        v: 1,
        kind: 'drafts',
        nodeId: (params.node as any)?._id ? String((params.node as any)._id) : undefined,
        nodeName: params.node?.name,
        nodeDesc: params.node?.description,
        currentPath: params.currentPath,
        level: params.level,
        estimatedHours: params.node?.estimatedHours,
        chunkMinutes,
        model: resolvedModelOverride,
        twoPass: safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = buildDraftsCacheKey({
        prefix: 'drafts',
        projectId,
        fingerprint,
      });
      const cached = await this.cacheService.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length >= chunkMinutes.length) {
        if (isCacheDebugEnabled()) {
          console.log('[draft-generation][cache] hit', {
            prefix: 'drafts',
            projectId,
            items: cached.length,
            keyPrefix: cacheKey.split(':').slice(0, 3).join(':'),
          });
        }
        return cached.slice(0, chunkMinutes.length) as any;
      }
    }

    const maxPerCall = getNumericEnv('WBS_MAX_PER_CALL', 24);
    const baseMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const avoidTaskTitles: string[] = [];

    const twoPassEnabled = isTwoPassEnabled();
    const detailsConcurrency = getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
    const detailsMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);
    const modeLabel = twoPassEnabled ? 'two-pass' : 'single-pass';
    const overallStart = Date.now();
    logWithTimestamp(
      `generateMicroTasksDraftsForLeaf start mode=${modeLabel} chunks=${chunkMinutes.length}`,
    );

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

    const generateDraftsForSlice = async (sliceMinutes: number[]): Promise<any[]> => {
      const sliceMode = twoPassEnabled ? 'two-pass' : 'single-pass';
      const sliceStart = Date.now();
      logWithTimestamp(`slice(${sliceMinutes.length}) start [${sliceMode}]`);
      try {
        if (!twoPassEnabled) {
          const prompt = this.promptBuilder.buildMicroTasksPrompt({
            ...params,
            chunkMinutes: sliceMinutes,
            avoidTaskTitles,
          });

          const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
            const response = await this.geminiService.generateContent(prompt, {
              model: resolvedModelOverride,
              responseMimeType: 'application/json',
              maxOutputTokens: opts.maxOutputTokens,
              temperature: opts.temperature,
            });
            const drafts = extractJsonArray<any>(response);
            const validated = validateDrafts(drafts);
            if (validated.length !== sliceMinutes.length) {
              throw new Error(`IA retornou ${validated.length} itens; esperado ${sliceMinutes.length}`);
            }
            return validated;
          };

          try {
            return await attempt({
              maxOutputTokens: baseMaxTokens,
              temperature: 0.2,
            });
          } catch (err: any) {
            if (sliceMinutes.length > 1 && isJsonishError(err)) {
              const mid = Math.ceil(sliceMinutes.length / 2);
              const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
              const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
              return [...left, ...right];
            }

            if (isJsonishError(err)) {
              return await attempt({
                maxOutputTokens: retryMaxTokens,
                temperature: 0.15,
              });
            }
            throw err;
          }
        }

        const outlinePrompt = this.promptBuilder.buildMicroTasksOutlinePrompt({
          ...params,
          chunkMinutes: sliceMinutes,
          avoidTaskTitles,
        });

        const attemptOutline = async (opts: { maxOutputTokens: number; temperature: number }) => {
          const response = await this.geminiService.generateContent(outlinePrompt, {
            model: resolvedModelOverride,
            responseMimeType: 'application/json',
            maxOutputTokens: opts.maxOutputTokens,
            temperature: opts.temperature,
          });
          const outlines = extractJsonArray<any>(response);
          const validated = validateDraftOutlines(outlines);
          if (validated.length !== sliceMinutes.length) {
            throw new Error(`IA retornou ${validated.length} outlines; esperado ${sliceMinutes.length}`);
          }
          return validated;
        };

        let outlines: any[];
        try {
          outlines = await attemptOutline({
            maxOutputTokens: Math.min(baseMaxTokens, 1400),
            temperature: 0.2,
          });
        } catch (err: any) {
          if (sliceMinutes.length > 1 && isJsonishError(err)) {
            const mid = Math.ceil(sliceMinutes.length / 2);
            const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
            const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
            return [...left, ...right];
          }
          if (isJsonishError(err)) {
            outlines = await attemptOutline({
              maxOutputTokens: Math.min(retryMaxTokens, 2000),
              temperature: 0.15,
            });
          } else {
            throw err;
          }
        }

        const detailsModelOverride = getDetailsModelOverride(resolvedModelOverride);
        const detailsBatchSize = getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
        const detailsBatchConcurrency =
          detailsBatchSize > 1
            ? getNumericEnv(
                'WBS_DETAILS_BATCH_CONCURRENCY',
                Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
              )
            : detailsConcurrency;
        const detailsBatchMaxTokens = getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
          Math.min(detailsMaxTokens * Math.max(1, detailsBatchSize), 3500),
        );
        const detailsBatchRetryMaxTokens = getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
          Math.min(detailsRetryMaxTokens * Math.max(1, detailsBatchSize), 5000),
        );

        if (detailsBatchSize > 1) {
          logWithTimestamp(
            `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
          );
        }

        const generateDetailsForBatch = async (
          batchOutlines: any[],
          batchMinutes: number[],
          depth = 0,
        ): Promise<
          Array<{
            checklist: string[];
            definitionOfDone: string;
            description?: string;
          }>
        > => {
          if (batchOutlines.length !== batchMinutes.length) {
            throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
          }

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
              const msg = String(err?.message || err || '').toLowerCase();
              const jsonish =
                msg.includes('json') ||
                msg.includes('truncad') ||
                msg.includes('parse') ||
                msg.includes('object');
              if (jsonish) {
                return await attemptDetails({
                  maxOutputTokens: detailsRetryMaxTokens,
                  temperature: 0.1,
                });
              }
              throw err;
            }
          }

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
            if (isJsonishError(err)) {
              if (batchOutlines.length > 1 && depth < 3) {
                const mid = Math.ceil(batchOutlines.length / 2);
                const left = await generateDetailsForBatch(
                  batchOutlines.slice(0, mid),
                  batchMinutes.slice(0, mid),
                  depth + 1,
                );
                const right = await generateDetailsForBatch(
                  batchOutlines.slice(mid),
                  batchMinutes.slice(mid),
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
        };

        let enriched: any[];
        if (detailsBatchSize <= 1) {
          enriched = await mapWithConcurrency(
            outlines,
            detailsConcurrency,
            async (outline, index) => {
              const details = await generateDetailsForBatch([outline], [sliceMinutes[index]]);
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
              const detailsList = await generateDetailsForBatch(b.outlines, b.minutes);
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
      } finally {
        const elapsed = Date.now() - sliceStart;
        logWithTimestamp(`slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
      }
    };

    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }

    const allDrafts: any[] = [];
    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const sliceDrafts = await generateDraftsForSlice(slices[sliceIdx]);
      allDrafts.push(...sliceDrafts);

      for (const draft of sliceDrafts) {
        const title = String(draft?.name || '').trim();
        if (title) avoidTaskTitles.push(title);
      }
    }

    const overallElapsed = Date.now() - overallStart;
    logWithTimestamp(
      `generateMicroTasksDraftsForLeaf end mode=${modeLabel} slices=${slices.length} total=${overallElapsed}ms`,
    );
    const normalized = allDrafts.map((d, idx) => ({
      name: String(d.name || `Micro-tarefa (${idx + 1}/${chunkMinutes.length})`).trim(),
      description: String(d?.description || '').trim() || undefined,
      checklist: Array.isArray(d?.checklist)
        ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      definitionOfDone: String(d.definitionOfDone || '').trim(),
      pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || 1)),
      priority: Math.max(1, Math.min(4, Number(d?.priority) || 2)),
      difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
      microTaskType: d?.microTaskType || undefined,
      themeTag: d?.themeTag || undefined,
      contextTag: d?.contextTag || undefined,
      cognitiveMode: d?.cognitiveMode || undefined,
    }));

    return normalized;
  }

  async generateMicroTasksDraftsForLeafWithPlan(
    params: {
      project: any;
      node: WBSNodeDto;
      currentPath: string;
      level: number;
      plan: {
        themes?: Array<{ name: string; criteria?: string }>;
        workflow?: string[];
        milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
      };
      modelOverride?: string;
    },
    chunkMinutes: number[],
  ): Promise<
    Array<{
      name: string;
      description?: string;
      checklist: string[];
      definitionOfDone: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    const projectId = getProjectId(params.project);
    const resolvedModelOverride = params.modelOverride || getWbsGenerationModelOverride();
    if (projectId) {
      const fingerprint = {
        v: 2,
        kind: 'drafts_with_plan',
        nodeId: (params.node as any)?._id ? String((params.node as any)._id) : undefined,
        nodeName: params.node?.name,
        nodeDesc: params.node?.description,
        currentPath: params.currentPath,
        level: params.level,
        estimatedHours: params.node?.estimatedHours,
        chunkMinutes,
        plan: params.plan,
        model: resolvedModelOverride,
        twoPass: safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = buildDraftsCacheKey({
        prefix: 'drafts_with_plan',
        projectId,
        fingerprint,
      });
      const cached = await this.cacheService.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length >= chunkMinutes.length) {
        if (isCacheDebugEnabled()) {
          console.log('[draft-generation][cache] hit', {
            prefix: 'drafts_with_plan',
            projectId,
            items: cached.length,
            keyPrefix: cacheKey.split(':').slice(0, 3).join(':'),
          });
        }
        return cached.slice(0, chunkMinutes.length) as any;
      }
    }

    const maxPerCall = getNumericEnv('WBS_MAX_PER_CALL', 24);
    const baseMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

    const avoidTaskTitles: string[] = [];

    const twoPassEnabled = isTwoPassEnabled();
    const detailsConcurrency = getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
    const detailsMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);
    const modeLabel = twoPassEnabled ? 'two-pass' : 'single-pass';
    const overallStart = Date.now();
    logWithTimestamp(
      `generateMicroTasksDraftsForLeafWithPlan start mode=${modeLabel} chunks=${chunkMinutes.length}`,
    );

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

    const generateDraftsForSlice = async (sliceMinutes: number[]): Promise<any[]> => {
      const sliceMode = twoPassEnabled ? 'two-pass' : 'single-pass';
      const sliceStart = Date.now();
      logWithTimestamp(`slice(${sliceMinutes.length}) start [${sliceMode}]`);
      try {
        if (!twoPassEnabled) {
          const prompt = this.promptBuilder.buildMicroTasksGeneratorPrompt({
            ...params,
            chunkMinutes: sliceMinutes,
            avoidTaskTitles,
          });

          const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
            const response = await this.geminiService.generateContent(prompt, {
              model: resolvedModelOverride,
              responseMimeType: 'application/json',
              maxOutputTokens: opts.maxOutputTokens,
              temperature: opts.temperature,
            });
            const drafts = extractJsonArray<any>(response);
            const validated = validateDrafts(drafts);
            if (validated.length !== sliceMinutes.length) {
              throw new Error(`IA retornou ${validated.length} itens; esperado ${sliceMinutes.length}`);
            }
            return validated;
          };

          try {
            return await attempt({
              maxOutputTokens: baseMaxTokens,
              temperature: 0.2,
            });
          } catch (err: any) {
            if (sliceMinutes.length > 1 && isJsonishError(err)) {
              const mid = Math.ceil(sliceMinutes.length / 2);
              const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
              const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
              return [...left, ...right];
            }

            if (isJsonishError(err)) {
              return await attempt({
                maxOutputTokens: retryMaxTokens,
                temperature: 0.15,
              });
            }
            throw err;
          }
        }

        const outlinePrompt = this.promptBuilder.buildMicroTasksOutlineWithPlanPrompt({
          ...params,
          chunkMinutes: sliceMinutes,
          avoidTaskTitles,
        });

        const attemptOutline = async (opts: { maxOutputTokens: number; temperature: number }) => {
          const response = await this.geminiService.generateContent(outlinePrompt, {
            model: resolvedModelOverride,
            responseMimeType: 'application/json',
            maxOutputTokens: opts.maxOutputTokens,
            temperature: opts.temperature,
          });
          const outlines = extractJsonArray<any>(response);
          const validated = validateDraftOutlines(outlines);
          if (validated.length !== sliceMinutes.length) {
            throw new Error(`IA retornou ${validated.length} outlines; esperado ${sliceMinutes.length}`);
          }
          return validated;
        };

        let outlines: any[];
        try {
          outlines = await attemptOutline({
            maxOutputTokens: Math.min(baseMaxTokens, 1400),
            temperature: 0.2,
          });
        } catch (err: any) {
          if (sliceMinutes.length > 1 && isJsonishError(err)) {
            const mid = Math.ceil(sliceMinutes.length / 2);
            const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
            const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
            return [...left, ...right];
          }
          if (isJsonishError(err)) {
            outlines = await attemptOutline({
              maxOutputTokens: Math.min(retryMaxTokens, 2000),
              temperature: 0.15,
            });
          } else {
            throw err;
          }
        }

        const detailsModelOverride = getDetailsModelOverride(resolvedModelOverride);
        const detailsBatchSize = getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
        const detailsBatchConcurrency =
          detailsBatchSize > 1
            ? getNumericEnv(
                'WBS_DETAILS_BATCH_CONCURRENCY',
                Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
              )
            : detailsConcurrency;
        const detailsBatchMaxTokens = getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
          Math.min(detailsMaxTokens * Math.max(1, detailsBatchSize), 3500),
        );
        const detailsBatchRetryMaxTokens = getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
          Math.min(detailsRetryMaxTokens * Math.max(1, detailsBatchSize), 5000),
        );

        if (detailsBatchSize > 1) {
          logWithTimestamp(
            `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
          );
        }

        const generateDetailsForBatch = async (
          batchOutlines: any[],
          batchMinutes: number[],
          depth = 0,
        ): Promise<
          Array<{
            checklist: string[];
            definitionOfDone: string;
            description?: string;
          }>
        > => {
          if (batchOutlines.length !== batchMinutes.length) {
            throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
          }

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
              const msg = String(err?.message || err || '').toLowerCase();
              const jsonish =
                msg.includes('json') ||
                msg.includes('truncad') ||
                msg.includes('parse') ||
                msg.includes('object');
              if (jsonish) {
                return await attemptDetails({
                  maxOutputTokens: detailsRetryMaxTokens,
                  temperature: 0.1,
                });
              }
              throw err;
            }
          }

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
            if (isJsonishError(err)) {
              if (batchOutlines.length > 1 && depth < 3) {
                const mid = Math.ceil(batchOutlines.length / 2);
                const left = await generateDetailsForBatch(
                  batchOutlines.slice(0, mid),
                  batchMinutes.slice(0, mid),
                  depth + 1,
                );
                const right = await generateDetailsForBatch(
                  batchOutlines.slice(mid),
                  batchMinutes.slice(mid),
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
        };

        let enriched: any[];
        if (detailsBatchSize <= 1) {
          enriched = await mapWithConcurrency(
            outlines,
            detailsConcurrency,
            async (outline, index) => {
              const details = await generateDetailsForBatch([outline], [sliceMinutes[index]]);
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
              const detailsList = await generateDetailsForBatch(b.outlines, b.minutes);
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
      } finally {
        const elapsed = Date.now() - sliceStart;
        logWithTimestamp(`slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
      }
    };

    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }

    const allDrafts: any[] = [];
    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const sliceDrafts = await generateDraftsForSlice(slices[sliceIdx]);
      allDrafts.push(...sliceDrafts);

      for (const draft of sliceDrafts) {
        const title = String(draft?.name || '').trim();
        if (title) avoidTaskTitles.push(title);
      }
    }

    const overallElapsed = Date.now() - overallStart;
    logWithTimestamp(
      `generateMicroTasksDraftsForLeafWithPlan end mode=${modeLabel} slices=${slices.length} total=${overallElapsed}ms`,
    );
    const normalized = allDrafts.map((d, idx) => ({
      name: String(d.name || `Micro-tarefa (${idx + 1}/${chunkMinutes.length})`).trim(),
      description: String(d?.description || '').trim() || undefined,
      checklist: Array.isArray(d?.checklist)
        ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      definitionOfDone: String(d.definitionOfDone || '').trim(),
      pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || 1)),
      priority: Math.max(1, Math.min(4, Number(d?.priority) || 2)),
      difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
      microTaskType: d?.microTaskType || undefined,
      themeTag: d?.themeTag || undefined,
      contextTag: d?.contextTag || undefined,
      cognitiveMode: d?.cognitiveMode || undefined,
    }));

    return normalized;
  }

  private hashKey(input: any): string {
    return hashKey(input);
  }
}
