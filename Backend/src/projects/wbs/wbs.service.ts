import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { GeminiService } from '../../tasks/gemini.service';
import { WBSNodeDocument } from '../schemas/wbs-node.schema';
import { WBSNodeDto, ValidateWBSResponseDto } from '../dto/wbs.dto';
import {
  TitleValidationService,
  MonotonyDetectionService,
  MonotonyFixService,
  PromptBuilderService,
  ThemeExtractionService,
} from './services';
import { extractJsonArray, extractJsonObject } from './utils/json-parser.util';
import {
  normalizeTitle,
  templateTitle,
  extractVerb,
  normalizePreferredPomodoros,
  normalizeMicroTaskType,
  normalizeCognitiveMode,
  mapMicroTaskTypeToCognitiveMode,
  mapCognitiveModeToContextTag,
  normalizeWorkflowTypes,
  mapCognitiveTypeToMicroTaskType,
} from './utils/normalizers.util';
import {
  computeChunkMinutes,
  computePertFromMinutes,
  estimateMicroTaskCount,
  computeBatchMetrics,
  cosineSimilarity,
  kMeansClusters,
  normalizeVector,
} from './utils/metrics-calculator.util';
import {
  MICRO_TASK_HARD_MAX_MINUTES,
  MAX_AI_LEAF_CALLS,
  EXTRA_FIX_BUDGET,
  MAX_TASKS_TO_CREATE,
  MAX_DUPLICATE_SCORE,
  MAX_SIMILARITY_SCORE,
  MIN_COGNITIVE_VARIETY,
  MAX_GENERIC_SERIES_RATE,
  MAX_SUFFIX_RATE,
} from './constants/wbs.constants';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

@Injectable()
export class WBSService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
    private readonly titleValidation: TitleValidationService,
    private readonly monotonyDetection: MonotonyDetectionService,
    private readonly monotonyFix: MonotonyFixService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
  ) {}

  // Micro-task sizing philosophy:
  // Prefer smaller ?daily? tasks (1?3 pomodoros) and only use 6 pomodoros (150min)
  // when strictly necessary to avoid generating an excessive number of tasks.
  private readonly microTaskMinMinutes = 25;
  private readonly microTaskPreferredMinutes = 50; // ~2 pomodoros
  private readonly microTaskSoftMaxMinutes = 60; // ~2-3 pomodoros
  private readonly microTaskHardMaxMinutes = 150; // 6 pomodoros (only if needed)
  private readonly microTaskMaxPerLeaf = 40;
  private readonly minEmbeddingTextLength = 180;
  private readonly minEmbeddingSegments = 3;
  private readonly maxEmbeddingClusters = 6;

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
      // description is optional/brief; checklist + definitionOfDone are the primary structured fields.
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

  /**
   * Generate a WBS from a SMART objective using Gemini
   */
  async generateWBS(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    summary?: string;
  }): Promise<WBSNodeDto[]> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

Baseado no objetivo SMART abaixo, gere uma WBS hierárquica CONCISA para o projeto.

Objetivo SMART:
- Específico: ${smartObjective.specific}
- Mensurável: ${smartObjective.measurable}
- Atingível: ${smartObjective.achievable}
- Relevante: ${smartObjective.relevant}
- Temporal: ${smartObjective.temporal}
${smartObjective.summary ? `- Resumo: ${smartObjective.summary}` : ''}

REGRAS IMPORTANTES:
1. A WBS deve ter MÁXIMO 3 níveis de profundidade
2. Inclua APENAS 3-4 entregas principais (nível 1)
3. Cada entrega deve ter 2-4 pacotes de trabalho (nível 2)
4. Evite nível 3 sempre que possível
5. Cada pacote de trabalho (nó folha) deve ter entre 8 e 80 horas estimadas (regra 8/80)
6. Nós intermediários: estimatedHours = soma dos filhos
7. Use nomes claros e descritivos mas CURTOS
8. Descrições BREVES (máximo 1 linha)

Retorne APENAS um array JSON válido e completo, sem texto adicional:
[
  {
    "name": "Nome da Entrega Principal",
    "description": "Descrição breve",
    "level": 1,
    "estimatedHours": 120,
    "order": 1,
    "children": [
      {
        "name": "Pacote de Trabalho",
        "description": "Descrição",
        "level": 2,
        "estimatedHours": 40,
        "order": 1,
        "children": [
          {
            "name": "Sub-pacote",
            "description": "Descrição",
            "level": 3,
            "estimatedHours": 20,
            "order": 1,
            "children": []
          }
        ]
      }
    ]
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return this.parseWBSFromResponse(response);
    } catch (error) {
      console.error('Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
    }
  }

  /**
   * Validate a single WBS node against the 8/80 rule
   */
  validateWBSNode(node: WBSNodeDto): ValidateWBSResponseDto {
    // Only validate leaf nodes (no children or empty children)
    const isLeaf = !node.children || node.children.length === 0;

    if (!isLeaf) {
      // Intermediate nodes: just check total consistency
      return { valid: true };
    }

    if (node.estimatedHours < 8) {
      return {
        valid: false,
        reason: `"${node.name}" é muito pequeno (${node.estimatedHours}h). Pacotes de trabalho devem ter no mínimo 8 horas. Combine com outras tarefas ou aumente o escopo.`,
      };
    }

    if (node.estimatedHours > 80) {
      return {
        valid: false,
        reason: `"${node.name}" é muito grande (${node.estimatedHours}h). Pacotes de trabalho devem ter no máximo 80 horas. Decomponha em sub-pacotes menores.`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate all nodes in the WBS tree and return all violations
   */
  validateWBS(nodes: WBSNodeDto[]): { valid: boolean; violations: ValidateWBSResponseDto[] } {
    const violations: ValidateWBSResponseDto[] = [];

    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const result = this.validateWBSNode(node);
        if (!result.valid) {
          violations.push(result);
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { valid: violations.length === 0, violations };
  }

  /**
   * Suggest how to decompose a node that violates the 8/80 rule
   */
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${node.estimatedHours > 80
  ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
  : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[
  {
    "name": "Nome do sub-pacote",
    "description": "Descrição",
    "estimatedHours": 20,
    "level": 3,
    "order": 1,
    "children": []
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return response;
    } catch (error) {
      console.error('Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
  }

  /**
   * Convert WBS leaf nodes into tasks for the project (legacy - kept for compatibility)
   */
  convertWBSToTasks(
    nodes: WBSNodeDto[],
    projectId: string,
  ): Array<{
    name: string;
    description: string;
    projectId: string;
    estimatedMinutes: number;
    priority: number;
    pomodorosPlanned: number;
  }> {
    const tasks: Array<{
      name: string;
      description: string;
      projectId: string;
      estimatedMinutes: number;
      priority: number;
      pomodorosPlanned: number;
    }> = [];

    let priorityCounter = 1;
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;

    const traverse = (nodeList: WBSNodeDto[], parentPath: string = '') => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes = computeChunkMinutes(totalMinutes);
          const chunks = chunkMinutes.length;

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];

            const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            tasks.push({
              name: `${node.name}${suffix}`,
              description: node.description
                ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`
                : `Origem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`,
              projectId,
              estimatedMinutes,
              priority: priorityCounter++,
              pomodorosPlanned,
            });
          }
        } else {
          traverse(node.children, currentPath);
        }
      }
    };

    traverse(nodes);
    return tasks;
  }

  /**
   * Convert WBS to tasks using TasksService.create() with AI enrichment
   * This creates more detailed and contextualized tasks with proper reward/experience calculation
   */
  async convertWBSToTasksWithAI(
    nodes: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: { create: (dto: any) => Promise<any> },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
    },
  ): Promise<any[]> {
    const createdTasks: any[] = [];
    const generationBatchId = randomUUID();
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;
    const preferredPomodoros = normalizePreferredPomodoros(preferences?.targetPomodoros);

    // Guardrails: avoid accidental explosions (e.g. thousands of tasks)
    const estimatedTotalTasks = estimateMicroTaskCount(nodes);
    const maxTasksToCreate = 1000;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Convers?o abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
          `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    // Calcular deadline base (distribuir tarefas ao longo do prazo do projeto)
    const projectDeadline = project.deadline ? new Date(project.deadline) : new Date();
    const today = new Date();
    const daysUntilDeadline = Math.max(7, Math.ceil((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    let taskCounter = 0;
    let aiLeafCalls = 0;
    const maxAiLeafCalls = 1000;

    const traverse = async (nodeList: WBSNodeDto[], parentPath: string = '', level: number = 1) => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          // Leaf node - criar micro-tarefas
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes: number[] = computeChunkMinutes(totalMinutes, {
            preferredPomodoros,
          });
          const chunks = chunkMinutes.length;

          // Prefer AI-generated, non-generic microtasks (batched per leaf).
          // Fallback to heuristic templates if AI fails or if we already hit a safety limit.
          let drafts: Array<{
            name: string;
            description?: string;
            pomodorosPlanned?: number;
            priority?: number;
            difficult?: number;
            microTaskType?: string;
            themeTag?: string;
            contextTag?: string;
            cognitiveMode?: string;
            milestoneIndex?: number;
          }> = [];

          const canUsePlannerGenerator = this.geminiService.supportsJsonMode();
          if (!canUsePlannerGenerator) {
            // When JSON-mode isn't supported (e.g., Gemma), planner/generator tends to truncate large JSON.
            // Prefer the legacy prompt path which is already batched/splittable.
            drafts = [];
          } else if (aiLeafCalls <= maxAiLeafCalls - 2) {
            try {
              const plan = await this.generateMicroTasksPlanForLeaf({
                project,
                node,
                currentPath,
                level,
                chunkMinutes,
                workflowMix: preferences?.workflowMix,
              });
              drafts = await this.generateMicroTasksDraftsForLeafWithPlan(
                { project, node, currentPath, level, plan },
                chunkMinutes,
              );
              aiLeafCalls += 2;
            } catch (err: any) {
              console.warn(`?? IA (Planner/Generator) falhou para "${node.name}". Tentando prompt antigo. Motivo: ${err?.message || err}`);
              drafts = [];
            }
          }

          if (!drafts.length && aiLeafCalls < maxAiLeafCalls) {
            try {
              drafts = await this.generateMicroTasksDraftsForLeaf(
                {
                  project,
                  node,
                  currentPath,
                  level,
                },
                chunkMinutes,
              );
              aiLeafCalls++;
            } catch (err: any) {
              throw new Error(`IA falhou para "${node.name}": ${err?.message || err}`);
            }
          }

          if (drafts.length !== chunks) {
            throw new Error(
              `IA retornou ${drafts.length} drafts para "${node.name}" mas esperava ${chunks}. ` +
              `Verifique o prompt ou tente novamente.`
            );
          }

          // From this point forward, drafts is guaranteed to be a concrete array.
          let leafDrafts = drafts as NonNullable<typeof drafts>;

          // Order matters: theme/workflow first, then enforce milestones/checkpoints, then dedupe.
          leafDrafts = this.applyThemeWorkflowAndProgression(leafDrafts, chunkMinutes);
          leafDrafts = this.applyGoldilocksAndMilestones(leafDrafts, chunkMinutes);
          // Sanitize before dedupe so forbidden patterns (e.g. 1/4) don't leak into saved titles.
          leafDrafts = leafDrafts.map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));

          // Pre-dedupe checks: catch duplicates that would otherwise be ?hidden? by suffix-based dedupe.
          const preDedupe = this.monotonyDetection.detectPreDedupeIssues(leafDrafts);

          leafDrafts = this.monotonyFix.dedupeCheckAndMitigate(leafDrafts);
          leafDrafts = leafDrafts.map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));

          const leafMetrics = computeBatchMetrics(
            leafDrafts.map((d: any) => ({
              name: d?.name,
              description: d?.description,
              themeTag: d?.themeTag,
              microTaskType: d?.microTaskType,
            })),
          );
          console.log(
            `[WBS→Tasks][Batch ${generationBatchId}] project=${projectId} ` +
              `leaf="${node.name}" total=${leafMetrics.total} ` +
              `dupScore=${leafMetrics.dupScore.toFixed(2)} ` +
              `similarScore=${leafMetrics.similarScore.toFixed(2)} ` +
              `verbVariety=${leafMetrics.verbVariety.toFixed(2)} ` +
              `cognitiveVariety=${leafMetrics.cognitiveVariety.toFixed(2)} ` +
              `themesCount=${leafMetrics.themesCount}`,
          );
          if (leafMetrics.dupScore >= 0.2 || leafMetrics.similarScore >= 0.35) {
            console.warn(
              `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ alerta monotonia: leaf="${node.name}" ` +
                `dupScore=${leafMetrics.dupScore.toFixed(2)} similarScore=${leafMetrics.similarScore.toFixed(2)}`,
            );
          }

          // Auto-fix monotony: regenerate only the problematic items (duplicates/templates/forbidden patterns).
          try {
            const issues = this.monotonyDetection.detectMonotonyIssues(leafDrafts);
            const genericSeries = this.monotonyDetection.detectGenericSeriesIssues(leafDrafts);
            const suffixIndices = leafDrafts
              .map((d, idx) => ({ idx, hasSuffix: String(d?.name || '').includes(' — ') }))
              .filter((x) => x.hasSuffix)
              .map((x) => x.idx);
            const forcedFixIndices = Array.from(
              new Set([...(preDedupe.forcedIndices || []), ...(suffixIndices || []), ...(genericSeries.indices || [])]),
            ).sort((a, b) => a - b);

            // Trigger stronger fix when dedupe had to add many suffixes or when bad title quality was detected.
            const suffixRate = leafDrafts.length ? suffixIndices.length / leafDrafts.length : 0;
            const severeGenericSeries = genericSeries.genericRate >= 0.25 && genericSeries.indices.length >= 2;
            const hasQualityIssues = preDedupe.badTitleCount > 0 || severeGenericSeries;
            const needsVarietyBoost = leafMetrics.cognitiveVariety < 0.18 || leafMetrics.themesCount <= 1;

            if (severeGenericSeries) {
              console.warn(
                `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ generic-series: leaf="${node.name}" ` +
                  `genericRate=${genericSeries.genericRate.toFixed(2)} ` +
                  `deliverable=${genericSeries.genericKinds.deliverable} ` +
                  `words=${genericSeries.genericKinds.words} minis=${genericSeries.genericKinds.minis}`,
              );
            }

            const shouldFix =
              (issues.badIndices.length > 0 || forcedFixIndices.length > 0) &&
              (
                issues.hasForbiddenPatterns ||
                leafMetrics.dupScore >= 0.2 ||
                leafMetrics.similarScore >= 0.35 ||
                suffixRate >= 0.15 ||
                hasQualityIssues ||
                needsVarietyBoost
              );

            // Keep a small extra budget for *fix-only* calls (generation still uses maxAiLeafCalls).
            const extraFixBudget = 2;
            const maxTotalFixCalls = maxAiLeafCalls + extraFixBudget;

            if (shouldFix && aiLeafCalls < maxTotalFixCalls) {
              const remainingCalls = Math.max(0, maxTotalFixCalls - aiLeafCalls);
              const maxCallsForFix = Math.min(2, remainingCalls);
              if (maxCallsForFix > 0) {
                const fixed = await this.monotonyFix.autoFixMonotonyForLeaf({
                  project,
                  node,
                  currentPath,
                  level,
                  chunkMinutes,
                  drafts: leafDrafts as any,
                  maxCalls: maxCallsForFix,
                  forceIndices: forcedFixIndices,
                });
                leafDrafts = fixed.drafts as any;
                leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));
                aiLeafCalls += fixed.aiCallsUsed;

                const fixedMetrics = computeBatchMetrics(
                  leafDrafts.map((d: any) => ({
                    name: d?.name,
                    description: d?.description,
                    themeTag: d?.themeTag,
                    microTaskType: d?.microTaskType,
                  })),
                );
                console.log(
                  `[WBS→Tasks][Batch ${generationBatchId}] auto-fix monotonia: leaf="${node.name}" ` +
                    `bad=${issues.badIndices.length} calls=${fixed.aiCallsUsed} ` +
                    `dupScore=${fixedMetrics.dupScore.toFixed(2)} similarScore=${fixedMetrics.similarScore.toFixed(2)}`,
                );

                // If we already re-generated once and problems persist, optionally escalate to a stronger model.
                // This is guarded by a small daily budget in GeminiService.
                if (fixed.aiCallsUsed > 0) {
                  const postIssues = this.monotonyDetection.detectMonotonyIssues(leafDrafts);
                  const postGeneric = this.monotonyDetection.detectGenericSeriesIssues(leafDrafts);
                  const stillSevereGeneric = postGeneric.genericRate >= 0.25 && postGeneric.indices.length >= 2;
                  const stillBad =
                    postIssues.hasForbiddenPatterns ||
                    fixedMetrics.similarScore >= 0.35 ||
                    fixedMetrics.dupScore >= 0.2 ||
                    stillSevereGeneric;

                  const strongModel = this.geminiService.getStrongModelName?.();
                  const shouldEscalate = Boolean(strongModel) && stillBad;

                  if (shouldEscalate && aiLeafCalls < maxTotalFixCalls) {
                    const remainingAfter = Math.max(0, maxTotalFixCalls - aiLeafCalls);
                    const maxStrongCalls = Math.min(1, remainingAfter);
                    if (maxStrongCalls > 0) {
                      const strongIndices = Array.from(
                        new Set([...(postIssues.badIndices || []), ...(postGeneric.indices || [])]),
                      ).sort((a, b) => a - b);
                      if (strongIndices.length) {
                        console.warn(
                          `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ escalando para strong model: leaf="${node.name}" ` +
                            `indices=${strongIndices.length} model="${strongModel}"`,
                        );
                        const strongFixed = await this.monotonyFix.autoFixMonotonyForLeaf({
                          project,
                          node,
                          currentPath,
                          level,
                          chunkMinutes,
                          drafts: leafDrafts as any,
                          maxCalls: maxStrongCalls,
                          forceIndices: strongIndices,
                          modelOverride: strongModel,
                        });
                        leafDrafts = strongFixed.drafts as any;
                        leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));
                        aiLeafCalls += strongFixed.aiCallsUsed;
                      }
                    }
                  }
                }
              }
            }

            // Even if we couldn't spend AI calls, enforce sanitization for forbidden fraction patterns.
            if (issues.hasForbiddenPatterns) {
              leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));
              leafDrafts = this.monotonyFix.dedupeCheckAndMitigate(leafDrafts as any);
              leafDrafts = (leafDrafts as any[]).map((d) => ({ ...d, name: this.titleValidation.sanitizeTitle(d?.name) }));
            }
          } catch (err: any) {
            console.warn(
              `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ auto-fix monotonia falhou para leaf="${node.name}": ${
                err?.message || err
              }`,
            );
          }

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            const draft = leafDrafts[chunkIndex] || ({} as any);
            // Prefer smaller pomodoro counts; let AI choose, otherwise derive from minutes.
            const derivedPomodoros = Math.ceil(estimatedMinutes / 25);
            const pomodorosPlanned = Math.max(
              1,
              Math.min(6, Number(draft.pomodorosPlanned) || derivedPomodoros),
            );

            // Deadline distribuído ao longo do prazo do projeto
            const progressRatio = estimatedTotalTasks <= 1 ? 0 : taskCounter / (estimatedTotalTasks - 1);
            const taskDaysOffset = Math.floor(progressRatio * daysUntilDeadline * 0.8);
            const taskDeadline = new Date(today);
            taskDeadline.setDate(taskDeadline.getDate() + taskDaysOffset);

            // Prioridade baseada na hierarquia WBS (níveis mais altos = mais urgente)
            const basePriority = Math.max(1, Math.min(4, 5 - level));
            const priority = Math.max(1, Math.min(4, Number(draft.priority) || basePriority));

            // Dificuldade: tenta IA, senão estima pela duração/escopo
            const estimatedDifficulty = estimatedMinutes >= 120 ? 3 : estimatedMinutes >= 60 ? 2 : 1;
            const difficult = Math.max(1, Math.min(4, Number(draft.difficult) || estimatedDifficulty));

            const pert = computePertFromMinutes(estimatedMinutes);

            // Description is optional/brief. Checklist + DoD are structured primary fields.
            const finalDescriptionRaw = String(draft.description || node.description || '').trim();
            const finalDescription = finalDescriptionRaw || undefined;

            const definitionOfDone =
              String((draft as any)?.definitionOfDone || '').trim() ||
              this.extractDefinitionOfDone(finalDescriptionRaw);

            const checklist = Array.isArray((draft as any)?.checklist)
              ? ((draft as any).checklist as any[])
                  .map((s) => String(s || '').trim())
                  .filter(Boolean)
              : this.extractChecklistSteps(finalDescriptionRaw);

            if (!definitionOfDone || !checklist || checklist.length < 2) {
              throw new Error(
                `Draft incompleto (faltando checklist/DoD) para leaf="${node.name}" chunk=${chunkIndex + 1}/${chunks}. ` +
                  `Verifique os prompts/JSON da IA.`,
              );
            }

            const name = String(draft.name || `${node.name}${suffix}`).trim();
            const microTaskType = normalizeMicroTaskType(draft.microTaskType);
            const cognitiveMode = normalizeCognitiveMode(
              draft.cognitiveMode || mapMicroTaskTypeToCognitiveMode(microTaskType),
            );
            const contextTag = String(
              draft.contextTag || mapCognitiveModeToContextTag(cognitiveMode),
            ).trim();
            const themeTag = String(draft.themeTag || '').trim();
            const themeTags = themeTag ? [themeTag] : undefined;
            const parentWbsNodeId = (node as any)?._id ? String((node as any)._id) : undefined;
            const milestoneId = draft?.milestoneIndex
              ? `${generationBatchId}:${parentWbsNodeId || node.name}:m${draft.milestoneIndex}`
              : undefined;

            try {
              const createdTask = await tasksService.create({
                name,
                description: finalDescription,
                definitionOfDone,
                checklist,
                project: projectId,
                pomodorosPlanned,
                pertOptimisticMinutes: pert.optimistic,
                pertMostLikelyMinutes: pert.mostLikely,
                pertPessimisticMinutes: pert.pessimistic,
                pertExpectedMinutes: pert.expected,
                pertVariance: pert.variance,
                deadline: taskDeadline,
                priority,
                difficult,
                isConcluded: false,
                late: false,
                recurrency: 'no',
                notification: taskDeadline,
                microTaskType,
                cognitiveMode,
                contextTag: contextTag || undefined,
                themeTag: themeTags,
                parentWbsNodeId,
                wbsPath: currentPath,
                generationBatchId,
                milestoneId,
              });

              createdTasks.push(createdTask);
              taskCounter++;
              console.log(
                `  ✅ Task ${taskCounter}: "${createdTask.name}" (${pomodorosPlanned} pomodoros, prioridade ${priority}, dificuldade ${difficult})`,
              );
            } catch (error: any) {
              console.error(`  ❌ Erro ao criar task "${name}":`, error?.message || error);
            }
          }
        } else {
          // Intermediate node - processar filhos
          await traverse(node.children, currentPath, level + 1);
        }
      }
    };

    await traverse(nodes);
    
    const batchMetrics = computeBatchMetrics(
      createdTasks.map((t: any) => ({
        name: t?.name,
        description: t?.description,
        themeTag: t?.themeTag,
        microTaskType: t?.microTaskType,
      })),
    );

    console.log(
      `[WBS→Tasks][Batch ${generationBatchId}] summary total=${batchMetrics.total} ` +
        `dupScore=${batchMetrics.dupScore.toFixed(2)} ` +
        `similarScore=${batchMetrics.similarScore.toFixed(2)} ` +
        `verbVariety=${batchMetrics.verbVariety.toFixed(2)} ` +
        `cognitiveVariety=${batchMetrics.cognitiveVariety.toFixed(2)} ` +
        `themesCount=${batchMetrics.themesCount}`,
    );
    if (batchMetrics.dupScore >= 0.2 || batchMetrics.similarScore >= 0.35) {
      console.warn(
        `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ alerta monotonia: ` +
          `dupScore=${batchMetrics.dupScore.toFixed(2)} similarScore=${batchMetrics.similarScore.toFixed(2)}`,
      );
    }

    console.log(`\n📊 Resumo da conversão:`);
    console.log(`   • Total de tasks: ${createdTasks.length}`);
    console.log(`   • Total de pomodoros: ${createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0)}`);
    console.log(`   • Horas estimadas: ${(createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0) * 0.5).toFixed(1)}h`);
    
    return createdTasks;
  }


  private inferCognitiveType(title?: string, description?: string): string {
    const text = `${title || ''} ${description || ''}`.toLowerCase();
    if (!text.trim()) return 'other';

    if (/(teste|testar|simulad|quiz|prova|avaliar|verificar|checagem)/i.test(text)) return 'test';
    if (/(revisar|review|reforç|consolidar|flashcard|recall)/i.test(text)) return 'review';
    if (/(escrever|redigir|produzir|criar|implementar|codificar|construir|diagramar|desenvolver)/i.test(text)) {
      return 'deep';
    }
    if (/(capturar|coletar|levantar|listar|mapear|pesquisar|ler|ouvir|anotar|preparar|organizar|configurar)/i.test(text)) {
      return 'capture';
    }

    return 'other';
  }

  private extractDefinitionOfDone(description?: string): string | undefined {
    if (!description) return undefined;

    // Accept common variants used by prompts and humans.
    // Examples:
    // - "Definição de pronto: ..."
    // - "Pronto quando: ..."
    const match = description.split(/(?:defini[cç][aã]o de pronto|pronto quando)\s*:/i);
    if (match.length < 2) return undefined;
    const trimmed = (match[1] || '').trim();
    return trimmed ? trimmed : undefined;
  }

  private extractChecklistSteps(description?: string): string[] | undefined {
    if (!description) return undefined;

    // Matches numbered steps like:
    // 1. Do X
    // 2) Do Y
    // 3 - Do Z
    const lines = String(description)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const steps: string[] = [];
    for (const line of lines) {
      // Stop if we reached a DoD marker section.
      if (/(?:defini[cç][aã]o de pronto|pronto quando)\s*:/i.test(line)) break;

      const m = line.match(/^\s*(\d{1,2})\s*(?:[\.)\-–—])\s*(.+)$/);
      if (m?.[2]) {
        steps.push(String(m[2]).trim());
      } else if (steps.length > 0) {
        // Continuation line after steps started: append to previous step.
        steps[steps.length - 1] = `${steps[steps.length - 1]} ${line}`.trim();
      }
    }

    // Only treat it as a checklist if we have at least 2 concrete steps.
    if (steps.length >= 2) return steps;
    return undefined;
  }

  private applyGoldilocksAndMilestones(
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
    chunkMinutes: number[],
  ) {
    const totalMinutes = chunkMinutes.reduce((sum, m) => sum + m, 0);
    const chunks = chunkMinutes.length;

    // Normalize first (keeps existing microTaskType/theme decisions when present)
    const normalized = drafts.map((d, idx) => this.normalizeDraft(d, idx, chunks));
    if (chunks <= 1) return normalized;

    // Milestones/checkpoints: every ~5h (within 4–6h) for big leaves.
    const milestoneRequired = totalMinutes >= 240; // 4h
    const milestoneEveryMinutes = 300; // 5h

    if (!milestoneRequired) return normalized;

    // Mark the chunk that crosses each milestone boundary as a checkpoint.
    const checkpointIndices = new Set<number>();
    if (milestoneRequired) {
      let cumulative = 0;
      let nextBoundary = milestoneEveryMinutes;
      for (let i = 0; i < chunks; i++) {
        cumulative += chunkMinutes[i];
        while (cumulative >= nextBoundary) {
          checkpointIndices.add(i);
          nextBoundary += milestoneEveryMinutes;
        }
      }
      // Ensure closure.
      checkpointIndices.add(chunks - 1);
    }

    // Assign milestoneIndex per task based on cumulative minutes.
    let cumulative = 0;
    return normalized.map((d, idx) => {
      cumulative += chunkMinutes[idx];
      const milestoneIndex = Math.max(1, Math.ceil(cumulative / milestoneEveryMinutes));

      if (milestoneRequired && checkpointIndices.has(idx)) {
        const checkpointType = milestoneIndex % 2 === 0 ? 'consolidate' : 'test';
        const cognitiveMode = normalizeCognitiveMode(
          d.cognitiveMode || mapMicroTaskTypeToCognitiveMode(checkpointType),
        );
        return {
          ...d,
          milestoneIndex,
          microTaskType: checkpointType,
          cognitiveMode,
          contextTag: String(d.contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
        };
      }

      return {
        ...d,
        milestoneIndex,
      };
    });
  }

  private applyThemeWorkflowAndProgression(
    drafts: Array<{
      name: string;
      description?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    }>,
    chunkMinutes: number[],
  ) {
    if (!drafts.length) return drafts;

    const byTheme = new Map<string, number[]>();
    drafts.forEach((d, idx) => {
      const theme = String(d.themeTag || '').trim() || '__no_theme__';
      if (!byTheme.has(theme)) byTheme.set(theme, []);
      byTheme.get(theme)!.push(idx);
    });

    const buildThemeWorkflow = (total: number): string[] => {
      if (total <= 1) return ['practice'];
      if (total === 2) return ['prepare', 'produce'];
      if (total === 3) return ['prepare', 'practice', 'produce'];
      const base = ['prepare', 'practice', 'produce', 'test'];
      while (base.length < total) base.splice(base.length - 1, 0, 'practice');
      return base.slice(0, total);
    };

    const progressiveMode = (index: number, total: number): string => {
      if (total <= 1) return 'medium';
      if (index === 0) return 'low';
      if (index === total - 1) return 'high';
      return 'medium';
    };

    for (const [theme, indices] of byTheme.entries()) {
      if (theme === '__no_theme__') continue;
      const total = indices.length;
      if (total <= 1) continue;
      const workflow = buildThemeWorkflow(total);

      indices.forEach((idx, localIdx) => {
        const microTaskType = normalizeMicroTaskType(workflow[localIdx]);
        const cognitiveMode = normalizeCognitiveMode(progressiveMode(localIdx, total));
        drafts[idx] = {
          ...drafts[idx],
          microTaskType,
          cognitiveMode,
          contextTag:
            String(drafts[idx].contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
        };
      });
    }

    return drafts;
  }

  private normalizeDraft(
    d: {
      name: string;
      description?: string;
      checklist?: string[];
      definitionOfDone?: string;
      pomodorosPlanned?: number;
      priority?: number;
      difficult?: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      milestoneIndex?: number;
    },
    idx: number,
    total: number,
  ) {
    const normalizedDescription = String(d.description || '').trim();
    const normalizedChecklist = Array.isArray(d.checklist)
      ? d.checklist.map((s) => String(s || '').trim()).filter(Boolean)
      : undefined;
    const normalizedDefinitionOfDone = String(d.definitionOfDone || '').trim();

    const microTaskType = normalizeMicroTaskType(d.microTaskType);
    const cognitiveMode = normalizeCognitiveMode(
      d.cognitiveMode || mapMicroTaskTypeToCognitiveMode(microTaskType),
    );
    return {
      ...d,
      name: String(d.name || `Micro-tarefa (${idx + 1}/${total})`).trim(),
      description: normalizedDescription || undefined,
      checklist:
        normalizedChecklist && normalizedChecklist.length >= 2
          ? normalizedChecklist
          : this.extractChecklistSteps(normalizedDescription),
      definitionOfDone:
        normalizedDefinitionOfDone || this.extractDefinitionOfDone(normalizedDescription),
      microTaskType,
      cognitiveMode,
      contextTag: String(d.contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
    };
  }


  private validatePlannerPlan(plan: any): {
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
      throw new Error(`Plano inv?lido: ${issues}`);
    }
    return parsed.data;
  }

  private validateDrafts(drafts: any[]): Array<{
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
      throw new Error(`Drafts inv?lidos: ${issues}`);
    }
    return parsed.data as any;
  }






  private async generateMicroTasksDraftsForLeaf(
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number },
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
    // Generate in batches to avoid JSON truncation (common when JSON-mode is unsupported).
    const maxPerCall = 8;

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
      const prompt = this.promptBuilder.buildMicroTasksPrompt({
        ...params,
        chunkMinutes: sliceMinutes,
      });

      const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
        const response = await this.geminiService.generateContent(prompt, {
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
        // Prefer lower temperature to reduce verbosity/rambling.
        return await attempt({ maxOutputTokens: 1600, temperature: 0.3 });
      } catch (err: any) {
        // If JSON is truncated or malformed, split the request into smaller slices.
        if (sliceMinutes.length > 1 && isJsonishError(err)) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid));
          const right = await generateDraftsForSlice(sliceMinutes.slice(mid));
          return [...left, ...right];
        }

        // Last try: slightly higher token budget and stricter temperature.
        if (isJsonishError(err)) {
          return await attempt({ maxOutputTokens: 2200, temperature: 0.15 });
        }
        throw err;
      }
    };

    const validatedDrafts: any[] = [];
    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      const sliceDrafts = await generateDraftsForSlice(sliceMinutes);
      validatedDrafts.push(...sliceDrafts);
    }

    if (validatedDrafts.length !== chunkMinutes.length) {
      throw new Error(`IA retornou ${validatedDrafts.length} itens; esperado ${chunkMinutes.length}`);
    }

    // Normalize
    return validatedDrafts.map((d: any, idx: number) => {
      const targetMinutes = chunkMinutes[idx];
      const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
      const normalizedName = String(d?.name || `${params.node.name} (${idx + 1}/${chunkMinutes.length})`).trim();
      const inferredType = normalizeMicroTaskType(
        d?.microTaskType || mapCognitiveTypeToMicroTaskType(this.inferCognitiveType(normalizedName, d?.description)),
      );
      const inferredMode = normalizeCognitiveMode(
        d?.cognitiveMode || mapMicroTaskTypeToCognitiveMode(inferredType),
      );
      const inferredContext =
        String(d?.contextTag || mapCognitiveModeToContextTag(inferredMode)).trim() || undefined;
      return {
        name: normalizedName,
        description: String(d?.description || '').trim() || undefined,
        checklist: Array.isArray(d?.checklist)
          ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
          : [],
        definitionOfDone: String(d?.definitionOfDone || '').trim(),
        pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || fallbackPomodoros)),
        priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
        difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
        microTaskType: inferredType,
        themeTag: String(d?.themeTag || '').trim() || undefined,
        contextTag: inferredContext,
        cognitiveMode: inferredMode,
      };
    });
  }

  private async generateMicroTasksPlanForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    workflowMix?: Record<string, number>;
  }): Promise<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> {
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
      // Common with models that don't support JSON mode or when output is truncated.
      if (/json/i.test(msg) || /truncad|incomplet|parse/i.test(msg)) {
        return await attempt({ maxOutputTokens: 2200, temperature: 0.2 });
      }
      throw err;
    }
  }

  private async generateMicroTasksDraftsForLeafWithPlan(
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number; plan: any },
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
    // Generate in batches to avoid JSON truncation on big leaves.
    const maxPerCall = 10;
    const out: Array<any> = [];

    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      const slicedPlan = {
        ...params.plan,
        workflow: Array.isArray(params.plan?.workflow)
          ? params.plan.workflow.slice(start, end)
          : params.plan?.workflow,
      };

      const prompt = this.promptBuilder.buildMicroTasksGeneratorPrompt({
        project: params.project,
        node: params.node,
        currentPath: params.currentPath,
        level: params.level,
        chunkMinutes: sliceMinutes,
        plan: slicedPlan,
      });

      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 1800,
      });

      const drafts = extractJsonArray<any>(response);
      const validatedDrafts = this.validateDrafts(drafts);

      if (validatedDrafts.length !== sliceMinutes.length) {
        throw new Error(`IA retornou ${validatedDrafts.length} itens; esperado ${sliceMinutes.length}`);
      }

      const mapped = validatedDrafts.map((d: any, localIdx: number) => {
        const globalIdx = start + localIdx;
        const targetMinutes = chunkMinutes[globalIdx];
        const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
        const normalizedName = String(
          d?.name || `${params.node.name} (${globalIdx + 1}/${chunkMinutes.length})`,
        ).trim();
        const inferredType = normalizeMicroTaskType(
          d?.microTaskType ||
            mapCognitiveTypeToMicroTaskType(
              this.inferCognitiveType(normalizedName, d?.description),
            ),
        );
        const inferredMode = normalizeCognitiveMode(
          d?.cognitiveMode || mapMicroTaskTypeToCognitiveMode(inferredType),
        );
        const inferredContext =
          String(d?.contextTag || mapCognitiveModeToContextTag(inferredMode)).trim() || undefined;

        return {
          name: normalizedName,
          description: String(d?.description || '').trim() || undefined,
          checklist: Array.isArray(d?.checklist)
            ? (d.checklist as any[]).map((s) => String(s || '').trim()).filter(Boolean)
            : [],
          definitionOfDone: String(d?.definitionOfDone || '').trim(),
          pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || fallbackPomodoros)),
          priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
          difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
          microTaskType: inferredType,
          themeTag: String(d?.themeTag || '').trim() || undefined,
          contextTag: inferredContext,
          cognitiveMode: inferredMode,
        };
      });

      out.push(...mapped);
    }

    return out;
  }


  /**
   * Save WBS nodes to the database
   */
  async saveWBS(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    console.log(`🗑️  Deletando WBS antiga do projeto ${projectId}...`);
    const deleteResult = await this.wbsNodeModel.deleteMany({ projectId }).exec();
    console.log(`✅ ${deleteResult.deletedCount} nós deletados`);

    const savedNodes: WBSNodeDocument[] = [];

    // Limpar _id de todos os nós recursivamente antes de salvar
    const cleanNodeIds = (nodeList: WBSNodeDto[]): WBSNodeDto[] => {
      return nodeList.map(node => {
        const { _id, ...cleanNode } = node as any;
        return {
          ...cleanNode,
          children: node.children && node.children.length > 0 
            ? cleanNodeIds(node.children)
            : []
        };
      });
    };

    const cleanedNodes = cleanNodeIds(nodes);
    console.log(`🧹 IDs antigos removidos, salvando ${cleanedNodes.length} nós raiz`);

    const saveRecursive = async (
      nodeList: WBSNodeDto[],
      parentId: string | null = null,
      level = 1,
    ) => {
      for (const node of nodeList) {
        const doc = new this.wbsNodeModel({
          projectId,
          name: node.name,
          description: node.description || '',
          level: level, // ✅ Usa o level da recursão, não do node
          parentId,
          estimatedHours: node.estimatedHours,
          order: node.order || 0,
          status: 'planned',
        });

        const saved = await doc.save();
        savedNodes.push(saved);
        
        const savedId = String(saved._id);
        console.log(`  ${'  '.repeat(level - 1)}✅ Salvo level ${level}: "${node.name}" (ID: ${savedId}) parentId: ${parentId || 'null'}`);

        if (node.children && node.children.length > 0) {
          await saveRecursive(node.children, savedId, level + 1);
        }
      }
    };

    await saveRecursive(cleanedNodes);
    console.log(`💾 ${savedNodes.length} nós salvos no banco de dados`);
    return savedNodes;
  }

  /**
   * Get WBS for a project, reconstructed as a tree
   */
  async getWBS(projectId: string): Promise<WBSNodeDto[]> {
    const allNodes = await this.wbsNodeModel
      .find({ projectId })
      .sort({ level: 1, order: 1 })
      .exec();

    console.log(`🔍 Encontrados ${allNodes.length} nós no banco para projeto ${projectId}`);

    if (allNodes.length === 0) return [];

    // Build tree from flat list
    const nodeMap = new Map<string, WBSNodeDto & { _id: string }>();
    const roots: (WBSNodeDto & { _id: string })[] = [];

    // Primeiro, adiciona todos os nós ao mapa
    for (const doc of allNodes) {
      const node: WBSNodeDto & { _id: string } = {
        _id: String(doc._id), // ✅ Converte ObjectId para string
        name: doc.name,
        description: doc.description,
        level: doc.level,
        parentId: doc.parentId || undefined,
        estimatedHours: doc.estimatedHours,
        order: doc.order,
        children: [],
      };
      nodeMap.set(node._id, node);
    }

    // Depois, constrói a hierarquia
    for (const node of nodeMap.values()) {
      if (node.parentId) {
        // Tem pai - adiciona como filho
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children!.push(node);
        } else {
          console.warn(`⚠️ Nó órfão encontrado: "${node.name}" (level ${node.level}) - parentId não existe: ${node.parentId}`);
          // Nós órfãos são ignorados - não devem aparecer como raiz
        }
      } else {
        // Não tem pai - deve ser raiz (level 1)
        if (node.level === 1) {
          roots.push(node);
        } else {
          console.warn(`⚠️ Nó inválido: "${node.name}" (level ${node.level}) sem parentId - deveria ser level 1`);
        }
      }
    }

    console.log(`🌳 Reconstruídos ${roots.length} nós raiz válidos`);
    return roots;
  }

  /**
   * Parse WBS JSON from Gemini response (handling markdown code blocks)
   */
  private parseWBSFromResponse(response: string): WBSNodeDto[] {
    try {
      let cleanResponse = response.trim();

      // Remove markdown code blocks
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```(?:json)?\s*/, '')
          .replace(/```\s*$/, '');
      }

      cleanResponse = cleanResponse.trim();
      
      // Check if response looks truncated (incomplete JSON)
      if (!cleanResponse.endsWith(']') && !cleanResponse.endsWith('}')) {
        console.warn('Response appears truncated:', cleanResponse.substring(cleanResponse.length - 100));
        throw new Error('Resposta da IA foi truncada. Tente simplificar o objetivo SMART ou divida em etapas menores.');
      }

      const parsed = JSON.parse(cleanResponse);

      if (!Array.isArray(parsed)) {
        throw new Error('WBS response is not an array');
      }

      return this.normalizeWBSNodes(parsed, 1);
    } catch (error) {
      console.error('Erro ao fazer parse da WBS:', error);
      console.error('Resposta recebida (primeiros 500 chars):', response.substring(0, 500));
      console.error('Resposta recebida (últimos 200 chars):', response.substring(Math.max(0, response.length - 200)));
      
      if (error.message && error.message.includes('truncada')) {
        throw error;
      }
      throw new Error('Não foi possível processar a WBS gerada pela IA. A resposta pode estar incompleta ou mal formatada.');
    }
  }

  /**
   * Normalize and validate parsed WBS nodes
   */
  private normalizeWBSNodes(nodes: any[], level: number): WBSNodeDto[] {
    return nodes.map((node, index) => ({
      name: node.name || `Entrega ${index + 1}`,
      description: node.description || '',
      level,
      estimatedHours: typeof node.estimatedHours === 'number' ? node.estimatedHours : 0,
      order: node.order || index + 1,
      children: node.children && Array.isArray(node.children)
        ? this.normalizeWBSNodes(node.children, level + 1)
        : [],
    }));
  }
}
