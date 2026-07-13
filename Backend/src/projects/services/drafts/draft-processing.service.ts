import { Injectable } from '@nestjs/common';
import {
  mapMicroTaskTypeToCognitiveMode,
  mapCognitiveModeToContextTag,
  normalizeCognitiveMode,
  normalizeMicroTaskType,
} from '../wbs/utils/normalizers.util';
import { extractDefinitionOfDone, extractChecklistSteps } from '../wbs/utils/wbs-helpers.util';
import {
  MicroTaskOutline,
  MicroTaskDraft,
  WBSLeafPlanResultDto,
  AssignMilestonesParamsDto,
} from '../../interfaces/drafts.interface';
import { plannerSchema, draftsSchema } from '../../schemas/drafts-validation.schema';

@Injectable()
export class DraftProcessingService {
  constructor() { }

  validatePlannerPlan(plan: any): WBSLeafPlanResultDto {
    const parsed = plannerSchema.safeParse(plan);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Plano inválido: ${issues}`);
    }
    return parsed.data;
  }

  validateDrafts(drafts: any[]): MicroTaskDraft[] {
    const parsed = draftsSchema.safeParse(drafts);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ');
      throw new Error(`Drafts inválidos: ${issues}`);
    }
    return parsed.data as MicroTaskDraft[];
  }

  applyThemeWorkflowAndProgression(drafts: MicroTaskOutline[]): MicroTaskOutline[] {
    if (!drafts.length) return drafts;

    const byTheme = this.groupDraftIndicesByTheme(drafts);

    for (const [theme, indices] of byTheme.entries()) {
      if (theme === '__no_theme__' || indices.length <= 1) {
        continue;
      }
      this.applyWorkflowToTheme(drafts, indices);
    }

    return drafts;
  }

  private groupDraftIndicesByTheme(drafts: MicroTaskOutline[]): Map<string, number[]> {
    const byTheme = new Map<string, number[]>();
    drafts.forEach((d, idx) => {
      const theme = String(d.themeTag || '').trim() || '__no_theme__';
      if (!byTheme.has(theme)) {
        byTheme.set(theme, []);
      }
      byTheme.get(theme)!.push(idx);
    });
    return byTheme;
  }

  private buildThemeWorkflow(total: number): string[] {
    if (total <= 1) return ['practice'];
    if (total === 2) return ['prepare', 'produce'];
    if (total === 3) return ['prepare', 'practice', 'produce'];
    const base = ['prepare', 'practice', 'produce', 'test'];
    while (base.length < total) {
      base.splice(base.length - 1, 0, 'practice');
    }
    return base.slice(0, total);
  }

  private getProgressiveCognitiveMode(index: number, total: number): string {
    if (total <= 1) return 'medium';
    if (index === 0) return 'low';
    if (index === total - 1) return 'high';
    return 'medium';
  }

  private applyWorkflowToTheme(
    drafts: MicroTaskOutline[],
    indices: number[],
  ): void {
    const total = indices.length;
    const workflow = this.buildThemeWorkflow(total);

    indices.forEach((idx, localIdx) => {
      const microTaskType = normalizeMicroTaskType(workflow[localIdx]);
      const cognitiveMode = normalizeCognitiveMode(
        this.getProgressiveCognitiveMode(localIdx, total),
      );
      drafts[idx] = {
        ...drafts[idx],
        microTaskType,
        cognitiveMode,
        contextTag:
          String(drafts[idx].contextTag || mapCognitiveModeToContextTag(cognitiveMode)).trim() ||
          undefined,
      } as MicroTaskOutline;
    });
  }

  applyGoldilocksAndMilestones(
    drafts: MicroTaskOutline[],
    chunkMinutes: number[],
  ): MicroTaskOutline[] {
    const totalMinutes = chunkMinutes.reduce((sum, m) => sum + m, 0);
    const chunks = chunkMinutes.length;

    // Normalize first (keeps existing microTaskType/theme decisions when present)
    const normalized = drafts.map((d, idx) => this.normalizeDraft(d, idx, chunks));
    if (chunks <= 1) return normalized;

    // Milestones/checkpoints: every ~5h (within 4–6h) for big leaves.
    const milestoneRequired = totalMinutes >= 240; // 4h
    const milestoneEveryMinutes = 300; // 5h

    if (!milestoneRequired) return normalized;

    const checkpointIndices = this.getCheckpointIndices(
      chunkMinutes,
      milestoneEveryMinutes,
      milestoneRequired,
    );

    return this.assignMilestonesAndCheckpoints({
      normalized,
      chunkMinutes,
      milestoneEveryMinutes,
      milestoneRequired,
      checkpointIndices,
    });
  }

  private getCheckpointIndices(
    chunkMinutes: number[],
    milestoneEveryMinutes: number,
    milestoneRequired: boolean,
  ): Set<number> {
    const checkpointIndices = new Set<number>();
    if (!milestoneRequired) return checkpointIndices;

    const chunks = chunkMinutes.length;
    let cumulative = 0;
    let nextBoundary = milestoneEveryMinutes;

    for (let i = 0; i < chunks; i++) {
      cumulative += chunkMinutes[i];
      while (cumulative >= nextBoundary) {
        checkpointIndices.add(i);
        nextBoundary += milestoneEveryMinutes;
      }
    }
    checkpointIndices.add(chunks - 1);
    return checkpointIndices;
  }

  private assignMilestonesAndCheckpoints(
    params: AssignMilestonesParamsDto,
  ): MicroTaskOutline[] {
    const {
      normalized,
      chunkMinutes,
      milestoneEveryMinutes,
      milestoneRequired,
      checkpointIndices,
    } = params;
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
        } as MicroTaskOutline;
      }

      return {
        ...d,
        milestoneIndex,
      } as MicroTaskOutline;
    });
  }

  private normalizeDraft(
    d: Partial<MicroTaskDraft>,
    idx: number,
    total: number,
  ): MicroTaskOutline {
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
    } as MicroTaskOutline;
  }
}
