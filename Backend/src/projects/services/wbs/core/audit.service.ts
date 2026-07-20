import { Injectable } from '@nestjs/common';
import { computeBatchMetrics } from '../utils/metrics-calculator.util';
import {
  LeafAuditResult,
  AuditLeafDiscrepancyInput,
  ApplyGuardrailsParams,
  BatchMetricsResult,
} from '../../../interfaces';
import { WbsAiService } from '../../../../ai/services/projects/wbs-ai.service';

// Audits discrepancies between WBS estimates and generated micro-tasks
@Injectable()
export class AuditService {
  constructor(private readonly wbsAiService: WbsAiService) {}

  private getModelOverride(): string | undefined {
    const m =
      this.safeEnv('WBS_GEMINI_MODEL') ||
      this.safeEnv('WBS_FAST_MODEL') ||
      this.safeEnv('WBS_MODEL_OVERRIDE');
    return m || undefined;
  }

  private safeEnv(name: string): string {
    return String(process.env[name] ?? '').trim();
  }

  // Audit a discrepancy between a WBS leaf estimate and its generated micro-tasks
  async auditLeafDiscrepancy(
    project: { name?: string },
    dto: AuditLeafDiscrepancyInput,
  ): Promise<LeafAuditResult> {
    const discrepancyMetrics = this.computeDiscrepancyMetrics(dto);
    const duplicateMetrics = this.computeDuplicateMetrics(Array.isArray(dto?.tasks) ? dto.tasks : []);
    const tasksPreview = this.formatTasksPreview(Array.isArray(dto?.tasks) ? dto.tasks : []);

    const modelOverride = this.getModelOverride();

    const parsedResponse = await this.wbsAiService.auditLeafDiscrepancy({
      projectName: String(project?.name || 'Projeto').trim(),
      leafNodeName: String(dto.leafNode?.name || '').trim(),
      nodePath: String(dto.nodePath || '').trim(),
      budgetHours: discrepancyMetrics.budgetHours,
      generatedHours: discrepancyMetrics.generatedHours,
      diffPct: discrepancyMetrics.diffPct,
      taskCount: dto.tasks?.length || 0,
      duplicateRatio: duplicateMetrics.duplicateRatio,
      topDuplicateKeys: duplicateMetrics.topDuplicateKeys,
      modelOverride,
      tasksPreview,
      dupScore: Number(duplicateMetrics.repetitionMetrics?.dupScore ?? 0),
      similarScore: Number(duplicateMetrics.repetitionMetrics?.similarScore ?? 0),
    });

    const finalResult = this.applyGuardrails({
      diagnosis: parsedResponse.diagnosis,
      suggestedAction: parsedResponse.suggestedAction,
      duplicateRatio: duplicateMetrics.duplicateRatio,
      repetitionMetrics: duplicateMetrics.repetitionMetrics,
      diffPct: discrepancyMetrics.diffPct,
      taskLength: Array.isArray(dto?.tasks) ? dto.tasks.length : 0,
    });

    const guardrailsChanged =
      finalResult.diagnosis !== parsedResponse.diagnosis ||
      finalResult.suggestedAction !== parsedResponse.suggestedAction;
    const rationale = guardrailsChanged
      ? `${parsedResponse.rationale}\n\n[Guardrails] Ajuste automático: diagnosis="${parsedResponse.diagnosis}"→"${finalResult.diagnosis}", suggestedAction="${parsedResponse.suggestedAction}"→"${finalResult.suggestedAction}".`
      : parsedResponse.rationale;

    return {
      diagnosis: finalResult.diagnosis,
      rationale,
      suggestedAction: finalResult.suggestedAction,
      suggestedEstimatedHours: parsedResponse.suggestedEstimatedHours,
    };
  }

  // Compute percentual difference between top-down estimate and bottom-up generated hours
  private computeDiscrepancyMetrics(dto: AuditLeafDiscrepancyInput): {
    budgetHours: number;
    generatedHours: number;
    diffPct: number;
  } {
    const budgetHours = Number(dto?.leafNode?.estimatedHours || 0);
    const generatedHours = Number(dto?.generatedHours || 0);
    const diffPct = budgetHours > 0 ? ((generatedHours - budgetHours) / budgetHours) * 100 : 0;

    return { budgetHours, generatedHours, diffPct };
  }

  // Identifies duplicated tasks, calculates duplication ratio and repetition metrics
  private computeDuplicateMetrics(taskList: AuditLeafDiscrepancyInput['tasks']): {
    duplicateRatio: number;
    topDuplicateKeys: string;
    repetitionMetrics: BatchMetricsResult;
  } {
    const keyCounts = new Map<string, number>();

    for (const task of taskList) {
      const key = this.normalizeTaskKey(String(task?.name || ''));
      if (!key) continue;
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }

    const duplicatesRemovedIfDedupe = Array.from(keyCounts.values()).reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    );
    const duplicateRatio = taskList.length > 0 ? duplicatesRemovedIfDedupe / taskList.length : 0;

    const topDuplicateKeys = Array.from(keyCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => `${key}×${count}`)
      .join(', ');

    const repetitionMetrics = computeBatchMetrics(
      taskList.map((t) => ({
        name: t?.name,
        description: '',
        themeTag: t?.themeTag || t?.contextTag || '',
        microTaskType: t?.microTaskType,
      })),
    );

    return { duplicateRatio, topDuplicateKeys, repetitionMetrics };
  }

  private normalizeTaskKey(name: string): string {
    const raw = String(name || '')
      .trim()
      .toLowerCase();
    const withoutCounters = raw.replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g, '').trim();
    const normalized = withoutCounters
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized;
  }

  private formatTasksPreview(taskList: AuditLeafDiscrepancyInput['tasks']): string {
    return taskList
      .slice(0, 30)
      .map((task, idx) => this.formatTaskLine(task, idx))
      .join('\n');
  }

  private formatTaskLine(task: AuditLeafDiscrepancyInput['tasks'][number], index: number): string {
    const priority = Number(task?.priority ?? 4);
    const pomodoros = Number(task?.pomodorosPlanned ?? 1);
    const type = String(task?.microTaskType || '').trim();
    const theme = String(task?.themeTag || '').trim();
    const context = String(task?.contextTag || '').trim();
    const cognitive = String(task?.cognitiveMode || '').trim();
    const name = String(task?.name || '').trim();

    const tags = [
      theme ? `theme:${theme}` : '',
      context ? `ctx:${context}` : '',
      cognitive ? `cog:${cognitive}` : '',
    ].filter(Boolean);

    const tagsStr = tags.length ? ` [${tags.join(' | ')}]` : '';
    const typeStr = type ? ` (${type})` : '';

    return `${index + 1}. [P${priority}] ${pomodoros}🍅${typeStr}${tagsStr} — ${name}`;
  }

  private applyGuardrails(params: ApplyGuardrailsParams): {
    diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
    suggestedAction: 'rebaseline' | 'simplify';
  } {
    const { diagnosis, suggestedAction, duplicateRatio, repetitionMetrics, diffPct, taskLength } =
      params;
    let finalDiagnosis = diagnosis;
    let finalSuggestedAction = suggestedAction;

    const dupScore = Number(repetitionMetrics?.dupScore ?? 0);
    const similarScore = Number(repetitionMetrics?.similarScore ?? 0);
    const themesCount = Number(repetitionMetrics?.themesCount ?? 0);
    const verbVariety = Number(repetitionMetrics?.verbVariety ?? 0);
    const cognitiveVariety = Number(repetitionMetrics?.cognitiveVariety ?? 0);

    const strongRedundancy = duplicateRatio >= 0.5 || dupScore >= 0.55;
    const moderateRedundancy = duplicateRatio >= 0.4 || dupScore >= 0.4;
    // Keep "low redundancy" strict (aligns with prompt): below ~25% duplication signals.
    const lowRedundancy = duplicateRatio < 0.25 && dupScore < 0.25 && similarScore < 0.35;
    const highVariety =
      themesCount >= Math.min(6, Math.ceil(Math.max(1, taskLength) / 6)) ||
      verbVariety >= 0.45 ||
      cognitiveVariety >= 0.45;

    if (strongRedundancy && diffPct >= 90) {
      finalDiagnosis = 'gold_plating';
      finalSuggestedAction = 'simplify';
    } else if (moderateRedundancy && diffPct >= 120) {
      finalDiagnosis = diagnosis === 'underestimated' ? 'mixed' : diagnosis;
      finalSuggestedAction = 'simplify';
    } else if (finalDiagnosis === 'mixed' && strongRedundancy) {
      finalSuggestedAction = 'simplify';
    } else if (finalDiagnosis === 'gold_plating' && lowRedundancy && highVariety && diffPct <= 90) {
      finalDiagnosis = 'underestimated';
      finalSuggestedAction = 'rebaseline';
    }

    // Stronger guardrail: high overrun + low redundancy should be treated as underestimation.
    // If tasks are mostly distinct, a large diffPct is more likely "top-down too low" than "gold plating".
    if (lowRedundancy && diffPct >= 120) {
      finalDiagnosis = 'underestimated';
      finalSuggestedAction = 'rebaseline';
    }

    // Extra guardrail: if redundancy signals are low, avoid forcing simplify/gold_plating
    if (lowRedundancy) {
      if (finalSuggestedAction === 'simplify') {
        finalSuggestedAction = 'rebaseline';
      }
      if (finalDiagnosis === 'gold_plating') {
        finalDiagnosis = diffPct >= 90 ? 'mixed' : 'underestimated';
      }
    }

    return { diagnosis: finalDiagnosis, suggestedAction: finalSuggestedAction };
  }
}
