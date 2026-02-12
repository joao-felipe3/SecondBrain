import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { GeminiService } from '../../tasks/gemini.service';
import { WBSNodeDocument } from '../schemas/wbs-node.schema';
import { WBSNodeDto, ValidateWBSResponseDto } from '../dto/wbs.dto';
import {
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
    private readonly monotonyDetection: MonotonyDetectionService,
    private readonly monotonyFix: MonotonyFixService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly themeExtraction: ThemeExtractionService,
  ) {
    // Optional Redis cache initialization (if REDIS_URL provided and ioredis installed)
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        // Dynamically require to avoid hard dependency at compile-time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const IORedis = require('ioredis');
        this.redisClient = new IORedis(redisUrl);
        console.log('[WBSService] Redis cache enabled');
      }
    } catch (err) {
      // Redis not available — fallback to in-memory cache
      this.redisClient = null;
    }
  }

  // Simple in-memory cache as fallback: key -> { value, exp }
  private draftsCache = new Map<string, { value: any[]; exp: number }>()
  private redisClient: any = null
  private cacheTTLSeconds = 60 * 60 * 24 // 24h

  private isCacheDebugEnabled(): boolean {
    const v = String(process.env.WBS_CACHE_DEBUG || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  }

  private cacheBackendName(): 'redis' | 'memory' {
    return this.redisClient ? 'redis' : 'memory'
  }

  private logCache(event: 'hit' | 'miss' | 'set' | 'clear', key: string, extra?: Record<string, any>): void {
    if (!this.isCacheDebugEnabled()) return
    const payload = {
      backend: this.cacheBackendName(),
      keyPrefix: String(key).split(':').slice(0, 3).join(':'),
      keyLen: String(key).length,
      ...(extra || {}),
    }
    // eslint-disable-next-line no-console
    console.log(`[WBSService][cache:${event}]`, payload)
  }

  private nowIso(): string {
    return new Date().toISOString()
  }

  private isTimingDebugEnabled(): boolean {
    const v = String(process.env.WBS_TIMING_DEBUG || '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  }

  private isVerboseTaskLogsEnabled(): boolean {
    const raw = String(process.env.WBS_VERBOSE_TASK_LOGS || '').trim().toLowerCase()
    // default: verbose ON
    if (!raw) return true
    return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off')
  }

  private getWbsGenerationModelOverride(): string | undefined {
    const m =
      this.safeEnv('WBS_GEMINI_MODEL') ||
      this.safeEnv('WBS_FAST_MODEL') ||
      this.safeEnv('WBS_MODEL_OVERRIDE')
    return m || undefined
  }

  private getNumericEnv(name: string, fallback: number): number {
    const raw = this.safeEnv(name)
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.floor(n)
  }

  private safeEnv(name: string): string {
    const v = process.env[name]
    return String(v ?? '').trim()
  }

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
   * Extract all leaf nodes from WBS tree with their full paths
   * Used for interactive task generation
   */
  getLeafNodesWithPaths(nodes: WBSNodeDto[]): Array<{
    node: WBSNodeDto;
    path: string;
    level: number;
  }> {
    const leafNodes: Array<{ node: WBSNodeDto; path: string; level: number }> = [];

    const traverse = (nodeList: WBSNodeDto[], parentPath: string = '', level: number = 1) => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
        const isLeaf = !node.children || node.children.length === 0;

        if (isLeaf) {
          leafNodes.push({
            node,
            path: currentPath,
            level,
          });
        } else if (node.children) {
          traverse(node.children, currentPath, level + 1);
        }
      }
    };

    traverse(nodes);
    return leafNodes;
  }

  /**
   * Generate tasks for a single leaf node only (interactive mode)
   * Returns generated tasks without saving (caller decides when to save)
   */
  async generateTasksForSingleLeaf(
    leafNode: WBSNodeDto,
    nodePath: string,
    projectId: string,
    project: any,
    tasksService: { create: (dto: any) => Promise<any> },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
      modelOverride?: string;
    },
    saveTasks: boolean = false,
  ): Promise<{
    tasks: any[];
    leafNode: WBSNodeDto;
    nodePath: string;
    estimatedHours: number;
    generatedHours: number;
    pomodorosGenerated: number;
  }> {
    const generatedTasks: any[] = [];
    const generationBatchId = randomUUID();
    const preferredPomodoros = normalizePreferredPomodoros(preferences?.targetPomodoros);
    const modelOverride = preferences?.modelOverride || this.getWbsGenerationModelOverride();
    
    console.log(`\n🔄 [generateTasksForSingleLeaf] Iniciando geração`);
    console.log(`   📍 Pacote: "${leafNode.name}" (${nodePath})`);
    console.log(`   ⏱️  Orçado: ${leafNode.estimatedHours}h`);
    console.log(`   🧠 Modelo: ${modelOverride || 'padrão do sistema'}`);
    console.log(`   🍅 Pomodoros preferido: ${preferredPomodoros}`);
    
    const projectDeadline = project.deadline ? new Date(project.deadline) : new Date();
    const today = new Date();
    const daysUntilDeadline = Math.max(7, Math.ceil((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    console.log(`\n🔄 Gerando micro-tarefas para: "${leafNode.name}"`);
    console.log(`   📍 Path: ${nodePath}`);
    console.log(`   ⏱️  Horas estimadas: ${leafNode.estimatedHours}h`);

    const totalMinutes = Math.max(0, Math.round((leafNode.estimatedHours || 0) * 60));
    const chunkMinutes: number[] = computeChunkMinutes(totalMinutes, { preferredPomodoros });
    const chunks = chunkMinutes.length;

    console.log(`   🔢 Dividido em: ${chunks} micro-tarefas`);

    // Generate drafts for this leaf
    let drafts: Array<any> = [];
    const canUsePlannerGenerator = this.geminiService.supportsJsonMode();
    if (!canUsePlannerGenerator) {
      // Gemma (and other models without JSON mode) will frequently fail/truncate planner JSON.
      // Skipping planner avoids long retries and makes interactive mode as fast as automatic.
      drafts = await this.generateMicroTasksDraftsForLeaf(
        { project, node: leafNode, currentPath: nodePath, level: leafNode.level },
        chunkMinutes,
        modelOverride,
      );
    } else {
      try {
        const plan = await this.generateMicroTasksPlanForLeaf({
          project,
          node: leafNode,
          currentPath: nodePath,
          level: leafNode.level,
          chunkMinutes,
          workflowMix: preferences?.workflowMix,
          modelOverride,
        });

        drafts = await this.generateMicroTasksDraftsForLeafWithPlan(
          { project, node: leafNode, currentPath: nodePath, level: leafNode.level, plan, modelOverride },
          chunkMinutes,
        );
      } catch (err: any) {
        console.warn(`⚠️ Planner falhou, usando prompt legado`);
        drafts = await this.generateMicroTasksDraftsForLeaf(
          { project, node: leafNode, currentPath: nodePath, level: leafNode.level },
          chunkMinutes,
          modelOverride,
        );
      }
    }

    // Apply processing pipeline
    drafts = this.applyThemeWorkflowAndProgression(drafts, chunkMinutes);
    drafts = this.applyGoldilocksAndMilestones(drafts, chunkMinutes);
    drafts = this.monotonyFix.dedupeCheckAndMitigate(drafts);

    let pomodorosAccumulated = 0;

    // Create or prepare tasks
    const leafTaskDtos: any[] = [];
    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      const estimatedMinutes = chunkMinutes[chunkIndex];
      const draft = drafts[chunkIndex] || {};
      
      const derivedPomodoros = Math.ceil(estimatedMinutes / 25);
      const pomodorosPlanned = Math.max(1, Math.min(6, Number(draft.pomodorosPlanned) || derivedPomodoros));
      pomodorosAccumulated += pomodorosPlanned;

      const progressRatio = chunks <= 1 ? 0 : chunkIndex / (chunks - 1);
      const taskDaysOffset = Math.floor(progressRatio * daysUntilDeadline * 0.8);
      const taskDeadline = new Date(today);
      taskDeadline.setDate(taskDeadline.getDate() + taskDaysOffset);

      const basePriority = Math.max(1, Math.min(4, 5 - leafNode.level));
      const priority = Math.max(1, Math.min(4, Number(draft.priority) || basePriority));

      const estimatedDifficulty = estimatedMinutes >= 120 ? 3 : estimatedMinutes >= 60 ? 2 : 1;
      const difficult = Math.max(1, Math.min(4, Number(draft.difficult) || estimatedDifficulty));

      const pert = computePertFromMinutes(estimatedMinutes);

      const finalDescriptionRaw = String(draft.description || leafNode.description || '').trim();
      const finalDescription = finalDescriptionRaw || undefined;
      const definitionOfDone = String(draft?.definitionOfDone || '').trim() || this.extractDefinitionOfDone(finalDescriptionRaw);
      const checklist = Array.isArray(draft?.checklist)
        ? draft.checklist.map((s: any) => String(s || '').trim()).filter(Boolean)
        : this.extractChecklistSteps(finalDescriptionRaw);

      const name = String(draft.name || `${leafNode.name} (${chunkIndex + 1}/${chunks})`).trim();
      const microTaskType = normalizeMicroTaskType(draft.microTaskType);
      const cognitiveMode = normalizeCognitiveMode(draft.cognitiveMode || mapMicroTaskTypeToCognitiveMode(microTaskType));
      const contextTag = String(draft.contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim();
      const themeTag = String(draft.themeTag || '').trim();
      const themeTags = themeTag ? [themeTag] : undefined;
      const parentWbsNodeId = (leafNode as any)?._id ? String((leafNode as any)._id) : undefined;

      const taskData = {
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
        wbsPath: nodePath,
        generationBatchId,
      };

      if (saveTasks) {
        leafTaskDtos.push(taskData);
      } else {
        // Just prepare task data without saving
        generatedTasks.push(taskData);
        if (this.isVerboseTaskLogsEnabled()) {
          console.log(`     📝 Draft ${chunkIndex + 1}/${chunks}: "${name}"`);
        }
      }
    }

    if (saveTasks && leafTaskDtos.length > 0) {
      try {
        if (typeof (tasksService as any).createMany === 'function') {
          const created = await (tasksService as any).createMany(leafTaskDtos, {
            resolveProject: false,
            recalculateProjectStats: false,
          });
          for (const createdTask of created) {
            generatedTasks.push(createdTask);
          }
          console.log(`     ✅ ${created.length}/${leafTaskDtos.length} tasks criadas em lote`);
        } else {
          // Fallback: sequential create()
          for (let i = 0; i < leafTaskDtos.length; i++) {
            const taskData = leafTaskDtos[i];
            try {
              const createdTask = await tasksService.create(taskData);
              generatedTasks.push(createdTask);
              console.log(`     ✅ Task ${i + 1}/${leafTaskDtos.length}: "${createdTask.name}"`);
            } catch (error: any) {
              console.error(`     ❌ Erro ao criar task "${taskData?.name}":`, error?.message || error);
            }
          }
        }
      } catch (error: any) {
        console.error(`     ❌ Erro ao criar tasks em lote:`, error?.message || error);
      }
    }

    const generatedHours = pomodorosAccumulated * 0.5;
    const leafBudgetHours = Number(leafNode.estimatedHours || 0);
    const diffHours = generatedHours - leafBudgetHours;
    const diffPct = leafBudgetHours > 0 ? (diffHours / leafBudgetHours) * 100 : 0;
    console.log(
      `   ✅ ${generatedTasks.length} micro-tarefas geradas (~${generatedHours.toFixed(1)}h) ` +
        `vs orçamento ${leafBudgetHours.toFixed(1)}h (${diffHours >= 0 ? '+' : ''}${diffHours.toFixed(1)}h, ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(0)}%)`,
    );

    console.log(`\n✨ [generateTasksForSingleLeaf] CONCLUÍDO`);
    console.log(`   🎯 Modelo utilizado: ${modelOverride || 'padrão do sistema'}`);
    console.log(`   📦 Total de tasks: ${generatedTasks.length}`);
    console.log(`   ⏱️  Horas geradas: ${generatedHours.toFixed(1)}h`);
    console.log(`   📊 Batch ID: ${generationBatchId}\n`);

    return {
      tasks: generatedTasks,
      leafNode,
      nodePath,
      estimatedHours: leafNode.estimatedHours,
      generatedHours,
      pomodorosGenerated: pomodorosAccumulated,
    };
}

  /**
   * Audit a discrepancy between a WBS leaf estimate and its generated micro-tasks.
   * Goal: decide whether it's likely underestimation vs gold-plating, and suggest an action.
   */
  async auditLeafDiscrepancy(
    project: any,
    dto: {
      leafNode: WBSNodeDto;
      nodePath: string;
      generatedHours: number;
      tasks: Array<{
        name: string;
        pomodorosPlanned: number;
        priority?: number;
        microTaskType?: string;
        themeTag?: string;
        contextTag?: string;
        cognitiveMode?: string;
      }>;
    },
  ): Promise<{
    diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
    rationale: string;
    suggestedAction: 'rebaseline' | 'simplify';
    suggestedEstimatedHours?: number;
  }> {
    const budgetHours = Number(dto?.leafNode?.estimatedHours || 0);
    const generatedHours = Number(dto?.generatedHours || 0);
    const diffPct = budgetHours > 0 ? ((generatedHours - budgetHours) / budgetHours) * 100 : 0;

    // Heuristics to reduce "always mixed + always rebaseline" outcomes.
    // We compute basic repetition/duplication indicators and bias the auditor towards
    // "gold_plating" + "simplify" when repetition is high.
    const normalizeTaskKey = (name: string): string => {
      const raw = String(name || '').trim().toLowerCase();
      const withoutCounters = raw.replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g, '').trim();
      const noMarks = withoutCounters
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return noMarks;
    };

    const taskList = Array.isArray(dto?.tasks) ? dto.tasks : [];
    const keyCounts = new Map<string, number>();
    for (const t of taskList) {
      const key = normalizeTaskKey(String(t?.name || ''));
      if (!key) continue;
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }
    const duplicatesRemovedIfDedupe = Array.from(keyCounts.values()).reduce(
      (sum, c) => sum + Math.max(0, c - 1),
      0,
    );
    const duplicateRatio = taskList.length > 0 ? duplicatesRemovedIfDedupe / taskList.length : 0;
    const topDuplicateKeys = Array.from(keyCounts.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, c]) => `${k}×${c}`)
      .join(', ');

    const repetitionMetrics = computeBatchMetrics(
      taskList.map((t: any) => ({
        name: t?.name,
        description: '',
        themeTag: t?.themeTag || t?.contextTag || '',
        microTaskType: t?.microTaskType,
      })),
    );
    const tasksPreview = (dto.tasks || [])
      .slice(0, 30)
      .map((t, idx) => {
        const p = Number(t?.priority ?? 4);
        const pom = Number(t?.pomodorosPlanned ?? 1);
        const type = String(t?.microTaskType || '').trim();
        const theme = String(t?.themeTag || '').trim();
        const ctx = String(t?.contextTag || '').trim();
        const cog = String(t?.cognitiveMode || '').trim();
        const name = String(t?.name || '').trim();
        const tags = [
          theme ? `theme:${theme}` : '',
          ctx ? `ctx:${ctx}` : '',
          cog ? `cog:${cog}` : '',
        ].filter(Boolean);
        return `${idx + 1}. [P${p}] ${pom}🍅${type ? ` (${type})` : ''}${tags.length ? ` [${tags.join(' | ')}]` : ''} — ${name}`;
      })
      .join('\n');

    const prompt = `Você é um auditor de escopo e estimativas (WBS/PERT/EVM).\n\n` +
      `Contexto do projeto: ${String(project?.name || 'Projeto').trim()}\n` +
      `Pacote (WBS leaf): "${String(dto.leafNode?.name || '').trim()}"\n` +
      `Caminho: ${String(dto.nodePath || '').trim()}\n` +
      `Estimativa top-down do pacote: ${budgetHours.toFixed(1)}h\n` +
      `Estimativa bottom-up (micro-tarefas): ${generatedHours.toFixed(1)}h\n` +
      `Diferença: ${diffPct.toFixed(0)}%\n\n` +
      `Sinais automáticos (anti-gold-plating):\n` +
      `- totalTasks: ${taskList.length}\n` +
      `- duplicateRatio(aprox): ${(duplicateRatio * 100).toFixed(0)}%\n` +
      `- dupScore: ${repetitionMetrics.dupScore.toFixed(2)}\n` +
      `- similarScore: ${repetitionMetrics.similarScore.toFixed(2)}\n` +
      `${topDuplicateKeys ? `- topRepeated: ${topDuplicateKeys}\n` : ''}` +
      `\n` +
      `Micro-tarefas (amostra):\n${tasksPreview || '(sem tarefas)'}\n\n` +
      `Tarefa: classifique a discrepância como UMA destas opções:\n` +
      `- underestimated = o pacote foi subestimado (tarefas são majoritariamente distintas/necessárias)\n` +
      `- gold_plating = há escopo desnecessário/repetição excessiva (tarefas redundantes ou granularidade exagerada)\n` +
      `- mixed = há evidência forte de ambos (use SOMENTE quando realmente houver sinais fortes dos dois lados)\n\n` +
      `Regras para evitar "sempre mixed":\n` +
      `- Se duplicateRatio >= 30% OU dupScore >= 0.30, trate como forte sinal de redundância e prefira gold_plating ou mixed com suggestedAction=simplify.\n` +
      `- Se duplicateRatio < 15% E dupScore < 0.18 E similarScore < 0.45, prefira underestimated (a menos que haja escopo claramente opcional).\n` +
      `- Se diffPct >= 120% e houver repetição alta, suggestedAction deve ser simplify (não rebaseline).\n\n` +
      `Importante: tarefas podem parecer "parecidas" (ex: prática/análise), mas se tiverem themeTag/contextTag diferentes, considere que podem cobrir CONTEÚDO diferente e NÃO são redundância automaticamente.\n\n` +
      `Então sugira UMA ação: \n` +
      `- "rebaseline" = atualizar a estimativa do pacote para refletir o detalhamento real, ou\n` +
      `- "simplify" = simplificar o escopo para caber na estimativa original (cortar opcional, reduzir qualidade, etc).\n\n` +
      `Retorne APENAS JSON válido no formato (pode incluir campos extras opcionais):\n` +
      `{\n` +
      `  "diagnosis": "underestimated" | "gold_plating" | "mixed",\n` +
      `  "rationale": "...",\n` +
      `  "suggestedAction": "rebaseline" | "simplify",\n` +
      `  "suggestedEstimatedHours": 32,\n` +
      `  "simplifyNotes": ["...", "..."]\n` +
      `}`;

    const modelOverride = this.getWbsGenerationModelOverride();

    const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
      const response = await this.geminiService.generateContent(prompt, {
        model: modelOverride,
        // Even when JSON mode isn't supported, we still ask for JSON and parse it.
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxOutputTokens,
        temperature: opts.temperature,
      });
      const parsed = extractJsonObject<any>(response);

      const diagnosisRaw = String(parsed?.diagnosis || '').trim();
      const diagnosis: 'underestimated' | 'gold_plating' | 'mixed' =
        diagnosisRaw === 'gold_plating'
          ? 'gold_plating'
          : diagnosisRaw === 'mixed'
            ? 'mixed'
            : 'underestimated';

      const suggestedActionRaw = String(parsed?.suggestedAction || '').trim();
      const suggestedAction: 'rebaseline' | 'simplify' =
        suggestedActionRaw === 'simplify' ? 'simplify' : 'rebaseline';
      const rationale = String(parsed?.rationale || '').trim() || 'Sem justificativa.';
      const suggestedEstimatedHours =
        parsed?.suggestedEstimatedHours !== undefined && parsed?.suggestedEstimatedHours !== null
          ? Number(parsed.suggestedEstimatedHours)
          : undefined;

      // Post-processing override: if we detect strong repetition signals, force simplify.
      let finalDiagnosis = diagnosis;
      let finalSuggestedAction = suggestedAction;

      const strongRedundancy = duplicateRatio >= 0.3 || repetitionMetrics.dupScore >= 0.3;
      const moderateRedundancy = duplicateRatio >= 0.22 || repetitionMetrics.dupScore >= 0.25;
      const lowRedundancy =
        duplicateRatio < 0.15 &&
        repetitionMetrics.dupScore < 0.18 &&
        repetitionMetrics.similarScore < 0.45;
      const highVariety =
        repetitionMetrics.themesCount >= Math.min(6, Math.ceil(Math.max(1, taskList.length) / 6)) ||
        repetitionMetrics.verbVariety >= 0.45 ||
        repetitionMetrics.cognitiveVariety >= 0.45;

      if (strongRedundancy && diffPct >= 90) {
        finalDiagnosis = 'gold_plating';
        finalSuggestedAction = 'simplify';
      } else if (moderateRedundancy && diffPct >= 120) {
        finalDiagnosis = diagnosis === 'underestimated' ? 'mixed' : diagnosis;
        finalSuggestedAction = 'simplify';
      } else if (finalDiagnosis === 'mixed' && strongRedundancy) {
        finalSuggestedAction = 'simplify';
      } else if (
        // Guardrail against false positives: don't call gold_plating when signals show low redundancy
        // and the delta isn't huge.
        finalDiagnosis === 'gold_plating' &&
        lowRedundancy &&
        highVariety &&
        diffPct <= 90
      ) {
        finalDiagnosis = 'underestimated';
        finalSuggestedAction = 'rebaseline';
      }

      // Extra guardrail: if redundancy signals are low, avoid forcing simplify/gold_plating
      // unless the discrepancy is extremely large.
      if (lowRedundancy && diffPct < 120) {
        if (finalSuggestedAction === 'simplify') {
          finalSuggestedAction = 'rebaseline';
        }
        if (finalDiagnosis === 'gold_plating') {
          finalDiagnosis = diffPct >= 90 ? 'mixed' : 'underestimated';
        }
      }

      return {
        diagnosis: finalDiagnosis,
        rationale,
        suggestedAction: finalSuggestedAction,
        suggestedEstimatedHours:
          Number.isFinite(suggestedEstimatedHours) && suggestedEstimatedHours! > 0
            ? Math.round(suggestedEstimatedHours! * 2) / 2
            : undefined,
      };
    };

    try {
      return await attempt({ maxOutputTokens: 900, temperature: 0.2 });
    } catch (err: any) {
      // Retry with a bit more room and lower temperature
      return await attempt({ maxOutputTokens: 1400, temperature: 0.1 });
    }
  }


  /**
   * Convert WBS to tasks using TasksService.create() with AI enrichment
   * This creates more detailed and contextualized tasks with proper reward/experience calculation
   */
  async convertWBSToTasksWithAI(
    nodes: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: {
      create: (dto: any) => Promise<any>;
      createMany?: (dtos: any[], options?: any) => Promise<any[]>;
      recalculateProjectStats?: (projectId: string) => Promise<void>;
    },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
    },
    options?: {
      autoResolveDiscrepancies?: boolean;
      autoAuditThresholdPct?: number;
    },
  ): Promise<{
    createdTasks: any[];
    wbsUpdates: Array<{ nodeId: string; newEstimatedHours: number }>;
    auditsApplied: Array<{
      nodeId?: string;
      nodePath: string;
      budgetHours: number;
      generatedHours: number;
      appliedAction: 'rebaseline' | 'simplify' | 'none';
      diagnosis?: string;
      suggestedEstimatedHours?: number;
      finalHours?: number;
    }>;
  }> {
    const createdTasks: any[] = [];
    const wbsUpdates: Array<{ nodeId: string; newEstimatedHours: number }> = [];
    const auditsApplied: Array<{
      nodeId?: string;
      nodePath: string;
      budgetHours: number;
      generatedHours: number;
      appliedAction: 'rebaseline' | 'simplify' | 'none';
      diagnosis?: string;
      suggestedEstimatedHours?: number;
      finalHours?: number;
    }> = [];
    const generationBatchId = randomUUID();
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;
    const envPreferredPomodorosRaw =
      Number(process.env.WBS_PREFERRED_POMODOROS ?? process.env.WBS_TARGET_POMODOROS);
    const preferredPomodoros = normalizePreferredPomodoros(
      preferences?.targetPomodoros ?? envPreferredPomodorosRaw,
    );

    // Guardrails: avoid accidental explosions (e.g. thousands of tasks)
    const estimatedTotalTasks = estimateMicroTaskCount(nodes);
    const maxTasksToCreate = 1000;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Convers?o abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
          `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    const autoResolveEnabled = !!options?.autoResolveDiscrepancies;
    const autoAuditThresholdPct =
      typeof options?.autoAuditThresholdPct === 'number' && Number.isFinite(options.autoAuditThresholdPct)
        ? options.autoAuditThresholdPct
        : 60;

    // Calculate total WBS budget (sum of all leaf nodes)
    const wbsBudgetHours = this.calculateWBSTotalHours(nodes);
    console.log(`💰 Orçamento total da WBS: ${wbsBudgetHours.toFixed(1)}h`);
    
    // Track accumulated hours during generation
    let accumulatedPomodoros = 0;

    // Calcular deadline base (distribuir tarefas ao longo do prazo do projeto)
    const projectDeadline = project.deadline ? new Date(project.deadline) : new Date();
    const today = new Date();
    const daysUntilDeadline = Math.max(7, Math.ceil((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    let taskCounter = 0;
    let aiLeafCalls = 0;
    const maxAiLeafCalls = 1000;

    const batchStart = Date.now();

    const computeLeafHours = (leafTaskDtos: any[]): number => {
      const poms = leafTaskDtos.reduce((sum, t: any) => sum + Number(t?.pomodorosPlanned || 0), 0);
      return poms * 0.5;
    };

    const shrinkLeafTasksToTargetHours = (leafTaskDtos: any[], targetHours: number) => {
      const chunks = leafTaskDtos.length;
      const minHours = chunks * 0.5; // min 1 pomodoro per task
      const target = Math.max(minHours, Math.round(targetHours * 2) / 2);
      let currentPom = leafTaskDtos.reduce((sum, t: any) => sum + Number(t?.pomodorosPlanned || 0), 0);
      const targetPom = Math.round(target / 0.5);

      while (currentPom > targetPom) {
        let bestIdx = -1;
        let bestPom = 1;

        for (let i = 0; i < leafTaskDtos.length; i++) {
          const pom = Number(leafTaskDtos[i]?.pomodorosPlanned || 0);
          if (pom > bestPom) {
            bestPom = pom;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) break;

        leafTaskDtos[bestIdx].pomodorosPlanned = bestPom - 1;
        const pert = computePertFromMinutes((bestPom - 1) * 25);
        leafTaskDtos[bestIdx].pertOptimisticMinutes = pert.optimistic;
        leafTaskDtos[bestIdx].pertMostLikelyMinutes = pert.mostLikely;
        leafTaskDtos[bestIdx].pertPessimisticMinutes = pert.pessimistic;
        leafTaskDtos[bestIdx].pertExpectedMinutes = pert.expected;
        leafTaskDtos[bestIdx].pertVariance = pert.variance;
        currentPom -= 1;
      }

      return {
        targetHours: target,
        finalHours: currentPom * 0.5,
      };
    };
    const traverse = async (nodeList: WBSNodeDto[], parentPath: string = '', level: number = 1) => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          const leafStart = Date.now();
          const modelOverride = this.getWbsGenerationModelOverride();
          console.log(
            `[WBS→Tasks][Batch ${generationBatchId}] leaf-start ts=${this.nowIso()} ` +
              `leaf="${node.name}" level=${level} estHours=${Number(node.estimatedHours || 0).toFixed(1)} ` +
              `model=${modelOverride || this.geminiService.getModelName?.() || 'default'}`,
          );

          // Leaf node - criar micro-tarefas
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes: number[] = computeChunkMinutes(totalMinutes, {
            preferredPomodoros,
          });
          const chunks = chunkMinutes.length;

          if (this.isTimingDebugEnabled()) {
            console.log(
              `[WBS→Tasks][Batch ${generationBatchId}] leaf-chunks ts=${this.nowIso()} leaf="${node.name}" chunks=${chunks}`,
            );
          }

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

          const aiStart = Date.now();
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

          const aiMs = Date.now() - aiStart;
          console.log(
            `[WBS→Tasks][Batch ${generationBatchId}] leaf-ai ts=${this.nowIso()} leaf="${node.name}" ` +
              `chunks=${chunks} aiMs=${aiMs}`,
          );

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

          // Pre-dedupe checks: catch duplicates that would otherwise be ?hidden? by suffix-based dedupe.
          const preDedupe = this.monotonyDetection.detectPreDedupeIssues(leafDrafts);

          leafDrafts = this.monotonyFix.dedupeCheckAndMitigate(leafDrafts);

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

          const fixStart = Date.now();
          // Auto-fix monotony: regenerate only the problematic items (duplicates/templates/forbidden patterns).
          try {
            const disableFix = ['1', 'true', 'yes', 'on'].includes(
              String(process.env.WBS_DISABLE_MONOTONY_FIX || '').trim().toLowerCase(),
            );
            if (disableFix) {
              console.log(
                `[WBS→Tasks][Batch ${generationBatchId}] leaf-fix skipped ts=${this.nowIso()} leaf="${node.name}"`,
              );
            } else {
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
                        aiLeafCalls += strongFixed.aiCallsUsed;
                      }
                    }
                  }
                }
              }
            }

            // Even if we couldn't spend AI calls, enforce deduplication.
            if (issues.hasForbiddenPatterns) {
              leafDrafts = this.monotonyFix.dedupeCheckAndMitigate(leafDrafts as any);
            }
            }
          } catch (err: any) {
            console.warn(
              `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ auto-fix monotonia falhou para leaf="${node.name}": ${
                err?.message || err
              }`,
            );
          }

          const fixMs = Date.now() - fixStart;
          if (this.isTimingDebugEnabled()) {
            console.log(
              `[WBS→Tasks][Batch ${generationBatchId}] leaf-fix ts=${this.nowIso()} leaf="${node.name}" fixMs=${fixMs}`,
            );
          }

          const createStart = Date.now();

          const leafTaskDtos: any[] = [];
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

            leafTaskDtos.push({
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
          }

          // Auto-audit + auto-apply discrepancy resolution (automatic conversion)
          if (autoResolveEnabled && leafTaskDtos.length > 0) {
            const budgetHours = Number(node.estimatedHours || 0);
            const generatedHoursBefore = computeLeafHours(leafTaskDtos);
            const diffPct =
              budgetHours > 0 ? ((generatedHoursBefore - budgetHours) / budgetHours) * 100 : 0;

            if (diffPct >= autoAuditThresholdPct) {
              try {
                const audit = await this.auditLeafDiscrepancy(project, {
                  leafNode: node as any,
                  nodePath: currentPath,
                  generatedHours: generatedHoursBefore,
                  tasks: leafTaskDtos.map((t: any) => ({
                    name: String(t?.name || ''),
                    pomodorosPlanned: Number(t?.pomodorosPlanned || 1),
                    priority: typeof t?.priority === 'number' ? t.priority : undefined,
                    microTaskType: t?.microTaskType,
                    themeTag: Array.isArray(t?.themeTag) ? String(t.themeTag[0] || '') : t?.themeTag,
                    contextTag: t?.contextTag,
                    cognitiveMode: t?.cognitiveMode,
                  })),
                } as any);

                const suggestedHoursRaw = Number((audit as any)?.suggestedEstimatedHours);
                const hasSuggestedHours = Number.isFinite(suggestedHoursRaw) && suggestedHoursRaw > 0;
                const nodeId = (node as any)?._id ? String((node as any)._id) : undefined;

                if ((audit as any)?.suggestedAction === 'simplify') {
                  const targetHours = hasSuggestedHours ? suggestedHoursRaw : budgetHours;
                  const shrink = shrinkLeafTasksToTargetHours(leafTaskDtos, targetHours);
                  const finalHours = shrink.finalHours;
                  const finalEstimatedHours = Math.round((hasSuggestedHours ? shrink.targetHours : finalHours) * 2) / 2;

                  node.estimatedHours = finalEstimatedHours;
                  if (nodeId) {
                    wbsUpdates.push({ nodeId, newEstimatedHours: finalEstimatedHours });
                  }

                  auditsApplied.push({
                    nodeId,
                    nodePath: currentPath,
                    budgetHours,
                    generatedHours: generatedHoursBefore,
                    appliedAction: 'simplify',
                    diagnosis: (audit as any)?.diagnosis,
                    suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
                    finalHours,
                  });
                } else if ((audit as any)?.suggestedAction === 'rebaseline') {
                  const newHoursRaw = hasSuggestedHours ? suggestedHoursRaw : generatedHoursBefore;
                  const newHours = Math.max(budgetHours, Math.round(newHoursRaw * 2) / 2);

                  node.estimatedHours = newHours;
                  if (nodeId) {
                    wbsUpdates.push({ nodeId, newEstimatedHours: newHours });
                  }

                  auditsApplied.push({
                    nodeId,
                    nodePath: currentPath,
                    budgetHours,
                    generatedHours: generatedHoursBefore,
                    appliedAction: 'rebaseline',
                    diagnosis: (audit as any)?.diagnosis,
                    suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
                    finalHours: generatedHoursBefore,
                  });
                } else {
                  auditsApplied.push({
                    nodeId,
                    nodePath: currentPath,
                    budgetHours,
                    generatedHours: generatedHoursBefore,
                    appliedAction: 'none',
                    diagnosis: (audit as any)?.diagnosis,
                    suggestedEstimatedHours: hasSuggestedHours ? suggestedHoursRaw : undefined,
                    finalHours: generatedHoursBefore,
                  });
                }
              } catch (err: any) {
                console.warn(
                  `[WBS→Tasks][Batch ${generationBatchId}] ⚠️ auto-audit falhou para leaf="${node.name}": ${
                    err?.message || err
                  }`,
                );
              }
            }
          }

          // Create tasks for this leaf in bulk (major perf win)
          if (leafTaskDtos.length > 0) {
            try {
              if (typeof tasksService.createMany === 'function') {
                const created = await tasksService.createMany(leafTaskDtos, {
                  resolveProject: false,
                  recalculateProjectStats: false,
                });
                for (const createdTask of created) {
                  createdTasks.push(createdTask);
                  taskCounter++;
                  accumulatedPomodoros += Number(createdTask?.pomodorosPlanned || 0);
                  if (this.isVerboseTaskLogsEnabled()) {
                    console.log(
                      `  ✅ Task ${taskCounter}: "${createdTask.name}" (${createdTask.pomodorosPlanned} pomodoros, prioridade ${createdTask.priority}, dificuldade ${createdTask.difficult})`,
                    );
                  }
                }
                if (this.isTimingDebugEnabled()) {
                  console.log(
                    `[WBS→Tasks][Batch ${generationBatchId}] leaf-create-bulk ts=${this.nowIso()} leaf="${node.name}" inserted=${created.length}/${leafTaskDtos.length}`,
                  );
                }
              } else {
                for (const dto of leafTaskDtos) {
                  try {
                    const createdTask = await tasksService.create(dto);
                    createdTasks.push(createdTask);
                    taskCounter++;
                    accumulatedPomodoros += Number(createdTask?.pomodorosPlanned || 0);
                    if (this.isVerboseTaskLogsEnabled()) {
                      console.log(
                        `  ✅ Task ${taskCounter}: "${createdTask.name}" (${createdTask.pomodorosPlanned} pomodoros, prioridade ${createdTask.priority}, dificuldade ${createdTask.difficult})`,
                      );
                    }
                  } catch (error: any) {
                    console.error(`  ❌ Erro ao criar task "${dto?.name}":`, error?.message || error);
                  }
                }
              }
            } catch (error: any) {
              console.error(`  ❌ Erro ao criar tasks em lote (leaf="${node.name}")`, error?.message || error);
            }
          }

          const createMs = Date.now() - createStart;
          const leafMs = Date.now() - leafStart;
          console.log(
            `[WBS→Tasks][Batch ${generationBatchId}] leaf-end ts=${this.nowIso()} leaf="${node.name}" ` +
              `leafMs=${leafMs} createMs=${createMs} sinceBatchMs=${Date.now() - batchStart}`,
          );
        } else {
          // Intermediate node - processar filhos
          await traverse(node.children, currentPath, level + 1);
        }
      }
    };

    await traverse(nodes);

    // Recalculate project stats once at the end (instead of once per task)
    try {
      if (typeof tasksService.recalculateProjectStats === 'function') {
        await tasksService.recalculateProjectStats(projectId);
      }
    } catch (err: any) {
      console.warn('[WBS→Tasks] Falha ao recalcular stats do projeto ao final da conversão', err?.message || err);
    }
    
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
    
    // Validate budget: warn if generated hours exceed WBS budget significantly
    const generatedHours = accumulatedPomodoros * 0.5; // 1 pomodoro = 0.5h
    const effectiveWbsBudgetHours = this.calculateWBSTotalHours(nodes);
    const budgetExceeded = generatedHours - effectiveWbsBudgetHours;
    const exceedPercentage = effectiveWbsBudgetHours > 0 ? (budgetExceeded / effectiveWbsBudgetHours) * 100 : 0;
    
    console.log(`\n💰 Validação de orçamento:`);
    console.log(`   • Orçamento WBS: ${effectiveWbsBudgetHours.toFixed(1)}h`);
    console.log(`   • Horas geradas: ${generatedHours.toFixed(1)}h`);
    console.log(`   • Diferença: ${budgetExceeded >= 0 ? '+' : ''}${budgetExceeded.toFixed(1)}h (${exceedPercentage >= 0 ? '+' : ''}${exceedPercentage.toFixed(1)}%)`);
    
    if (exceedPercentage > 50) {
      if (!autoResolveEnabled) {
        throw new Error(
          `❌ Conversão abortada: extrapolação excessiva do orçamento! ` +
            `As micro-tarefas gerariam ${generatedHours.toFixed(1)}h mas a WBS estimou apenas ${effectiveWbsBudgetHours.toFixed(1)}h ` +
            `(+${exceedPercentage.toFixed(1)}%). Revise a WBS ou ajuste os parâmetros de divisão.`
        );
      }
      console.warn(
        `⚠️ ALERTA: As micro-tarefas extrapolaram o orçamento (pós-auto-audit) em ${exceedPercentage.toFixed(1)}%! ` +
          `Orçamento: ${effectiveWbsBudgetHours.toFixed(1)}h, Gerado: ${generatedHours.toFixed(1)}h`,
      );
    } else if (exceedPercentage > 20) {
      console.warn(
        `⚠️ ALERTA: As micro-tarefas extrapolaram o orçamento da WBS em ${exceedPercentage.toFixed(1)}%! ` +
        `Esperado: ${effectiveWbsBudgetHours.toFixed(1)}h, Gerado: ${generatedHours.toFixed(1)}h`
      );
    }

    return {
      createdTasks,
      wbsUpdates,
      auditsApplied,
    };
  }

  /**
   * Calculate total hours from WBS leaf nodes only
   */
  private calculateWBSTotalHours(nodes: WBSNodeDto[]): number {
    let total = 0;
    
    const traverse = (nodeList: WBSNodeDto[] | undefined) => {
      if (!nodeList) return;
      
      for (const node of nodeList) {
        const isLeaf = !node.children || node.children.length === 0;
        
        if (isLeaf) {
          total += node.estimatedHours || 0;
        } else {
          traverse(node.children);
        }
      }
    };
    
    traverse(nodes);
    return total;
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
    // Generate in batches to avoid JSON truncation (common when JSON-mode is unsupported).
    // Increase batch size and run slices in parallel (limited concurrency) to
    // use available token budget and reduce latency when model doesn't support JSON mode.
    const maxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL', 24); // fewer requests => lower wall time
    const concurrency = this.getNumericEnv('WBS_SLICE_CONCURRENCY', 4); // number of parallel slice requests
    const resolvedModelOverride = modelOverride || this.getWbsGenerationModelOverride();
    
    console.log(`   🔨 [generateMicroTasksDraftsForLeaf] Usando modelo: ${resolvedModelOverride || 'padrão'}`);
    console.log(`   📊 Batchs: maxPerCall=${maxPerCall}, concurrency=${concurrency}`);

    const baseMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200)
    const retryMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS_RETRY', 3500)

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
      if (this.isTimingDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log('[WBSService][slice:start]', {
          ts: this.nowIso(),
          backend: this.cacheBackendName(),
          sliceIndex,
          sliceCount: sliceMinutes.length,
          model: modelOverride || this.geminiService.getModelName?.(),
        });
      }

        const attempt = async (opts: { maxOutputTokens: number; temperature: number }) => {
          // When model doesn't support JSON mode we still attempt JSON parsing
          // but allow larger token budgets (user has many tokens) to reduce truncation.
          const response = await this.geminiService.generateContent(prompt, {
            model: modelOverride,
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
        // Use larger token budget to decrease chance of truncation (user has tokens available).
        const out = await attempt({ maxOutputTokens: baseMaxTokens, temperature: 0.2 });
        if (this.isTimingDebugEnabled()) {
          // eslint-disable-next-line no-console
          console.log('[WBSService][slice:end]', {
            ts: this.nowIso(),
            sliceIndex,
            ms: Date.now() - sliceStart,
            items: out?.length || 0,
            model: modelOverride || this.geminiService.getModelName?.(),
          });
        }
        return out;
      } catch (err: any) {
        // If JSON is truncated or malformed, split the request into smaller slices.
        if (sliceMinutes.length > 1 && isJsonishError(err)) {
          const mid = Math.ceil(sliceMinutes.length / 2);
          const left = await generateDraftsForSlice(sliceMinutes.slice(0, mid), sliceIndex);
          const right = await generateDraftsForSlice(sliceMinutes.slice(mid), sliceIndex);
          return [...left, ...right];
        }

        // Last try: slightly higher token budget and stricter temperature.
        if (isJsonishError(err)) {
          // Final retry with very large token budget when user provided many tokens.
          const out = await attempt({ maxOutputTokens: retryMaxTokens, temperature: 0.15 });
          if (this.isTimingDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.log('[WBSService][slice:end]', {
              ts: this.nowIso(),
              sliceIndex,
              ms: Date.now() - sliceStart,
              items: out?.length || 0,
              model: modelOverride || this.geminiService.getModelName?.(),
              retry: 'maxTokens',
            });
          }
          return out;
        }
        throw err;
      }
    };

    // Build slice tasks
    const slices: { start: number; sliceMinutes: number[] }[] = [];
    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      slices.push({ start, sliceMinutes });
    }

    // Cache key: node id (or name), project id, chunkMinutes and preferences
    const cacheKey = `drafts:${params.project?._id || params.project?.id || 'noproj'}:${params.node._id || params.node.name}:${chunkMinutes.join(',')}:${JSON.stringify({ level: params.level })}`
    const genStart = Date.now()
    
    // Skip cache if modelOverride was provided (user wants to regenerate with different model)
    const shouldUseCache = !resolvedModelOverride;
    
    try {
      if (shouldUseCache) {
        const cached = await this.getDraftsCache(cacheKey)
        if (cached) {
          if (this.isCacheDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.log('[WBSService][gen] served from cache', {
              backend: this.cacheBackendName(),
              chunkCount: chunkMinutes.length,
              ms: Date.now() - genStart,
            })
          }
          return cached
        }
      } else {
        console.log(`   ⏭️  Cache IGNORADO (modelo override: ${resolvedModelOverride})`);
      }
    } catch (err) {
      // ignore cache read errors
    }

    // Parallel execution with limited concurrency
    const resultsByIndex: any[][] = new Array(slices.length);
    let nextIndex = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(concurrency, slices.length); w++) {
      workers.push(
        (async () => {
          while (true) {
            const idx = nextIndex++;
            if (idx >= slices.length) break;
            const s = slices[idx];
            const sliceDrafts = await generateDraftsForSlice(s.sliceMinutes, idx);
            resultsByIndex[idx] = sliceDrafts;
          }
        })(),
      );
    }
    await Promise.all(workers);

    // Flatten in order
    const validatedDrafts: any[] = [];
    for (let i = 0; i < resultsByIndex.length; i++) {
      validatedDrafts.push(...(resultsByIndex[i] || []));
    }

    // Store in cache
    try {
      await this.setDraftsCache(cacheKey, validatedDrafts)
    } catch (err) {
      // ignore cache write errors
    }

    if (this.isCacheDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[WBSService][gen] generated drafts', {
        backend: this.cacheBackendName(),
        chunkCount: chunkMinutes.length,
        slices: slices.length,
        concurrency,
        ms: Date.now() - genStart,
      })
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
    modelOverride?: string;
  }): Promise<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> {
    const resolvedModelOverride = params.modelOverride || this.getWbsGenerationModelOverride();
    console.log(`   📋 [generateMicroTasksPlanForLeaf] Usando modelo: ${resolvedModelOverride || 'padrão'}`);
    
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
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number; plan: any; modelOverride?: string },
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
    const resolvedModelOverride = params.modelOverride || this.getWbsGenerationModelOverride();
    console.log(`   🎯 [generateMicroTasksDraftsForLeafWithPlan] Usando modelo: ${resolvedModelOverride || 'padrão'}`);
    // Generate in batches to avoid JSON truncation on big leaves. Parallelize slices
    // and use larger token budgets when model doesn't support JSON mode.
    const maxPerCall = this.getNumericEnv('WBS_MAX_PER_CALL', 24);
    const concurrency = this.getNumericEnv('WBS_SLICE_CONCURRENCY', 4);
    const modelOverride = this.getWbsGenerationModelOverride();

    const baseMaxTokens = this.getNumericEnv('WBS_MAX_OUTPUT_TOKENS', 2200)
    const slices: { start: number; sliceMinutes: number[]; slicedPlan: any }[] = [];

    for (let start = 0; start < chunkMinutes.length; start += maxPerCall) {
      const end = Math.min(chunkMinutes.length, start + maxPerCall);
      const sliceMinutes = chunkMinutes.slice(start, end);
      const slicedPlan = {
        ...params.plan,
        workflow: Array.isArray(params.plan?.workflow) ? params.plan.workflow.slice(start, end) : params.plan?.workflow,
      };
      slices.push({ start, sliceMinutes, slicedPlan });
    }

    // Cache key for plan-based generator
    const cacheKey = `drafts_with_plan:${params.project?._id || params.project?.id || 'noproj'}:${params.node._id || params.node.name}:${chunkMinutes.join(',')}:${JSON.stringify(params.plan || {})}`
    const genStart = Date.now()
    
    // Skip cache if modelOverride was provided (user wants to regenerate with different model)
    const shouldUseCache = !resolvedModelOverride;
    
    try {
      if (shouldUseCache) {
        const cached = await this.getDraftsCache(cacheKey)
        if (cached) {
          if (this.isCacheDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.log('[WBSService][gen] served from cache (plan)', {
              backend: this.cacheBackendName(),
              chunkCount: chunkMinutes.length,
              ms: Date.now() - genStart,
            })
          }
          return cached
        }
      } else {
        console.log(`   ⏭️  Cache IGNORADO (modelo override: ${resolvedModelOverride})`);
      }
    } catch (err) {
      // ignore cache read errors
    }

    const resultsByIndex: any[][] = new Array(slices.length);
    let next = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(concurrency, slices.length); w++) {
      workers.push(
        (async () => {
          while (true) {
            const idx = next++;
            if (idx >= slices.length) break;
            const s = slices[idx];

            const prompt = this.promptBuilder.buildMicroTasksGeneratorPrompt({
              project: params.project,
              node: params.node,
              currentPath: params.currentPath,
              level: params.level,
              chunkMinutes: s.sliceMinutes,
              plan: s.slicedPlan,
            });

            const response = await this.geminiService.generateContent(prompt, {
              model: modelOverride,
              responseMimeType: 'application/json',
              maxOutputTokens: baseMaxTokens,
            });

            const drafts = extractJsonArray<any>(response);
            const validatedDrafts = this.validateDrafts(drafts);

            if (validatedDrafts.length !== s.sliceMinutes.length) {
              throw new Error(`IA retornou ${validatedDrafts.length} itens; esperado ${s.sliceMinutes.length}`);
            }

            const mapped = validatedDrafts.map((d: any, localIdx: number) => {
              const globalIdx = s.start + localIdx;
              const targetMinutes = chunkMinutes[globalIdx];
              const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
              const normalizedName = String(
                d?.name || `${params.node.name} (${globalIdx + 1}/${chunkMinutes.length})`,
              ).trim();
              const inferredType = normalizeMicroTaskType(
                d?.microTaskType ||
                  mapCognitiveTypeToMicroTaskType(this.inferCognitiveType(normalizedName, d?.description)),
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

            resultsByIndex[idx] = mapped;
          }
        })(),
      );
    }

    await Promise.all(workers);

    const out: any[] = [];
    for (let i = 0; i < resultsByIndex.length; i++) {
      out.push(...(resultsByIndex[i] || []));
    }

    // Store to cache
    try {
      await this.setDraftsCache(cacheKey, out)
    } catch (err) {
      // ignore cache write errors
    }

    if (this.isCacheDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[WBSService][gen] generated drafts (plan)', {
        backend: this.cacheBackendName(),
        chunkCount: chunkMinutes.length,
        slices: slices.length,
        concurrency,
        ms: Date.now() - genStart,
      })
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

    // Invalidate cached drafts for this project to avoid stale previews
    try {
      await this.clearDraftsCacheForProject(projectId)
      console.log(`[WBSService] Cache de rascunhos limpa para projeto ${projectId}`)
    } catch (err) {
      console.warn('[WBSService] erro ao limpar cache de rascunhos', err)
    }

    // Recalcular estimatedHours dos nós intermediários (somar filhos)
    await this.recalculateEstimatedHours(projectId);

    return savedNodes;
  }

  /**
   * Recalculate estimatedHours for intermediate nodes as the sum of their children
   */
  private async recalculateEstimatedHours(projectId: string): Promise<void> {
    try {
      const allNodes = await this.wbsNodeModel.find({ projectId }).exec();

      if (allNodes.length === 0) return;

      console.log(`🔄 Recalculando estimatedHours para nós intermediários...`);

      // Find all parent nodes (those with children)
      const parentIds = new Set(allNodes.map(n => n.parentId).filter(Boolean));

      for (const parentId of parentIds) {
        const parent = allNodes.find(n => String(n._id) === parentId);
        if (!parent) continue;

        // Sum all children's estimatedHours
        const children = allNodes.filter(n => String(n.parentId) === parentId);
        const totalHours = children.reduce((sum, child) => sum + (child.estimatedHours || 0), 0);

        // Update parent with calculated sum
        parent.estimatedHours = totalHours;
        await parent.save();

        console.log(
          `  ✅ "${parent.name}" (level ${parent.level}): ${children.length} filhos = ${totalHours}h`,
        );
      }

      console.log(`⏱️  Recalcular estimatedHours concluído`);
    } catch (error) {
      console.error('Erro ao recalcular estimatedHours:', error);
      // Não falha o saveWBS por causa disso, apenas loga o erro
    }
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

  // Simple cache helpers: prefer Redis, fallback to in-memory with TTL.
  private async getDraftsCache(key: string): Promise<any[] | null> {
    try {
      if (this.redisClient) {
        const raw = await this.redisClient.get(key)
        if (!raw) {
          this.logCache('miss', key)
          return null
        }
        this.logCache('hit', key)
        return JSON.parse(raw)
      }
    } catch (err) {
      // ignore redis errors
    }

    const entry = this.draftsCache.get(key)
    if (!entry) {
      this.logCache('miss', key)
      return null
    }
    if (Date.now() > entry.exp) {
      this.draftsCache.delete(key)
      this.logCache('miss', key, { expired: true })
      return null
    }
    this.logCache('hit', key)
    return entry.value
  }

  /**
   * Clear cached drafts for a project (both plain and plan-based keys).
   * Uses Redis SCAN when available, otherwise purges in-memory entries.
   */
  private async clearDraftsCacheForProject(projectId: string): Promise<void> {
    const prefix1 = `drafts:${projectId}:`
    const prefix2 = `drafts_with_plan:${projectId}:`
    try {
      if (this.redisClient) {
        // Use SCAN to iterate keys safely
        let cursor = '0'
        let deleted = 0
        do {
          // scan for prefix1
          const [next, keys] = await this.redisClient.scan(cursor, 'MATCH', `${prefix1}*`, 'COUNT', 100)
          cursor = next
          if (keys && keys.length) {
            await Promise.all(keys.map((k: string) => this.redisClient.del(k)))
            deleted += keys.length
          }
        } while (cursor !== '0')

        cursor = '0'
        do {
          const [next, keys] = await this.redisClient.scan(cursor, 'MATCH', `${prefix2}*`, 'COUNT', 100)
          cursor = next
          if (keys && keys.length) {
            await Promise.all(keys.map((k: string) => this.redisClient.del(k)))
            deleted += keys.length
          }
        } while (cursor !== '0')

        if (deleted > 0) this.logCache('clear', `${prefix1}*`, { deleted })

        return
      }
    } catch (err) {
      console.warn('[WBSService] redis cache clear error', err)
    }

    // In-memory fallback
    let deleted = 0
    for (const k of Array.from(this.draftsCache.keys())) {
      if (k.startsWith(prefix1) || k.startsWith(prefix2)) {
        this.draftsCache.delete(k)
        deleted++
      }
    }
    if (deleted > 0) this.logCache('clear', `${prefix1}*`, { deleted })
  }

  private async setDraftsCache(key: string, value: any[]): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', this.cacheTTLSeconds)
        this.logCache('set', key, { ttlSeconds: this.cacheTTLSeconds, items: value?.length || 0 })
        return
      }
    } catch (err) {
      // ignore redis errors
    }

    const exp = Date.now() + this.cacheTTLSeconds * 1000
    this.draftsCache.set(key, { value, exp })
    this.logCache('set', key, { ttlSeconds: this.cacheTTLSeconds, items: value?.length || 0 })
  }
}
