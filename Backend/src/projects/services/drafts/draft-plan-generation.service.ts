import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { CacheService, PromptBuilderService, ThemeExtractionService } from '../wbs';
import { extractJsonObject } from '../wbs/utils/json-parser.util';
import {
  validatePlannerPlan,
  isCacheDebugEnabled,
  getProjectId,
  getWbsGenerationModelOverride,
  hashKey,
} from './utils/draft-generation-helpers.util';

@Injectable()
export class DraftPlanGenerationService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
    private readonly cacheService: CacheService,
  ) { }

  private hashKey(input: any): string {
    return hashKey(input);
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

    const prompt = this.promptBuilder.buildMicroTasksPrompt({
      ...params,
      chunkMinutes: params.chunkMinutes,
      avoidTaskTitles: [],
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
}
