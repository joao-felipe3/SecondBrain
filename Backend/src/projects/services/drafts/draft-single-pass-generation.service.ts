import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { CacheService, PromptBuilderService } from '../wbs';
import { extractJsonArray } from '../wbs/utils/json-parser.util';
import { DraftDetailsEnrichmentService } from './draft-details-enrichment.service';
import {
  validateDraftOutlines,
  validateDrafts,
  buildDraftsCacheKey,
  getNumericEnv,
  safeEnv,
  logWithTimestamp,
  isTwoPassEnabled,
  isCacheDebugEnabled,
  getProjectId,
  getWbsGenerationModelOverride,
  getDetailsModelOverride,
} from './utils/draft-generation-helpers.util';

@Injectable()
export class DraftSinglePassGenerationService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly cacheService: CacheService,
    private readonly detailsEnrichment: DraftDetailsEnrichmentService,
  ) { }

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

    // 1. Resolve and check cache
    const cacheKey = this.checkCacheKey(projectId, params, chunkMinutes, resolvedModelOverride);
    const cached = await this.tryLoadFromCache(cacheKey, chunkMinutes.length, projectId);
    if (cached) return cached;

    const maxPerCall = getNumericEnv('WBS_MAX_PER_CALL', 24);
    const avoidTaskTitles: string[] = [];

    const twoPassEnabled = isTwoPassEnabled();
    const modeLabel = twoPassEnabled ? 'two-pass' : 'single-pass';
    const overallStart = Date.now();
    logWithTimestamp(
      `generateMicroTasksDraftsForLeaf start mode=${modeLabel} chunks=${chunkMinutes.length}`,
    );

    // 2. Partition into slices and generate drafts
    const slices = this.partitionMinutesIntoSlices(chunkMinutes, maxPerCall);
    const allDrafts = await this.generateAllSlices(slices, params, resolvedModelOverride, twoPassEnabled, avoidTaskTitles);

    const overallElapsed = Date.now() - overallStart;
    logWithTimestamp(
      `generateMicroTasksDraftsForLeaf end mode=${modeLabel} slices=${slices.length} total=${overallElapsed}ms`,
    );

    // 3. Normalize drafts, cache them, and return
    const normalized = this.normalizeGeneratedDrafts(allDrafts, chunkMinutes.length);
    if (projectId && cacheKey) {
      await this.cacheService.set(cacheKey, normalized);
    }

    return normalized;
  }

  private checkCacheKey(
    projectId: string,
    params: any,
    chunkMinutes: number[],
    resolvedModelOverride: string | undefined,
  ): string {
    if (!projectId) return '';
    const fingerprint = {
      v: 1,
      kind: 'drafts',
      nodeId: params.node?._id ? String(params.node._id) : undefined,
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
    return buildDraftsCacheKey({
      prefix: 'drafts',
      projectId,
      fingerprint,
    });
  }

  private async tryLoadFromCache(
    cacheKey: string,
    expectedCount: number,
    projectId: string,
  ): Promise<any[] | null> {
    if (!cacheKey || !projectId) return null;
    const cached = await this.cacheService.get<any[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length >= expectedCount) {
      if (isCacheDebugEnabled()) {
        console.log('[draft-generation][cache] hit', {
          prefix: 'drafts',
          projectId,
          items: cached.length,
          keyPrefix: cacheKey.split(':').slice(0, 3).join(':'),
        });
      }
      return cached.slice(0, expectedCount);
    }
    return null;
  }

  private partitionMinutesIntoSlices(chunkMinutes: number[], maxPerCall: number): number[][] {
    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }
    return slices;
  }

  private async generateAllSlices(
    slices: number[][],
    params: any,
    resolvedModelOverride: string | undefined,
    twoPassEnabled: boolean,
    avoidTaskTitles: string[],
  ): Promise<any[]> {
    const allDrafts: any[] = [];
    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const sliceDrafts = await this.generateDraftsForSlice(
        slices[sliceIdx],
        params,
        resolvedModelOverride,
        twoPassEnabled,
        avoidTaskTitles,
      );
      allDrafts.push(...sliceDrafts);

      for (const draft of sliceDrafts) {
        const title = String(draft?.name || '').trim();
        if (title) avoidTaskTitles.push(title);
      }
    }
    return allDrafts;
  }

  private normalizeGeneratedDrafts(allDrafts: any[], expectedCount: number): any[] {
    return allDrafts.map((d, idx) => ({
      name: String(d.name || `Micro-tarefa (${idx + 1}/${expectedCount})`).trim(),
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
  }

  private async generateDraftsForSlice(
    sliceMinutes: number[],
    params: any,
    resolvedModelOverride: string | undefined,
    twoPassEnabled: boolean,
    avoidTaskTitles: string[],
  ): Promise<any[]> {
    const sliceStart = Date.now();
    const sliceMode = twoPassEnabled ? 'two-pass' : 'single-pass';
    logWithTimestamp(`slice(${sliceMinutes.length}) start [${sliceMode}]`);

    try {
      if (!twoPassEnabled) {
        return await this.executeSinglePassSlice(sliceMinutes, params, resolvedModelOverride, avoidTaskTitles);
      } else {
        return await this.executeTwoPassSlice(sliceMinutes, params, resolvedModelOverride, avoidTaskTitles);
      }
    } finally {
      const elapsed = Date.now() - sliceStart;
      logWithTimestamp(`slice(${sliceMinutes.length}) end [${sliceMode}] ${elapsed}ms`);
    }
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

  private async executeSinglePassSlice(
    sliceMinutes: number[],
    params: any,
    resolvedModelOverride: string | undefined,
    avoidTaskTitles: string[],
  ): Promise<any[]> {
    const baseMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

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
      if (sliceMinutes.length > 1 && this.isJsonishError(err)) {
        const mid = Math.ceil(sliceMinutes.length / 2);
        const left = await this.executeSinglePassSlice(sliceMinutes.slice(0, mid), params, resolvedModelOverride, avoidTaskTitles);
        const right = await this.executeSinglePassSlice(sliceMinutes.slice(mid), params, resolvedModelOverride, avoidTaskTitles);
        return [...left, ...right];
      }

      if (this.isJsonishError(err)) {
        return await attempt({
          maxOutputTokens: retryMaxTokens,
          temperature: 0.15,
        });
      }
      throw err;
    }
  }

  private async executeTwoPassSlice(
    sliceMinutes: number[],
    params: any,
    resolvedModelOverride: string | undefined,
    avoidTaskTitles: string[],
  ): Promise<any[]> {
    const baseMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);

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
      if (sliceMinutes.length > 1 && this.isJsonishError(err)) {
        const mid = Math.ceil(sliceMinutes.length / 2);
        const left = await this.executeTwoPassSlice(sliceMinutes.slice(0, mid), params, resolvedModelOverride, avoidTaskTitles);
        const right = await this.executeTwoPassSlice(sliceMinutes.slice(mid), params, resolvedModelOverride, avoidTaskTitles);
        return [...left, ...right];
      }
      if (this.isJsonishError(err)) {
        outlines = await attemptOutline({
          maxOutputTokens: Math.min(retryMaxTokens, 2000),
          temperature: 0.15,
        });
      } else {
        throw err;
      }
    }

    const detailsModelOverride = getDetailsModelOverride(resolvedModelOverride);
    return await this.detailsEnrichment.enrichOutlinesWithDetails(outlines, sliceMinutes, params, detailsModelOverride);
  }
}
