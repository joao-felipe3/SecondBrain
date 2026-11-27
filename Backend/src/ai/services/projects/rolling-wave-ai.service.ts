import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../core/gemini.service';
import { buildSliceGoalsPrompt, SliceGoalsPromptPackage } from '../../prompts';
import { extractJsonObject } from '../../../projects/services/wbs/utils/json-parser.util';
import { getWbsGenerationModelOverride } from '../../../projects/services/drafts/utils/draft-generation-helpers.util';

/** Pacotes por chamada: a resposta é curta (só objetivos), mas lotes menores falham menos. */
const PACKAGES_PER_CALL = 12;

export interface DescribeSlicesParams {
  projectName: string;
  projectSummary?: string;
  /** Pacotes com 2+ fatias, já agrupados na ordem da WBS. */
  packages: Array<SliceGoalsPromptPackage & { branchKey: string }>;
}

@Injectable()
export class RollingWaveAIService {
  private readonly logger = new Logger(RollingWaveAIService.name);

  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Objetivo de cada fatia, por pacote (id do pacote → objetivos em ordem).
   * Pacotes cuja resposta falhar ou vier com quantidade errada ficam de fora; quem chama
   * mantém o objetivo provisório ("Parte n/m") para eles.
   */
  async describeSlices(params: DescribeSlicesParams): Promise<Map<string, string[]>> {
    const goals = new Map<string, string[]>();
    for (const batch of this.buildBatches(params.packages)) {
      try {
        const prompt = buildSliceGoalsPrompt({
          projectName: params.projectName,
          projectSummary: params.projectSummary,
          packages: batch,
        });
        const response = await this.geminiService.generateContent(prompt, {
          model: getWbsGenerationModelOverride(),
          responseMimeType: 'application/json',
          temperature: 0.3,
        });
        const parsed = extractJsonObject<{ packages?: Array<{ id?: unknown; goals?: unknown }> }>(
          response,
        );
        const expected = new Map(batch.map((p) => [p.id, p.sliceHours.length]));
        for (const item of parsed?.packages ?? []) {
          const id = typeof item?.id === 'string' ? item.id : '';
          const list = Array.isArray(item?.goals)
            ? item.goals.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean)
            : [];
          if (expected.has(id) && list.length === expected.get(id)) {
            goals.set(
              id,
              list.map((g) => (g.length > 160 ? `${g.slice(0, 157)}...` : g)),
            );
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[describeSlices] lote de ${batch.length} pacotes falhou: ${msg}`);
      }
    }
    return goals;
  }

  /** Lotes por frente de trabalho (ramo de nível 1), com no máximo PACKAGES_PER_CALL pacotes. */
  private buildBatches(
    packages: DescribeSlicesParams['packages'],
  ): Array<DescribeSlicesParams['packages']> {
    const byBranch = new Map<string, DescribeSlicesParams['packages']>();
    for (const pkg of packages) {
      const list = byBranch.get(pkg.branchKey) ?? [];
      list.push(pkg);
      byBranch.set(pkg.branchKey, list);
    }
    const batches: Array<DescribeSlicesParams['packages']> = [];
    for (const list of byBranch.values()) {
      for (let i = 0; i < list.length; i += PACKAGES_PER_CALL) {
        batches.push(list.slice(i, i + PACKAGES_PER_CALL));
      }
    }
    return batches;
  }
}
