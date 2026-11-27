import { Injectable } from '@nestjs/common';
import { CacheService } from '../wbs/shared/cache.service';
import {
  WBSLeafWithPlanGenerationContext,
  MicroTaskDraft,
  MicroTaskOutline,
  GenerateLeafDraftsWithPlanDto,
} from '../../interfaces/drafts.interface';
import { DraftDetailsEnrichmentService } from './draft-details-enrichment.service';
import {
  buildDraftsCacheKey,
  resolvePomodoros,
  getNumericEnv,
  safeEnv,
  logWithTimestamp,
  isTwoPassEnabled,
  isCacheDebugEnabled,
  getProjectId,
  getWbsGenerationModelOverride,
  getDetailsModelOverride,
  safeString,
  safeStringOrUndefined,
} from './utils/draft-generation-helpers.util';
import { DraftsAiService } from '../../../ai/services/tasks/drafts-ai.service';
import { taskTitleKey } from '../wbs/utils/normalizers.util';

// Quantas vezes pedir de novo só as micro-tarefas cujo título repete um já usado.
const MAX_UNIQUENESS_RETRIES = 2;

@Injectable()
export class DraftWithPlanGenerationService {
  constructor(
    private readonly draftsAi: DraftsAiService,
    private readonly cacheService: CacheService,
    private readonly detailsEnrichment: DraftDetailsEnrichmentService,
  ) {}

  async generateMicroTasksDraftsForLeafWithPlan(
    dto: GenerateLeafDraftsWithPlanDto,
  ): Promise<MicroTaskDraft[]> {
    const { context, chunkMinutes, avoidTaskTitles: seedTitles } = dto;
    const projectId = getProjectId(context.project);
    const resolvedModelOverride = context.modelOverride || getWbsGenerationModelOverride();

    // 1. Check cache (complemento de pacote parte de tarefas já existentes: nunca usa cache)
    const isCompletion = Array.isArray(seedTitles) && seedTitles.length > 0;
    const cacheKey = isCompletion
      ? ''
      : this.checkCacheKey(projectId, context, chunkMinutes, resolvedModelOverride);
    const cached = await this.tryLoadFromCache(cacheKey, chunkMinutes.length, projectId);
    if (cached) return cached;

    const maxPerCall = getNumericEnv('WBS_MAX_PER_CALL', 24);
    const avoidTaskTitles: string[] = isCompletion ? [...seedTitles] : [];

    const twoPassEnabled = isTwoPassEnabled();
    const modeLabel = twoPassEnabled ? 'two-pass' : 'single-pass';
    const overallStart = Date.now();
    logWithTimestamp(
      `generateMicroTasksDraftsForLeafWithPlan start mode=${modeLabel} chunks=${chunkMinutes.length}`,
    );

    // 2. Partition into slices and generate drafts via draftsAi
    const slices = this.partitionMinutesIntoSlices(chunkMinutes, maxPerCall);
    const allDrafts: MicroTaskDraft[] = [];

    for (const slice of slices) {
      let sliceDrafts: MicroTaskDraft[];
      if (!twoPassEnabled) {
        sliceDrafts = await this.draftsAi.generateSinglePassWithPlan(
          context,
          slice,
          avoidTaskTitles,
          resolvedModelOverride,
        );
      } else {
        const firstOutlines = await this.draftsAi.generateOutlineWithPlan(
          context,
          slice,
          avoidTaskTitles,
          resolvedModelOverride,
        );
        const outlines = await this.ensureUniqueOutlines({
          context,
          outlines: firstOutlines,
          slice,
          avoidTaskTitles,
          modelOverride: resolvedModelOverride,
        });
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
      `generateMicroTasksDraftsForLeafWithPlan end mode=${modeLabel} slices=${slices.length} total=${overallElapsed}ms`,
    );

    // 3. Normalize drafts, cache them, and return
    const normalized = this.normalizeGeneratedDrafts(allDrafts, chunkMinutes);
    if (projectId && cacheKey) {
      await this.cacheService.set(cacheKey, normalized);
    }

    return normalized;
  }

  /**
   * O prompt de anti-repetição é só um pedido: o modelo ainda devolve títulos iguais aos já
   * usados (ou iguais entre si). Aqui isso é verificado de forma determinística e só as
   * micro-tarefas repetidas são pedidas de novo, com todos os títulos proibidos.
   */
  private async ensureUniqueOutlines(p: {
    context: WBSLeafWithPlanGenerationContext;
    outlines: MicroTaskOutline[];
    slice: number[];
    avoidTaskTitles: string[];
    modelOverride?: string;
  }): Promise<MicroTaskOutline[]> {
    const current = [...p.outlines];
    for (let attempt = 0; attempt < MAX_UNIQUENESS_RETRIES; attempt++) {
      const seen = new Set(p.avoidTaskTitles.map((t) => taskTitleKey(t)).filter(Boolean));
      const repeatedIdx: number[] = [];
      current.forEach((o, i) => {
        const key = taskTitleKey(o.name);
        if (key && seen.has(key)) repeatedIdx.push(i);
        else if (key) seen.add(key);
      });
      if (repeatedIdx.length === 0) break;

      logWithTimestamp(`outlines repetidos=${repeatedIdx.length} tentativa=${attempt + 1}`);
      try {
        const fresh = await this.draftsAi.generateOutlineWithPlan(
          p.context,
          repeatedIdx.map((i) => p.slice[i]),
          [...p.avoidTaskTitles, ...current.map((o) => o.name)],
          p.modelOverride,
        );
        repeatedIdx.forEach((slot, j) => {
          current[slot] = fresh[j];
        });
      } catch {
        break; // mantém os títulos atuais; a auditoria automática ainda sinaliza a repetição
      }
    }
    return current;
  }

  private checkCacheKey(
    projectId: string,
    params: WBSLeafWithPlanGenerationContext,
    chunkMinutes: number[],
    resolvedModelOverride: string | undefined,
  ): string {
    if (!projectId) return '';
    const { node, ...rest } = params;
    const fingerprint = {
      v: 3, // v3: pomodoros derivados da duração-alvo do chunk
      kind: 'drafts_with_plan',
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
      prefix: 'drafts_with_plan',
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
          prefix: 'drafts_with_plan',
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

  private normalizeGeneratedDrafts(
    allDrafts: Partial<MicroTaskDraft>[],
    chunkMinutes: number[],
  ): MicroTaskDraft[] {
    const expectedCount = chunkMinutes.length;
    return allDrafts.map((d, idx) => {
      const name = safeString(d.name).trim() || `Micro-tarefa (${idx + 1}/${expectedCount})`;
      const description = safeStringOrUndefined(d.description);
      const checklist = Array.isArray(d.checklist)
        ? d.checklist.map((s) => safeString(s).trim()).filter(Boolean)
        : [];
      const definitionOfDone = safeString(d.definitionOfDone).trim();
      const pomodorosPlanned = resolvePomodoros(d.pomodorosPlanned, chunkMinutes[idx]);
      const priority = Math.max(1, Math.min(4, Number(d.priority) || 2));
      const difficult = Math.max(1, Math.min(4, Number(d.difficult) || 2));
      const microTaskType = safeString(d.microTaskType);
      const themeTag = safeString(d.themeTag);
      const contextTag = safeString(d.contextTag);
      const cognitiveMode = safeString(d.cognitiveMode);

      return {
        name,
        description,
        checklist,
        definitionOfDone,
        pomodorosPlanned,
        priority,
        difficult,
        microTaskType,
        themeTag,
        contextTag,
        cognitiveMode,
      };
    });
  }
}
