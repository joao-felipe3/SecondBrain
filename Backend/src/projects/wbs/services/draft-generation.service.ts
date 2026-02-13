import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { z } from 'zod';
import { GeminiService } from '../../../tasks/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { PromptBuilderService, ThemeExtractionService } from './index';
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

  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
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

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  private isTimingDebugEnabled(): boolean {
    const v = String(process.env.WBS_TIMING_DEBUG || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private cacheBackendName(): 'redis' | 'memory' {
    return 'memory'; // Placeholder
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
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      const plan = extractJsonObject<any>(response);
      return this.validatePlannerPlan(plan);
    };

    try {
      return await attempt({ maxOutputTokens: 1200, temperature: 0.6 });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/json/i.test(msg) || /truncad|incomplet|parse/i.test(msg)) {
        return await attempt({ maxOutputTokens: 2200, temperature: 0.2 });
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
    const maxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL', 24);
    const baseMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const retryMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500);
    const resolvedModelOverride = modelOverride || this.getWbsGenerationModelOverride();

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

    const generateDraftsForSlice = async (sliceMinutes: number[], sliceIndex?: number): Promise<any[]> => {
      const prompt = this.promptBuilder.buildMicroTasksPrompt({
        ...params,
        chunkMinutes: sliceMinutes,
      });

      const sliceStart = Date.now();

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
        const out = await attempt({ maxOutputTokens: baseMaxTokens, temperature: 0.2 });
        return out;
      } catch (err: any) {
        // If JSON is truncated, split into smaller slices
        if (sliceMinutes.length > 1 && isJsonishError(err)) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid), sliceIndex);
          const right = await generateDraftsForSlice(sliceMinutes.slice(mid), sliceIndex);
          return [...left, ...right];
        }

        // Final retry with larger token budget
        if (isJsonishError(err)) {
          const out = await attempt({ maxOutputTokens: retryMaxTokens, temperature: 0.15 });
          return out;
        }
        throw err;
      }
    };

    // Split into slices to avoid exceeding per-request limits
    const slices: number[][] = [];
    for (let i = 0; i < chunkMinutes.length; i += maxPerCall) {
      slices.push(chunkMinutes.slice(i, i + maxPerCall));
    }

    const allDrafts: any[] = [];
    for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
      const sliceDrafts = await generateDraftsForSlice(slices[sliceIdx], sliceIdx);
      allDrafts.push(...sliceDrafts);
    }

    return allDrafts.map((d, idx) => ({
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
    const baseMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200);
    const resolvedModelOverride = params.modelOverride || this.getWbsGenerationModelOverride();

    const prompt = this.promptBuilder.buildMicroTasksGeneratorPrompt({
      ...params,
      chunkMinutes,
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
      if (validated.length !== chunkMinutes.length) {
        throw new Error(`IA retornou ${validated.length} itens; esperado ${chunkMinutes.length}`);
      }
      return validated;
    };

    try {
      return await attempt({ maxOutputTokens: baseMaxTokens, temperature: 0.3 });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/json|truncad|incomplet|parse|array|object/i.test(msg)) {
        return await attempt({ maxOutputTokens: baseMaxTokens * 1.5, temperature: 0.2 });
      }
      throw err;
    }
  }
}
