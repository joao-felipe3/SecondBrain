import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import { GeminiService } from '../../../tasks/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { CacheService, PromptBuilderService, ThemeExtractionService } from './index';
import { extractJsonArray, extractJsonObject } from '../utils/json-parser.util';
import { normalizeTitle, templateTitle, normalizeMicroTaskType, normalizeCognitiveMode, mapMicroTaskTypeToCognitiveMode, mapCognitiveModeToContextTag } from '../utils/normalizers.util';


@Injectable()
export class DraftGenerationService {
  private readonly plannerSchema = z
    .object({
      themes: z
        .array(
          z
            .object({
              name: z.string().min(1),
              criteria: z.string().optional(),
            })
            .passthrough(),
        )
        .min(1),
      workflow: z.array(z.string().min(1)).min(1),
      milestones: z
        .array(
          z
            .object({
              name: z.string().optional(),
              goal: z.string().optional(),
              atMinutes: z.number().optional(),
            })
            .passthrough(),
        )
        .optional(),
      constraints: z.record(z.string(), z.any()).optional(),
    })
    .passthrough();

  private readonly draftSchema = z
    .object({
      name: z.string().min(1),
      description: z
        .preprocess(
          (v) => (v === undefined || v === null ? undefined : String(v)),
          z.string().optional(),
        )
        .optional(),
      checklist: z
        .array(z.preprocess((v) => String(v ?? '').trim(), z.string().min(1)))
        .min(2)
        .max(8),
      definitionOfDone: z.preprocess(
        (v) => String(v ?? '').trim(),
        z.string().min(1),
      ),
      pomodorosPlanned: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(6),
      ),
      priority: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      difficult: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      microTaskType: z.string().min(1),
      themeTag: z.string().min(1),
      contextTag: z.string().min(1),
      cognitiveMode: z.string().min(1),
      milestoneIndex: z
        .preprocess(
          (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
          z.number().int().min(1),
        )
        .optional(),
    })
    .passthrough();

  private readonly draftsSchema = z.array(this.draftSchema).min(1);

  private readonly draftOutlineSchema = z
    .object({
      name: z.string().min(1),
      pomodorosPlanned: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(6),
      ),
      priority: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      difficult: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1).max(4),
      ),
      microTaskType: z.string().min(1),
      themeTag: z.string().min(1),
      contextTag: z.string().min(1),
      cognitiveMode: z.string().min(1),
      milestoneIndex: z
        .preprocess(
          (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
          z.number().int().min(1),
        )
        .optional(),
    })
    .passthrough();

  private readonly draftOutlinesSchema = z.array(this.draftOutlineSchema).min(1);

  private readonly draftDetailsSchema = z
    .object({
      checklist: z
        .array(z.preprocess((v) => String(v ?? '').trim(), z.string().min(1)))
        .min(2)
        .max(8),
      definitionOfDone: z.preprocess((v) => String(v ?? '').trim(), z.string().min(1)),
      description: z
        .preprocess(
          (v) => (v === undefined || v === null ? undefined : String(v)),
          z.string().optional(),
        )
        .optional(),
    })
    .passthrough();

  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
    private readonly cacheService: CacheService,
  ) {}

  private getWbsGenerationModelOverride(): string | undefined {
    const m =
      this.safeEnv('WBS_GEMINI_MODEL') ||
      this.safeEnv('WBS_FAST_MODEL') ||
      this.safeEnv('WBS_MODEL_OVERRIDE');
    return m || undefined;
  }

  private safeEnv(name: string): string {
    const v = process.env[name];
    return String(v ?? '').trim();
  }

  private isTimingDebugEnabled(): boolean {
    const toggle = String(process.env.WBS_TIMING_DEBUG || '').trim().toLowerCase();
    return toggle === '1' || toggle === 'true' || toggle === 'yes';
  }

  private logWithTimestamp(message: string) {
    if (!this.isTimingDebugEnabled()) return;
    console.log(`[draft-generation][${new Date().toISOString()}] ${message}`);
  }

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  private isTwoPassEnabled(): boolean {
    const v = String(process.env.WBS_TWO_PASS_DETAILS || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private validateDraftOutlines(outlines: any[]): any[] {
    const parsed = this.draftOutlinesSchema.safeParse(outlines);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Outlines inválidos: ${issues}`);
    }
    return parsed.data as any;
  }

  private validateDraftDetails(details: any): { checklist: string[]; definitionOfDone: string; description?: string } {
    const parsed = this.draftDetailsSchema.safeParse(details);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Details inválidos: ${issues}`);
    }
    return parsed.data as any;
  }

  private getDetailsModelOverride(fallback?: string): string | undefined {
    // Default: keep same model as the rest of generation.
    // Opt-in: set WBS_DETAILS_MODEL to use a faster model only for the details stage.
    const v = this.safeEnv('WBS_DETAILS_MODEL');
    return v || fallback;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const limit = Math.max(1, Math.floor(concurrency || 1));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const runOne = async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        results[current] = await worker(items[current], current);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) {
      workers.push(runOne());
    }
    await Promise.all(workers);
    return results;
  }

  private isCacheDebugEnabled(): boolean {
    const v = String(process.env.WBS_CACHE_DEBUG || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private hashKey(input: any): string {
    const raw = typeof input === 'string' ? input : JSON.stringify(input);
    return createHash('sha1').update(raw).digest('hex').slice(0, 16);
  }

  private getProjectId(project: any): string {
    return String(project?._id || project?.id || project || '').trim();
  }

  private buildDraftsCacheKey(params: {
    prefix: 'drafts' | 'drafts_with_plan';
    projectId: string;
    fingerprint: any;
  }): string {
    const h = this.hashKey(params.fingerprint);
    return `${params.prefix}:${params.projectId}:${h}`;
  }

  validatePlannerPlan(plan: any): {
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  } {
    const parsed = this.plannerSchema.safeParse(plan);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Plano inválido: ${issues}`);
    }
    return parsed.data;
  }


  validateDrafts(drafts: any[]): Array<{
    name: string;
    description?: string;
    checklist: string[];
    definitionOfDone: string;
    pomodorosPlanned: number;
    priority: number;
    difficult: number;
    microTaskType: string;
    themeTag: string;
    contextTag: string;
    cognitiveMode: string;
  }> {
    const parsed = this.draftsSchema.safeParse(drafts);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Drafts inválidos: ${issues}`);
    }
    return parsed.data as any;
  }

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
    const resolvedModelOverride = params.modelOverride || this.getWbsGenerationModelOverride();
    const projectId = this.getProjectId(params.project);

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
        if (this.isCacheDebugEnabled()) {
          console.log('[draft-generation][cache] hit', {
            prefix: 'drafts_with_plan:plan',
            projectId,
            keyPrefix: planCacheKey.split(':').slice(0, 4).join(':'),
          });
        }
        return this.validatePlannerPlan(cachedPlan);
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
      return this.validatePlannerPlan(plan);
    };

    try {
      const plan = await attempt({ maxOutputTokens: 1200, temperature: 0.6 });
      if (projectId) {
        await this.cacheService.set(planCacheKey, plan);
        if (this.isCacheDebugEnabled()) {
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
          if (this.isCacheDebugEnabled()) {
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
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number },
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
    const projectId = this.getProjectId(params.project);
    const resolvedModelOverride = modelOverride || this.getWbsGenerationModelOverride();
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
        twoPass: this.safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: this.safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = this.buildDraftsCacheKey({ prefix: 'drafts', projectId, fingerprint });
      const cached = await this.cacheService.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length >= chunkMinutes.length) {
        if (this.isCacheDebugEnabled()) {
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

    const maxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL', 24);
    const baseMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);
    // resolvedModelOverride defined above (used for cache key too)

    const avoidTaskTitles: string[] = [];

    const twoPassEnabled = this.isTwoPassEnabled();
    const detailsConcurrency = this.getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
    const detailsMaxTokens = this.getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = this.getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);
    const modeLabel = twoPassEnabled ? 'two-pass' : 'single-pass';
    const overallStart = Date.now();
    this.logWithTimestamp(`generateMicroTasksDraftsForLeaf start mode=${modeLabel} chunks=${chunkMinutes.length}`);

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
      this.logWithTimestamp(`slice(${sliceMinutes.length}) start [${sliceMode}]`);
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
            const validated = this.validateDrafts(drafts);
            if (validated.length !== sliceMinutes.length) {
              throw new Error(`IA retornou ${validated.length} itens; esperado ${sliceMinutes.length}`);
            }
            return validated;
          };

          try {
            return await attempt({ maxOutputTokens: baseMaxTokens, temperature: 0.2 });
          } catch (err: any) {
            if (sliceMinutes.length > 1 && isJsonishError(err)) {
              const mid = Math.ceil(sliceMinutes.length / 2);
              const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
              const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
              return [...left, ...right];
            }

            if (isJsonishError(err)) {
              return await attempt({ maxOutputTokens: retryMaxTokens, temperature: 0.15 });
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
        const validated = this.validateDraftOutlines(outlines);
        if (validated.length !== sliceMinutes.length) {
          throw new Error(`IA retornou ${validated.length} outlines; esperado ${sliceMinutes.length}`);
        }
        return validated;
      };

      let outlines: any[];
      try {
        outlines = await attemptOutline({ maxOutputTokens: Math.min(baseMaxTokens, 1400), temperature: 0.2 });
      } catch (err: any) {
        if (sliceMinutes.length > 1 && isJsonishError(err)) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
          const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
          return [...left, ...right];
        }
        if (isJsonishError(err)) {
          outlines = await attemptOutline({ maxOutputTokens: Math.min(retryMaxTokens, 2000), temperature: 0.15 });
        } else {
          throw err;
        }
      }

      const detailsModelOverride = this.getDetailsModelOverride(resolvedModelOverride);
      const detailsBatchSize = this.getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
      const detailsBatchConcurrency =
        detailsBatchSize > 1
          ? this.getNumericEnv(
              'WBS_DETAILS_BATCH_CONCURRENCY',
              Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
            )
          : detailsConcurrency;
      const detailsBatchMaxTokens = this.getNumericEnv(
        'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
        Math.min(detailsMaxTokens * Math.max(1, detailsBatchSize), 3500),
      );
      const detailsBatchRetryMaxTokens = this.getNumericEnv(
        'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
        Math.min(detailsRetryMaxTokens * Math.max(1, detailsBatchSize), 5000),
      );

      if (detailsBatchSize > 1) {
        this.logWithTimestamp(
          `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
        );
      }

      const generateDetailsForBatch = async (
        batchOutlines: any[],
        batchMinutes: number[],
        depth = 0,
      ): Promise<Array<{ checklist: string[]; definitionOfDone: string; description?: string }>> => {
        if (batchOutlines.length !== batchMinutes.length) {
          throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
        }

        // When batchSize is 1, keep the old per-item prompt to minimize behavior changes.
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
            return [this.validateDraftDetails(details)];
          };

          try {
            return await attemptDetails({ maxOutputTokens: detailsMaxTokens, temperature: 0.15 });
          } catch (err: any) {
            const msg = String(err?.message || err || '').toLowerCase();
            const jsonish =
              msg.includes('json') || msg.includes('truncad') || msg.includes('parse') || msg.includes('object');
            if (jsonish) {
              return await attemptDetails({ maxOutputTokens: detailsRetryMaxTokens, temperature: 0.1 });
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
            throw new Error(`IA retornou ${detailsList.length} details; esperado ${batchOutlines.length}`);
          }
          return detailsList
            .slice(0, batchOutlines.length)
            .map((d) => this.validateDraftDetails(d));
        };

        try {
          return await attemptBatch({ maxOutputTokens: detailsBatchMaxTokens, temperature: 0.15 });
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
            return await attemptBatch({ maxOutputTokens: detailsBatchRetryMaxTokens, temperature: 0.1 });
          }
          throw err;
        }
      };

      let enriched: any[];
      if (detailsBatchSize <= 1) {
        enriched = await this.mapWithConcurrency(outlines, detailsConcurrency, async (outline, index) => {
          const details = await generateDetailsForBatch([outline], [sliceMinutes[index]]);
          return { ...outline, ...details[0] };
        });
      } else {
        const batches: Array<{ start: number; outlines: any[]; minutes: number[] }> = [];
        for (let i = 0; i < outlines.length; i += detailsBatchSize) {
          batches.push({
            start: i,
            outlines: outlines.slice(i, i + detailsBatchSize),
            minutes: sliceMinutes.slice(i, i + detailsBatchSize),
          });
        }

        const batchResults = await this.mapWithConcurrency(batches, detailsBatchConcurrency, async (b) => {
          const detailsList = await generateDetailsForBatch(b.outlines, b.minutes);
          return { start: b.start, detailsList };
        });

        enriched = new Array(outlines.length);
        for (const r of batchResults) {
          for (let j = 0; j < r.detailsList.length; j++) {
            const idx = r.start + j;
            enriched[idx] = { ...outlines[idx], ...r.detailsList[j] };
          }
        }
      }

        return this.validateDrafts(enriched);
      } finally {
        const elapsed = Date.now() - sliceStart;
        this.logWithTimestamp(`slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
      }
    };

    // Split into slices to avoid exceeding per-request limits
    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }

    const allDrafts: any[] = [];
    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const sliceDrafts = await generateDraftsForSlice(slices[sliceIdx]);
      allDrafts.push(...sliceDrafts);

      // Feed minimal continuity signal into the next prompt to reduce repetition.
      for (const draft of sliceDrafts) {
        const title = String(draft?.name || '').trim();
        if (title) avoidTaskTitles.push(title);
      }
    }

    const overallElapsed = Date.now() - overallStart;
    this.logWithTimestamp(`generateMicroTasksDraftsForLeaf end mode=${modeLabel} slices=${slices.length} total=${overallElapsed}ms`);
    const normalized = allDrafts.map((d, idx) => ({
      name: String(d.name || `Micro-tarefa (${idx + 1}/${chunkMinutes.length})`).trim(),
      description: String(d?.description || '').trim() || undefined,
      checklist: Array.isArray(d?.checklist)
        ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      definitionOfDone: String(d?.definitionOfDone || '').trim(),
      pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || 1)),
      priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
      difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
      microTaskType: normalizeMicroTaskType(d?.microTaskType),
      themeTag: String(d?.themeTag || '').trim() || undefined,
      contextTag: String(d?.contextTag || '').trim() || undefined,
      cognitiveMode: normalizeCognitiveMode(d?.cognitiveMode),
      milestoneIndex: d?.milestoneIndex,
    }));

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
        twoPass: this.safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: this.safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = this.buildDraftsCacheKey({ prefix: 'drafts', projectId, fingerprint });
      await this.cacheService.set(cacheKey, normalized as any);
      if (this.isCacheDebugEnabled()) {
        console.log('[draft-generation][cache] set', {
          prefix: 'drafts',
          projectId,
          items: normalized.length,
          keyPrefix: cacheKey.split(':').slice(0, 3).join(':'),
        });
      }
    }

    return normalized;
  }


  async generateMicroTasksDraftsForLeafWithPlan(
    params: {
      project: any;
      node: WBSNodeDto;
      currentPath: string;
      level: number;
      plan: any;
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
    const projectId = this.getProjectId(params.project);
    const resolvedModelOverride = params.modelOverride || this.getWbsGenerationModelOverride();
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
        twoPass: this.safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: this.safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = this.buildDraftsCacheKey({ prefix: 'drafts_with_plan', projectId, fingerprint });
      const cached = await this.cacheService.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length >= chunkMinutes.length) {
        if (this.isCacheDebugEnabled()) {
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

    // Keep sequential slices for quality; use a dedicated (tuneable) per-call size to reduce call count.
    const defaultNonPlanMaxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL', 24);
    const maxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL_WITH_PLAN', Math.min(8, defaultNonPlanMaxPerCall));
    const baseMaxTokens = this.getNumericEnv(
      'WBS_MAX_OUTPUT_TOKENS_WITH_PLAN',
      this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200),
    );
    const retryMaxTokens = this.getNumericEnv(
      'WBS_MAX_OUTPUT_TOKENS_RETRY_WITH_PLAN',
      this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500),
    );
    // resolvedModelOverride defined above (used for cache key too)

    const avoidTaskTitles: string[] = [];

    const twoPassEnabled = this.isTwoPassEnabled();
    const detailsConcurrency = this.getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
    const detailsMaxTokens = this.getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS', 900);
    const detailsRetryMaxTokens = this.getNumericEnv('WBS_DETAILS_MAX_OUTPUT_TOKENS_RETRY', 1400);

    const isJsonishError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return (
        msg.includes('json') ||
        msg.includes('truncad') ||
        msg.includes('incomplet') ||
        msg.includes('parse') ||
        msg.includes('array') ||
        msg.includes('object') ||
        msg.includes('salvag')
      );
    };

    const generateOutlinesForSlice = async (sliceMinutes: number[], depth = 0): Promise<any[]> => {
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
        const validated = this.validateDraftOutlines(outlines);
        if (validated.length < sliceMinutes.length) {
          throw new Error(`IA retornou ${validated.length} outlines; esperado ${sliceMinutes.length}`);
        }
        return validated;
      };

      try {
        return await attemptOutline({ maxOutputTokens: Math.min(baseMaxTokens, 1400), temperature: 0.2 });
      } catch (err1: any) {
        if (!isJsonishError(err1)) throw err1;

        if (sliceMinutes.length > 1 && depth < 4) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateOutlinesForSlice(sliceMinutes.slice(0, mid), depth + 1);
          const right = await generateOutlinesForSlice(sliceMinutes.slice(mid), depth + 1);
          return [...left, ...right];
        }

        return await attemptOutline({ maxOutputTokens: Math.min(retryMaxTokens, 2000), temperature: 0.15 });
      }
    };

    const generateDraftsFromOutlines = async (outlines: any[], sliceMinutes: number[]) => {
      const detailsModelOverride = this.getDetailsModelOverride(resolvedModelOverride);
      const detailsBatchSize = this.getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
      const detailsBatchConcurrency =
        detailsBatchSize > 1
          ? this.getNumericEnv(
              'WBS_DETAILS_BATCH_CONCURRENCY',
              Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
            )
          : detailsConcurrency;
      const detailsBatchMaxTokens = this.getNumericEnv(
        'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
        Math.min(detailsMaxTokens * Math.max(1, detailsBatchSize), 3500),
      );
      const detailsBatchRetryMaxTokens = this.getNumericEnv(
        'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
        Math.min(detailsRetryMaxTokens * Math.max(1, detailsBatchSize), 5000),
      );

      if (detailsBatchSize > 1) {
        this.logWithTimestamp(
          `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
        );
      }

      const generateDetailsForBatch = async (
        batchOutlines: any[],
        batchMinutes: number[],
        depth = 0,
      ): Promise<Array<{ checklist: string[]; definitionOfDone: string; description?: string }>> => {
        if (batchOutlines.length !== batchMinutes.length) {
          throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
        }

        if (batchOutlines.length === 1) {
          const detailsPrompt = this.promptBuilder.buildMicroTaskDetailsPrompt({
            ...params,
            targetMinutes: batchMinutes[0],
            outline: batchOutlines[0],
            plan: params.plan,
          });

          const attemptDetails = async (opts: { maxOutputTokens: number; temperature: number }) => {
            const response = await this.geminiService.generateContent(detailsPrompt, {
              model: detailsModelOverride,
              responseMimeType: 'application/json',
              maxOutputTokens: opts.maxOutputTokens,
              temperature: opts.temperature,
            });
            const details = extractJsonObject<any>(response);
            return [this.validateDraftDetails(details)];
          };

          try {
            return await attemptDetails({ maxOutputTokens: detailsMaxTokens, temperature: 0.15 });
          } catch (err: any) {
            const msg = String(err?.message || err || '').toLowerCase();
            const jsonish =
              msg.includes('json') || msg.includes('truncad') || msg.includes('parse') || msg.includes('object');
            if (jsonish) {
              return await attemptDetails({ maxOutputTokens: detailsRetryMaxTokens, temperature: 0.1 });
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
          plan: params.plan,
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
          return detailsList
            .slice(0, batchOutlines.length)
            .map((d) => this.validateDraftDetails(d));
        };

        try {
          return await attemptBatch({ maxOutputTokens: detailsBatchMaxTokens, temperature: 0.15 });
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
            return await attemptBatch({ maxOutputTokens: detailsBatchRetryMaxTokens, temperature: 0.1 });
          }
          throw err;
        }
      };

      let enriched: any[];
      if (detailsBatchSize <= 1) {
        enriched = await this.mapWithConcurrency(outlines, detailsConcurrency, async (outline, index) => {
          const details = await generateDetailsForBatch([outline], [sliceMinutes[index]]);
          return { ...outline, ...details[0] };
        });
      } else {
        const batches: Array<{ start: number; outlines: any[]; minutes: number[] }> = [];
        for (let i = 0; i < outlines.length; i += detailsBatchSize) {
          batches.push({
            start: i,
            outlines: outlines.slice(i, i + detailsBatchSize),
            minutes: sliceMinutes.slice(i, i + detailsBatchSize),
          });
        }

        const batchResults = await this.mapWithConcurrency(batches, detailsBatchConcurrency, async (b) => {
          const detailsList = await generateDetailsForBatch(b.outlines, b.minutes);
          return { start: b.start, detailsList };
        });

        enriched = new Array(outlines.length);
        for (const r of batchResults) {
          for (let j = 0; j < r.detailsList.length; j++) {
            const idx = r.start + j;
            enriched[idx] = { ...outlines[idx], ...r.detailsList[j] };
          }
        }
      }

      return this.validateDrafts(enriched);
    };

    const generateDraftsForSlice = async (sliceMinutes: number[], depth = 0): Promise<any[]> => {
      const sliceMode = twoPassEnabled ? 'two-pass-with-plan' : 'single-pass-with-plan';
      const sliceStart = Date.now();
      this.logWithTimestamp(`WithPlan slice(${sliceMinutes.length}) start [${sliceMode}]`);
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
            const validated = this.validateDrafts(drafts);
            if (validated.length < sliceMinutes.length) {
              const pct = (validated.length / sliceMinutes.length) * 100;
              if (validated.length > 0 && pct >= 60) {
                const remaining = sliceMinutes.slice(validated.length);
                if (remaining.length > 0 && depth < 3) {
                  console.warn(
                    `[draft-generation] Partial: ${validated.length}/${sliceMinutes.length} items (${pct.toFixed(0)}%). Completing tail...`,
                  );
                  const tail = await generateDraftsForSlice(remaining, depth + 1);
                  return [...validated, ...tail];
                }
                return validated;
              }
              throw new Error(`IA retornou ${validated.length} itens; esperado ${sliceMinutes.length}`);
            }
            return validated;
          };

          try {
            return await attempt({ maxOutputTokens: baseMaxTokens, temperature: 0.15 });
          } catch (err1: any) {
            if (!isJsonishError(err1)) throw err1;

            if (sliceMinutes.length > 1 && depth < 4) {
              const mid = Math.ceil(sliceMinutes.length / 2);
              const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid), depth + 1);
              const right = await generateDraftsForSlice(sliceMinutes.slice(mid), depth + 1);
              return [...left, ...right];
            }

            return await attempt({ maxOutputTokens: retryMaxTokens, temperature: 0.1 });
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
          const validated = this.validateDraftOutlines(outlines);
          if (validated.length < sliceMinutes.length) {
            throw new Error(`IA retornou ${validated.length} outlines; esperado ${sliceMinutes.length}`);
          }
          return validated;
        };

        let outlines: any[];
        try {
          outlines = await attemptOutline({ maxOutputTokens: Math.min(baseMaxTokens, 1400), temperature: 0.2 });
        } catch (err1: any) {
          if (!isJsonishError(err1)) throw err1;

          if (sliceMinutes.length > 1 && depth < 4) {
            const mid = Math.ceil(sliceMinutes.length / 2);
            const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid), depth + 1);
            const right = await generateDraftsForSlice(sliceMinutes.slice(mid), depth + 1);
            return [...left, ...right];
          }

          outlines = await attemptOutline({ maxOutputTokens: Math.min(retryMaxTokens, 2000), temperature: 0.15 });
        }

        const detailsModelOverride = this.getDetailsModelOverride(resolvedModelOverride);
        const detailsBatchSize = this.getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
        const detailsBatchConcurrency =
          detailsBatchSize > 1
            ? this.getNumericEnv(
                'WBS_DETAILS_BATCH_CONCURRENCY',
                Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
              )
            : detailsConcurrency;
        const detailsBatchMaxTokens = this.getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS',
          Math.min(detailsMaxTokens * Math.max(1, detailsBatchSize), 3500),
        );
        const detailsBatchRetryMaxTokens = this.getNumericEnv(
          'WBS_DETAILS_BATCH_MAX_OUTPUT_TOKENS_RETRY',
          Math.min(detailsRetryMaxTokens * Math.max(1, detailsBatchSize), 5000),
        );

        if (detailsBatchSize > 1) {
          this.logWithTimestamp(
            `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
          );
        }

        const generateDetailsForBatch = async (
          batchOutlines: any[],
          batchMinutes: number[],
          depth = 0,
        ): Promise<Array<{ checklist: string[]; definitionOfDone: string; description?: string }>> => {
          if (batchOutlines.length !== batchMinutes.length) {
            throw new Error('Details batch inválido: tamanho de batchMinutes não confere');
          }

          if (batchOutlines.length === 1) {
            const detailsPrompt = this.promptBuilder.buildMicroTaskDetailsPrompt({
              ...params,
              targetMinutes: batchMinutes[0],
              outline: batchOutlines[0],
              plan: params.plan,
            });

            const attemptDetails = async (opts: { maxOutputTokens: number; temperature: number }) => {
              const response = await this.geminiService.generateContent(detailsPrompt, {
                model: detailsModelOverride,
                responseMimeType: 'application/json',
                maxOutputTokens: opts.maxOutputTokens,
                temperature: opts.temperature,
              });
              const details = extractJsonObject<any>(response);
              return [this.validateDraftDetails(details)];
            };

            try {
              return await attemptDetails({ maxOutputTokens: detailsMaxTokens, temperature: 0.15 });
            } catch (err: any) {
              const msg = String(err?.message || err || '').toLowerCase();
              const jsonish =
                msg.includes('json') || msg.includes('truncad') || msg.includes('parse') || msg.includes('object');
              if (jsonish) {
                return await attemptDetails({ maxOutputTokens: detailsRetryMaxTokens, temperature: 0.1 });
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
            plan: params.plan,
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
            return detailsList
              .slice(0, batchOutlines.length)
              .map((d) => this.validateDraftDetails(d));
          };

          try {
            return await attemptBatch({ maxOutputTokens: detailsBatchMaxTokens, temperature: 0.15 });
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
              return await attemptBatch({ maxOutputTokens: detailsBatchRetryMaxTokens, temperature: 0.1 });
            }
            throw err;
          }
        };

        let enriched: any[];
        if (detailsBatchSize <= 1) {
          enriched = await this.mapWithConcurrency(outlines, detailsConcurrency, async (outline, index) => {
            const details = await generateDetailsForBatch([outline], [sliceMinutes[index]]);
            return { ...outline, ...details[0] };
          });
        } else {
          const batches: Array<{ start: number; outlines: any[]; minutes: number[] }> = [];
          for (let i = 0; i < outlines.length; i += detailsBatchSize) {
            batches.push({
              start: i,
              outlines: outlines.slice(i, i + detailsBatchSize),
              minutes: sliceMinutes.slice(i, i + detailsBatchSize),
            });
          }

          const batchResults = await this.mapWithConcurrency(batches, detailsBatchConcurrency, async (b) => {
            const detailsList = await generateDetailsForBatch(b.outlines, b.minutes);
            return { start: b.start, detailsList };
          });

          enriched = new Array(outlines.length);
          for (const r of batchResults) {
            for (let j = 0; j < r.detailsList.length; j++) {
              const idx = r.start + j;
              enriched[idx] = { ...outlines[idx], ...r.detailsList[j] };
            }
          }
        }

        return this.validateDrafts(enriched);
      } finally {
        const elapsed = Date.now() - sliceStart;
        this.logWithTimestamp(`WithPlan slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
      }
    };

    // Split into slices to avoid exceeding per-request limits
    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }
    const allDrafts: any[] = [];
    if (!twoPassEnabled) {
      for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
        const sliceDrafts = await generateDraftsForSlice(slices[sliceIdx]);
        allDrafts.push(...sliceDrafts);

        for (const draft of sliceDrafts) {
          const title = String(draft?.name || '').trim();
          if (title) avoidTaskTitles.push(title);
        }
      }
    } else {
      const detailsSliceConcurrency = this.getNumericEnv('WBS_DETAILS_SLICE_CONCURRENCY', 2);
      const running = new Set<Promise<any[]>>();
      const slicePromises: Array<Promise<any[]> | undefined> = new Array(slices.length);

      const schedule = (fn: () => Promise<any[]>) =>
        (async () => {
          while (running.size >= Math.max(1, detailsSliceConcurrency)) {
            await Promise.race(running);
          }
          const p = fn();
          running.add(p);
          try {
            return await p;
          } finally {
            running.delete(p);
          }
        })();

      this.logWithTimestamp(`WithPlan details slice concurrency=${Math.max(1, detailsSliceConcurrency)}`);

      for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
        const sliceMinutes = slices[sliceIdx];
        const sliceMode = 'two-pass-with-plan';
        const sliceStart = Date.now();
        this.logWithTimestamp(`WithPlan slice(${sliceMinutes.length}) start [${sliceMode}]`);

        const outlines = await generateOutlinesForSlice(sliceMinutes);

        // Update anti-repetition as soon as we have the titles (details do not affect titles).
        for (const o of outlines) {
          const title = String(o?.name || '').trim();
          if (title) avoidTaskTitles.push(title);
        }

        slicePromises[sliceIdx] = schedule(async () => {
          const drafts = await generateDraftsFromOutlines(outlines, sliceMinutes);
          return drafts;
        }).finally(() => {
          const elapsed = Date.now() - sliceStart;
          this.logWithTimestamp(`WithPlan slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
        });
      }

      const orderedResults = await Promise.all(slicePromises.map((p) => p ?? Promise.resolve([])));
      for (const sliceDrafts of orderedResults) {
        allDrafts.push(...sliceDrafts);
      }
    }

    const normalized = allDrafts.map((d, idx) => ({
      name: String(d.name || `Micro-tarefa (${idx + 1}/${chunkMinutes.length})`).trim(),
      description: String(d?.description || '').trim() || undefined,
      checklist: Array.isArray(d?.checklist)
        ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      definitionOfDone: String(d?.definitionOfDone || '').trim(),
      pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || 1)),
      priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
      difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
      microTaskType: normalizeMicroTaskType(d?.microTaskType),
      themeTag: String(d?.themeTag || '').trim() || undefined,
      contextTag: String(d?.contextTag || '').trim() || undefined,
      cognitiveMode: normalizeCognitiveMode(d?.cognitiveMode),
      milestoneIndex: d?.milestoneIndex,
    }));

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
        twoPass: this.safeEnv('WBS_TWO_PASS_DETAILS'),
        detailsModel: this.safeEnv('WBS_DETAILS_MODEL'),
      };
      const cacheKey = this.buildDraftsCacheKey({ prefix: 'drafts_with_plan', projectId, fingerprint });
      await this.cacheService.set(cacheKey, normalized as any);
      if (this.isCacheDebugEnabled()) {
        console.log('[draft-generation][cache] set', {
          prefix: 'drafts_with_plan',
          projectId,
          items: normalized.length,
          keyPrefix: cacheKey.split(':').slice(0, 3).join(':'),
        });
      }
    }

    return normalized;
  }
}
