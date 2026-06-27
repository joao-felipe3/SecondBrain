import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  mapMicroTaskTypeToCognitiveMode,
  mapCognitiveModeToContextTag,
  normalizeCognitiveMode,
  normalizeMicroTaskType,
} from '../wbs/utils/normalizers.util';
import { extractDefinitionOfDone, extractChecklistSteps } from '../wbs/utils/wbs-helpers.util';

@Injectable()
export class DraftProcessingService {
  private readonly plannerSchema: z.ZodType<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> = z.object({
    themes: z
      .array(
        z.object({
          name: z.string().min(1),
          criteria: z.string().optional(),
        }),
      )
      .min(0),
    workflow: z.array(z.string()).min(1),
    milestones: z
      .array(
        z.object({
          name: z.string().optional(),
          goal: z.string().optional(),
          atMinutes: z.number().optional(),
        }),
      )
      .optional(),
    constraints: z.any().optional(),
  });

  private readonly draftSchema: z.ZodType<
    Array<{
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
    }>
  > = z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      checklist: z.array(z.string().min(1)).min(1),
      definitionOfDone: z.string().min(1),
      pomodorosPlanned: z.number().int().min(1).max(6),
      priority: z.number().int().min(1).max(4),
      difficult: z.number().int().min(1).max(4),
      microTaskType: z.string().min(1),
      themeTag: z.string().min(1),
      contextTag: z.string().min(1),
      cognitiveMode: z.string().min(1),
    }),
  );

  constructor() {}

  getPlannerSchema() {
    return this.plannerSchema;
  }

  getDraftSchema() {
    return this.draftSchema;
  }

  getDraftsSchema() {
    return z.array(this.draftSchema).min(1);
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
    const parsed = this.draftSchema.safeParse(drafts);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Drafts inválidos: ${issues}`);
    }
    return parsed.data as any;
  }

  applyThemeWorkflowAndProgression(
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
    chunkMinutes?: number[],
  ): Array<{
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
  }> {
    if (!drafts.length) return drafts;

    // Group drafts by theme
    const byTheme = new Map<string, number[]>();
    drafts.forEach((d, idx) => {
      const theme = String(d.themeTag || '').trim() || '__no_theme__';
      if (!byTheme.has(theme)) byTheme.set(theme, []);
      byTheme.get(theme)!.push(idx);
    });

    // Build theme workflow: prepare → practice → produce → test (+ extras)
    const buildThemeWorkflow = (total: number): string[] => {
      if (total <= 1) return ['practice'];
      if (total === 2) return ['prepare', 'produce'];
      if (total === 3) return ['prepare', 'practice', 'produce'];
      const base = ['prepare', 'practice', 'produce', 'test'];
      while (base.length < total) base.splice(base.length - 1, 0, 'practice');
      return base.slice(0, total);
    };

    // Progressive cognitive mode: first=low, middle=medium, last=high
    const progressiveMode = (index: number, total: number): string => {
      if (total <= 1) return 'medium';
      if (index === 0) return 'low';
      if (index === total - 1) return 'high';
      return 'medium';
    };

    // Apply workflow and cognitive progression per theme
    for (const [theme, indices] of byTheme.entries()) {
      if (theme === '__no_theme__') continue; // Skip unthemed tasks
      const total = indices.length;
      if (total <= 1) continue; // Solo tasks don't need workflow
      const workflow = buildThemeWorkflow(total);

      indices.forEach((idx, localIdx) => {
        const microTaskType = normalizeMicroTaskType(workflow[localIdx]);
        const cognitiveMode = normalizeCognitiveMode(progressiveMode(localIdx, total));
        drafts[idx] = {
          ...drafts[idx],
          microTaskType,
          cognitiveMode,
          contextTag:
            String(drafts[idx].contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() ||
            undefined,
        };
      });
    }

    return drafts;
  }

  applyGoldilocksAndMilestones(
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
  ): Array<{
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
  }> {
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
          contextTag:
            String(d.contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
        };
      }

      return {
        ...d,
        milestoneIndex,
      };
    });
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
          : extractChecklistSteps(normalizedDescription),
      definitionOfDone: normalizedDefinitionOfDone || extractDefinitionOfDone(normalizedDescription),
      microTaskType,
      cognitiveMode,
      contextTag:
        String(d.contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() || undefined,
    };
  }
}
