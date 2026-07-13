import { Injectable } from '@nestjs/common';
import { CacheService } from '../wbs';
import { WBSLeafGenerationContext, MicroTaskDraft, MicroTaskOutline, GenerateLeafDraftsDto } from '../../interfaces/drafts.interface';
import { DraftDetailsEnrichmentService } from './draft-details-enrichment.service';
import {
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
import { DraftsAiService } from '../../../ai/drafts-ai.service';

@Injectable()
export class DraftSinglePassGenerationService {
  constructor(
    private readonly draftsAi: DraftsAiService,
    private readonly cacheService: CacheService,
    private readonly detailsEnrichment: DraftDetailsEnrichmentService,
  ) { }

  async generateMicroTasksDraftsForLeaf(
    dto: GenerateLeafDraftsDto,
  ): Promise<MicroTaskDraft[]> {
    const { context, chunkMinutes, modelOverride } = dto;
    const projectId = getProjectId(context.project);
    const resolvedModelOverride = modelOverride || context.modelOverride || getWbsGenerationModelOverride();

    // 1. Check cache
    const cacheKey = this.checkCacheKey(projectId, context, chunkMinutes, resolvedModelOverride);
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

    // 2. Partition into slices and generate drafts via draftsAi
    const slices = this.partitionMinutesIntoSlices(chunkMinutes, maxPerCall);
    const allDrafts: MicroTaskDraft[] = [];

    for (const slice of slices) {
      let sliceDrafts: MicroTaskDraft[];
      if (!twoPassEnabled) {
        sliceDrafts = await this.draftsAi.generateSinglePassWithoutPlan(
          context,
          slice,
          avoidTaskTitles,
          resolvedModelOverride,
        );
      } else {
        const outlines = await this.draftsAi.generateOutlineWithoutPlan(
          context,
          slice,
          avoidTaskTitles,
          resolvedModelOverride,
        );
        const detailsModelOverride = getDetailsModelOverride(resolvedModelOverride);
        sliceDrafts = await this.detailsEnrichment.enrichOutlinesWithDetails({
          outlines,
          sliceMinutes: slice,
          params: context,
          detailsModelOverride,
        });
      }
      allDrafts.push(...sliceDrafts);
      for (const d of sliceDrafts) {
        if (d.name) avoidTaskTitles.push(d.name.trim());
      }
    }

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
    params: WBSLeafGenerationContext,
    chunkMinutes: number[],
    resolvedModelOverride: string | undefined,
  ): string {
    if (!projectId) return '';
    const { project, node, ...rest } = params;
    const fingerprint = {
      v: 1,
      kind: 'drafts',
      nodeId: node?._id ? String(node._id) : undefined,
      nodeName: node?.name,
      nodeDesc: node?.description,
      estimatedHours: node?.estimatedHours,
      ...rest,
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
  ): Promise<MicroTaskDraft[] | null> {
    if (!cacheKey || !projectId) return null;
    const cached = await this.cacheService.get<MicroTaskDraft[]>(cacheKey);
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

  private normalizeGeneratedDrafts(allDrafts: any[], expectedCount: number): MicroTaskDraft[] {
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
      microTaskType: d?.microTaskType || '',
      themeTag: d?.themeTag || '',
      contextTag: d?.contextTag || '',
      cognitiveMode: d?.cognitiveMode || '',
    }));
  }
}
