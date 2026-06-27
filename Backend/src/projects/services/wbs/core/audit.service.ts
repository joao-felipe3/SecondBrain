import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../../ai/gemini.service';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { extractJsonObject } from '../utils/json-parser.util';
import { computeBatchMetrics } from '../utils/metrics-calculator.util';
import { LeafAuditResult } from '../../../interfaces';

// Audits discrepancies between WBS estimates and generated micro-tasks
@Injectable()
export class AuditService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  private getModelOverride(): string | undefined {
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

  // Audit a discrepancy between a WBS leaf estimate and its generated micro-tasks
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
  ): Promise<LeafAuditResult> {
    const discrepancyMetrics = this.computeDiscrepancyMetrics(dto);
    const duplicateMetrics = this.computeDuplicateMetrics(Array.isArray(dto?.tasks) ? dto.tasks : []);
    const tasksPreview = this.formatTasksPreview(Array.isArray(dto?.tasks) ? dto.tasks : []);

    const prompt = this.buildAuditPrompt(
      project,
      dto,
      discrepancyMetrics,
      duplicateMetrics,
      tasksPreview,
    );

    const geminiResponse = await this.callGeminiWithRetry(prompt);
    const parsedResponse = this.parseAuditResponse(geminiResponse);

    const finalResult = this.applyGuardrails(
      parsedResponse.diagnosis,
      parsedResponse.suggestedAction,
      duplicateMetrics.duplicateRatio,
      duplicateMetrics.repetitionMetrics,
      discrepancyMetrics.diffPct,
      Array.isArray(dto?.tasks) ? dto.tasks.length : 0,
    );

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
  private computeDiscrepancyMetrics(dto: any): {
    budgetHours: number;
    generatedHours: number;
    diffPct: number;
  } {
    const budgetHours = Number(dto?.leafNode?.estimatedHours || 0);
    const generatedHours = Number(dto?.generatedHours || 0);
    const diffPct = budgetHours > 0 ? ((generatedHours - budgetHours) / budgetHours) * 100 : 0;

    return { budgetHours, generatedHours, diffPct };
  }

  // Identifys duplicated tasks, calculates duplication ratio and repetition metrics
  private computeDuplicateMetrics(taskList: any[]): {
    duplicateRatio: number;
    topDuplicateKeys: string;
    repetitionMetrics: any;
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
      taskList.map((t: any) => ({
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

  private async callGeminiWithRetry(prompt: string): Promise<string> {
    const modelOverride = this.getModelOverride();

    const attemptCall = async (maxOutputTokens: number, temperature: number): Promise<string> => {
      return this.geminiService.generateContent(prompt, {
        model: modelOverride,
        responseMimeType: 'application/json',
        maxOutputTokens,
        temperature,
      });
    };

    try {
      return await attemptCall(2048, 0.2);
    } catch (err: any) {
      return await attemptCall(4096, 0.1);
    }
  }

  private parseAuditResponse(response: string): {
    diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
    rationale: string;
    suggestedAction: 'rebaseline' | 'simplify';
    suggestedEstimatedHours?: number;
  } {
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

    let suggestedEstimatedHours: number | undefined;
    if (parsed?.suggestedEstimatedHours !== undefined && parsed?.suggestedEstimatedHours !== null) {
      const hours = this.parseHoursValue(parsed.suggestedEstimatedHours);
      if (hours !== undefined) {
        suggestedEstimatedHours = Math.round(hours * 2) / 2;
      }
    }

    return { diagnosis, rationale, suggestedAction, suggestedEstimatedHours };
  }

  private parseHoursValue(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;

    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    const raw = String(value).trim();
    if (!raw) return undefined;

    // Accept formats like: "28", "28h", "28 horas", "28.5", "28,5"
    const match = raw.match(/\d+(?:[\.,]\d+)?/);
    if (!match) return undefined;

    const normalized = match[0].replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private formatTasksPreview(taskList: any[]): string {
    return taskList
      .slice(0, 30)
      .map((task, idx) => this.formatTaskLine(task, idx))
      .join('\n');
  }

  private formatTaskLine(task: any, index: number): string {
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

  // Build prompt to Gemini do the audit
  private buildAuditPrompt(
    project: any,
    dto: any,
    discrepancyMetrics: any,
    duplicateMetrics: any,
    tasksPreview: string,
  ): string {
    const budgetHours = discrepancyMetrics.budgetHours;
    const generatedHours = discrepancyMetrics.generatedHours;
    const diffPct = discrepancyMetrics.diffPct;
    const duplicateRatio = duplicateMetrics.duplicateRatio;
    const topDuplicateKeys = duplicateMetrics.topDuplicateKeys;
    const repetitionMetrics = duplicateMetrics.repetitionMetrics;
    const dupScore = Number(repetitionMetrics?.dupScore ?? 0);
    const similarScore = Number(repetitionMetrics?.similarScore ?? 0);
    return (
      `Você é um auditor de escopo e estimativas (WBS/PERT/EVM).\n\n` +
      `Contexto do projeto: ${String(project?.name || 'Projeto').trim()}\n` +
      `Pacote (WBS leaf): "${String(dto.leafNode?.name || '').trim()}"\n` +
      `Caminho: ${String(dto.nodePath || '').trim()}\n` +
      `Estimativa top-down do pacote: ${budgetHours.toFixed(1)}h\n` +
      `Estimativa bottom-up (micro-tarefas): ${generatedHours.toFixed(1)}h\n` +
      `Diferença: ${diffPct.toFixed(0)}%\n\n` +
      `Sinais automáticos (anti-gold-plating):\n` +
      `- totalTasks: ${dto.tasks?.length || 0}\n` +
      `- duplicateRatio(aprox): ${(duplicateRatio * 100).toFixed(0)}%\n` +
      `- dupScore: ${dupScore.toFixed(2)}\n` +
      `- similarScore: ${similarScore.toFixed(2)}\n` +
      `${topDuplicateKeys ? `- topRepeated: ${topDuplicateKeys}\n` : ''}` +
      `\n` +
      `Micro-tarefas (amostra):\n${tasksPreview || '(sem tarefas)'}\n\n` +
      `Tarefa: classifique a discrepância como UMA destas opções:\n` +
      `- underestimated = o pacote foi subestimado (tarefas são majoritariamente distintas/necessárias)\n` +
      `- gold_plating = há escopo desnecessário OU repetição excessiva (tarefas redundantes, opcionalidade clara, ou expansão de escopo fora do pacote)\n` +
      `- mixed = há evidência forte de ambos (use SOMENTE quando realmente houver sinais fortes dos dois lados)\n\n` +
      `Regras para evitar "sempre mixed" e para reduzir falso-positivo de gold_plating:\n` +
      `- Se duplicateRatio >= 40% OU dupScore >= 0.40, trate como forte sinal de redundância e prefira gold_plating ou mixed com suggestedAction=simplify.\n` +
      `- Se duplicateRatio < 25% E dupScore < 0.25 E similarScore < 0.35, prefira underestimated. Só use mixed se você identificar escopo opcional/fora do pacote.\n` +
      `- Com redundância baixa (regras acima), NÃO use gold_plating apenas por "granularidade"; micro-tarefas detalhadas são esperadas neste sistema.\n` +
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
      `}`
    );
  }

  private applyGuardrails(
    diagnosis: 'underestimated' | 'gold_plating' | 'mixed',
    suggestedAction: 'rebaseline' | 'simplify',
    duplicateRatio: number,
    repetitionMetrics: any,
    diffPct: number,
    taskLength: number,
  ): {
    diagnosis: 'underestimated' | 'gold_plating' | 'mixed';
    suggestedAction: 'rebaseline' | 'simplify';
  } {
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
