import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiService } from '../../../ai/gemini.service';
import { TaskDocument } from '../../schemas/task.schema';
import { TaskCompletionFeedbackDocument } from '../../schemas/task-completion-feedback.schema';
import { ChecklistItemDto } from '../../dto/task/create-task.dto';

export interface CompletionFeedbackPayload {
  celebration?: string;
  validation?: string;
  question?: string;
  impediments?: string[];
  selectedSteps?: string[];
  action?: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly geminiService: GeminiService,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('TaskCompletionFeedback')
    private readonly feedbackModel: Model<TaskCompletionFeedbackDocument>,
  ) {}

  // ===========================================================================
  // 1. Completion Feedback Generation
  // ===========================================================================

  async generateCompletionFeedback(id: string, payload?: CompletionFeedbackPayload): Promise<string> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (!task.isConcluded) {
      throw new BadRequestException('Task deve estar concluída para gerar feedback');
    }

    const inputSnapshot = {
      name: task.name,
      description: task.description,
      checklist: task.checklist,
      pomodoros: task.pomodorosDid,
      experience: task.experience,
      difficulty: task.difficult,
    };

    const isUserFeedbackPayload =
      payload &&
      typeof payload === 'object' &&
      ('celebration' in payload ||
        'validation' in payload ||
        'question' in payload ||
        'impediments' in payload ||
        'selectedSteps' in payload ||
        'action' in payload);

    if (isUserFeedbackPayload) {
      const feedbackText = JSON.stringify(payload);

      await this.feedbackModel.create({
        task: task._id,
        project: task.project ? new Types.ObjectId(task.project.toString()) : undefined,
        modelName: 'user-feedback',
        promptVersion: 'catchball-user-v1',
        inputSnapshot: {
          ...inputSnapshot,
          userFeedback: payload,
        },
        feedback: feedbackText,
      });

      return feedbackText;
    }

    try {
      const structured = await this.generateFeedbackOnCompletion(
        task,
        task.checklist,
        task.pomodorosDid ? task.pomodorosDid * 25 : undefined,
      );
      return JSON.stringify(structured);
    } catch (err: unknown) {
      const errorObj = err as Error;
      await this.feedbackModel.create({
        task: task._id,
        project: task.project ? new Types.ObjectId(task.project.toString()) : undefined,
        modelName: this.geminiService.getModelName(),
        promptVersion: 'catchball-v1',
        inputSnapshot,
        error: String(errorObj?.message ?? errorObj),
      });
      throw err;
    }
  }

  async getCompletionFeedback(id: string): Promise<{ feedback: string; createdAt: Date } | null> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const feedback = await this.feedbackModel
      .findOne({ task: id, feedback: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .select('feedback createdAt')
      .exec();

    if (!feedback) {
      return null;
    }

    return {
      feedback: feedback.feedback || '',
      createdAt: feedback.createdAt || new Date(),
    };
  }

  async generateFeedbackOnCompletion(
    task: TaskDocument,
    checklist?: Array<string | ChecklistItemDto>,
    timeSpentMinutes?: number,
  ): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    if (!task || !task._id) throw new BadRequestException('Task inválida');

    const checklistSummary = Array.isArray(checklist)
      ? checklist.map((it) => ({
          item: typeof it === 'string' ? it : it.item,
          completed: typeof it === 'string' ? false : !!it.completed,
        }))
      : [];

    const percent =
      checklistSummary.length > 0
        ? Math.round(
            (checklistSummary.filter((c) => c.completed).length / checklistSummary.length) * 100,
          )
        : 100;

    const prompt = [
      'Você é um receptor de bola (catchball) que fornece feedback curto e acionável quando uma tarefa é concluída.',
      `Tarefa: ${String(task.name || '')}`,
      task.description ? `Descrição: ${String(task.description)}` : '',
      `Checklist completion: ${percent}% (${checklistSummary.length} items)`,
      timeSpentMinutes ? `Tempo gasto (minutos): ${timeSpentMinutes}` : '',
      '',
      'Gere um JSON válido com exatamente essas chaves (strings):',
      '- celebration: uma frase curta parabenizando e reconhecendo o esforço',
      '- validation: resumo objetivo sobre o checklist e se a entrega atende critérios de aceitação (1 frase)',
      '- question: uma pergunta aberta sobre impedimentos ou riscos (1 frase)',
      '- suggestion: uma sugestão PDCA/next step (1 frase)',
      'Responda APENAS com o JSON, sem texto adicional, sem markdown.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.3,
        maxOutputTokens: 400,
      });

      const parsed = this.safeParseJson(raw) || {};

      const celebration = String(parsed.celebration ?? parsed.praise ?? parsed.recognition ?? '').trim();
      const validation = String(parsed.validation ?? parsed.learning ?? '').trim();
      const question = String(parsed.question ?? parsed.inquiry ?? parsed.nextStep ?? '').trim();
      const suggestion = String(parsed.suggestion ?? parsed.suggest ?? parsed.nextStep ?? '').trim();

      const feedbackObj = {
        celebration: celebration || `Parabéns por concluir "${String(task.name || '')}".`,
        validation: validation || `Checklist: ${percent}% completo.`,
        question: question || 'Houve algum impedimento durante a execução? (resuma em 1 frase)',
        suggestion:
          suggestion || 'Sugestão: revisar os pontos não concluídos e planejar próximo passo (PDCA).',
      };

      await this.feedbackModel.create({
        task: task._id,
        project: task.project ? new Types.ObjectId(task.project.toString()) : undefined,
        modelName: this.geminiService.getModelName(),
        promptVersion: 'catchball-v1',
        inputSnapshot: {
          name: task.name,
          checklist: checklistSummary,
          timeSpentMinutes,
        },
        feedback: JSON.stringify(feedbackObj),
      });

      return feedbackObj;
    } catch (err: unknown) {
      const errorObj = err as Error;
      try {
        await this.feedbackModel.create({
          task: task._id,
          project: task.project ? new Types.ObjectId(task.project.toString()) : undefined,
          modelName: this.geminiService.getModelName(),
          promptVersion: 'catchball-v1',
          inputSnapshot: {
            name: task.name,
            checklist: checklistSummary,
            timeSpentMinutes,
          },
          error: String(errorObj?.message ?? errorObj),
        });
      } catch {}
      throw err;
    }
  }

  async suggestNextSteps(
    task: TaskDocument,
    feedback: string | Record<string, unknown>,
  ): Promise<Array<{ title: string; description: string }>> {
    if (!task || !task._id) throw new BadRequestException('Task inválida');

    const prompt = [
      'Baseado no feedback abaixo, gere 3 próximos passos acionáveis e curtos (título + descrição).',
      `Tarefa: ${String(task.name || '')}`,
      feedback ? `Feedback: ${typeof feedback === 'string' ? feedback : JSON.stringify(feedback)}` : '',
      '',
      'Retorne APENAS um array JSON de objetos com chaves: title (string), description (string).',
      'Exemplo: [{"title":"Revisar checklist","description":"Corrigir item X e atualizar definição de pronto"}]',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5).map((p) => {
          const anyP = p as Record<string, unknown>;
          return {
            title: String(anyP.title || anyP.name || '').trim(),
            description: String(anyP.description || anyP.desc || '').trim(),
          };
        });
      }

      const fallback: Array<{ title: string; description: string }> = [];
      fallback.push({
        title: 'Revisar checklist',
        description: 'Verificar itens não concluídos e atualizar definição de pronto.',
      });
      fallback.push({
        title: 'Planejar próximo passo',
        description: 'Criar uma micro-tarefa com o próximo passo sugerido.',
      });
      return fallback;
    } catch {
      return [
        {
          title: 'Revisar checklist',
          description: 'Verificar itens não concluídos e atualizar definição de pronto.',
        },
      ];
    }
  }

  // ===========================================================================
  // 2. Private Helpers & Parsing
  // ===========================================================================

  private safeParseJson(raw: string): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    const arrMatch = cleaned.match(/\{[\s\S]*\}/);
    if (arrMatch) cleaned = arrMatch[0];
    try {
      return JSON.parse(cleaned);
    } catch {
      try {
        const safer = cleaned.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
        return JSON.parse(safer);
      } catch {
        return null;
      }
    }
  }
}
