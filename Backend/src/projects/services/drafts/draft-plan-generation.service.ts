import { Injectable } from '@nestjs/common';
import { CacheService, ThemeExtractionService } from '../wbs';
import {
  isCacheDebugEnabled,
  getProjectId,
  getWbsGenerationModelOverride,
  hashKey,
} from './utils/draft-generation-helpers.util';
import { WBSLeafPlanParamsDto, WBSLeafPlanResultDto } from '../../interfaces/drafts.interface';
import { DraftsAiService } from '../../../ai/drafts-ai.service';

@Injectable()
export class DraftPlanGenerationService {
  constructor(
    private readonly draftsAi: DraftsAiService,
    private readonly themeExtraction: ThemeExtractionService,
    private readonly cacheService: CacheService,
  ) {}

  private hashKey(input: any): string {
    return hashKey(input);
  }

  async generateMicroTasksPlanForLeaf(
    params: WBSLeafPlanParamsDto,
  ): Promise<WBSLeafPlanResultDto> {
    const resolvedModelOverride = params.modelOverride || getWbsGenerationModelOverride();
    const projectId = getProjectId(params.project);

    const planCacheKey = this.getCacheKey(params, resolvedModelOverride, projectId);

    const cachedPlan = await this.getCachedPlan(projectId, planCacheKey);
    if (cachedPlan) {
      return cachedPlan;
    }

    const themeHints = await this.themeExtraction.getThemeSuggestionsForLeaf({
      project: params.project,
      node: params.node,
    });

    const validated = await this.draftsAi.generatePlan(
      params,
      themeHints?.themes || [],
      resolvedModelOverride,
    );

    if (projectId && planCacheKey) {
      await this.cacheService.set(planCacheKey, validated);
    }

    return validated;
  }

  private getCacheKey(
    params: WBSLeafPlanParamsDto,
    resolvedModelOverride: string | undefined,
    projectId: string | undefined,
  ): string {
    if (!projectId) {
      return '';
    }
    const { project, node, ...rest } = params;
    const planFingerprint = {
      v: 1,
      kind: 'plan',
      nodeId: node?._id ? String(node._id) : undefined,
      nodeName: node?.name,
      nodeDesc: node?.description,
      estimatedHours: node?.estimatedHours,
      ...rest,
      model: resolvedModelOverride,
    };
    return `drafts_with_plan:${projectId}:plan:${this.hashKey(planFingerprint)}`;
  }

  private async getCachedPlan(projectId: string | undefined, planCacheKey: string): Promise<WBSLeafPlanResultDto | null> {
    if (!projectId || !planCacheKey) {
      return null;
    }
    const cachedPlan = await this.cacheService.get<WBSLeafPlanResultDto>(planCacheKey);
    if (cachedPlan) {
      if (isCacheDebugEnabled()) {
        console.log('[draft-generation][cache] hit', {
          prefix: 'plan',
          projectId,
          keyPrefix: planCacheKey.split(':').slice(0, 3).join(':'),
        });
      }
      return cachedPlan;
    }
    return null;
  }
}
