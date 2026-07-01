import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiService } from '../../../ai/gemini.service';
import { TaskDocument } from '../../schemas/task.schema';
import { TaskCompletionFeedbackDocument } from '../../schemas/task-completion-feedback.schema';
import { ChecklistItemDto } from '../../dto/task/create-task.dto';
import { CompletionFeedbackPayload } from '../../interfaces';
import { buildFeedbackPrompt, buildNextStepsPrompt } from '../../../ai/prompts/feedback.prompts';

export { CompletionFeedbackPayload };

@Injectable()
export class FeedbackService {
  constructor(
    private readonly geminiService: GeminiService,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('TaskCompletionFeedback')
    private readonly feedbackModel: Model<TaskCompletionFeedbackDocument>,
  ) {}

  // ===========================================================================
  // 1. Public API Methods
  // ===========================================================================

  async generateCompletionFeedback(id: string, payload?: CompletionFeedbackPayload): Promise<string> {
    const task = await this.validateAndGetTask(id);
    const inputSnapshot = this.createInputSnapshot(task);

    if (this.isUserFeedbackPayload(payload)) {
      return this.saveUserFeedback(task, inputSnapshot, payload!);
    }

    try {
      const timeSpentMinutes = task.pomodorosDid ? task.pomodorosDid * 25 : undefined;
      const structured = await this.generateFeedbackOnCompletion(task, task.checklist, timeSpentMinutes);
      return JSON.stringify(structured);
    } catch (err: unknown) {
      await this.saveErrorFeedback(task, inputSnapshot, err as Error);
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
    if (!task || !task._id) {
      throw new BadRequestException('Task inválida');
    }

    const checklistSummary = this.buildChecklistSummary(checklist);
    const percent = this.calculateChecklistCompletionPercent(checklistSummary);
    const prompt = buildFeedbackPrompt({
      taskName: String(task.name || ''),
      taskDescription: task.description ? String(task.description) : undefined,
      percent,
      checklistLength: checklistSummary.length,
      timeSpentMinutes,
    });

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.3,
        maxOutputTokens: 400,
      });

      const parsed = this.safeParseJson(raw) || {};
      const feedbackObj = this.buildFeedbackObject(parsed, task.name, percent);

      await this.saveSuccessFeedback(task, checklistSummary, timeSpentMinutes, feedbackObj);

      return feedbackObj;
    } catch (err: unknown) {
      await this.saveErrorFeedbackOnCompletion(task, checklistSummary, timeSpentMinutes, err as Error);
      throw err;
    }
  }

  async suggestNextSteps(
    task: TaskDocument,
    feedback: string | Record<string, unknown>,
  ): Promise<Array<{ title: string; description: string }>> {
    if (!task || !task._id) {
      throw new BadRequestException('Task inválida');
    }

    const prompt = buildNextStepsPrompt({ taskName: String(task.name || ''), feedback });

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return this.parseNextSteps(parsed);
      }

      return this.getFallbackNextSteps();
    } catch {
      return this.getFallbackNextSteps();
    }
  }

  // ===========================================================================
  // 2. Private Helper Methods: Validation & Snapshotting
  // ===========================================================================

  private async validateAndGetTask(id: string): Promise<TaskDocument> {
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

    return task;
  }

  private createInputSnapshot(task: TaskDocument): Record<string, any> {
    return {
      name: task.name,
      description: task.description,
      checklist: task.checklist,
      pomodoros: task.pomodorosDid,
      experience: task.experience,
      difficulty: task.difficult,
    };
  }

  private isUserFeedbackPayload(payload?: CompletionFeedbackPayload): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    return (
      'celebration' in payload ||
      'validation' in payload ||
      'question' in payload ||
      'impediments' in payload ||
      'selectedSteps' in payload ||
      'action' in payload
    );
  }

  // ===========================================================================
  // 3. Private Helper Methods: Persistences
  // ===========================================================================

  private async saveUserFeedback(
    task: TaskDocument,
    inputSnapshot: Record<string, any>,
    payload: CompletionFeedbackPayload,
  ): Promise<string> {
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

  private async saveErrorFeedback(
    task: TaskDocument,
    inputSnapshot: Record<string, any>,
    error: Error,
  ): Promise<void> {
    await this.feedbackModel.create({
      task: task._id,
      project: task.project ? new Types.ObjectId(task.project.toString()) : undefined,
      modelName: this.geminiService.getModelName(),
      promptVersion: 'catchball-v1',
      inputSnapshot,
      error: String(error?.message ?? error),
    });
  }

  private async saveSuccessFeedback(
    task: TaskDocument,
    checklistSummary: any[],
    timeSpentMinutes: number | undefined,
    feedbackObj: any,
  ): Promise<void> {
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
  }

  private async saveErrorFeedbackOnCompletion(
    task: TaskDocument,
    checklistSummary: any[],
    timeSpentMinutes: number | undefined,
    error: Error,
  ): Promise<void> {
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
        error: String(error?.message ?? error),
      });
    } catch {
      // Ignore database creation errors when tracking errors
    }
  }

  // ===========================================================================
  // 4. Private Helper Methods: Formatting & Prompts
  // ===========================================================================

  private buildChecklistSummary(
    checklist?: Array<string | ChecklistItemDto>,
  ): Array<{ item: string; completed: boolean }> {
    if (!Array.isArray(checklist)) {
      return [];
    }
    return checklist.map((it) => ({
      item: typeof it === 'string' ? it : it.item,
      completed: typeof it === 'string' ? false : !!it.completed,
    }));
  }

  private calculateChecklistCompletionPercent(
    checklistSummary: Array<{ item: string; completed: boolean }>,
  ): number {
    if (checklistSummary.length === 0) {
      return 100;
    }
    const completedCount = checklistSummary.filter((c) => c.completed).length;
    return Math.round((completedCount / checklistSummary.length) * 100);
  }

  private buildFeedbackObject(
    parsed: Record<string, any>,
    taskName: string,
    percent: number,
  ): { celebration: string; validation: string; question: string; suggestion: string } {
    const celebration = String(parsed.celebration ?? parsed.praise ?? parsed.recognition ?? '').trim();
    const validation = String(parsed.validation ?? parsed.learning ?? '').trim();
    const question = String(parsed.question ?? parsed.inquiry ?? parsed.nextStep ?? '').trim();
    const suggestion = String(parsed.suggestion ?? parsed.suggest ?? parsed.nextStep ?? '').trim();

    return {
      celebration: celebration || `Parabéns por concluir "${String(taskName || '')}".`,
      validation: validation || `Checklist: ${percent}% completo.`,
      question: question || 'Houve algum impedimento durante a execução? (resuma em 1 frase)',
      suggestion:
        suggestion || 'Sugestão: revisar os pontos não concluídos e planejar próximo passo (PDCA).',
    };
  }

  private buildNextStepsPrompt(task: TaskDocument, feedback: string | Record<string, unknown>): string {
    return [
      'Baseado no feedback abaixo, gere 3 próximos passos acionáveis e curtos (título + descrição).',
      `Tarefa: ${String(task.name || '')}`,
      feedback ? `Feedback: ${typeof feedback === 'string' ? feedback : JSON.stringify(feedback)}` : '',
      '',
      'Retorne APENAS um array JSON de objetos com chaves: title (string), description (string).',
      'Exemplo: [{"title":"Revisar checklist","description":"Corrigir item X e atualizar definição de pronto"}]',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseNextSteps(parsed: Array<any>): Array<{ title: string; description: string }> {
    return parsed.slice(0, 5).map((p) => {
      const anyP = p as Record<string, unknown>;
      return {
        title: String(anyP.title || anyP.name || '').trim(),
        description: String(anyP.description || anyP.desc || '').trim(),
      };
    });
  }

  private getFallbackNextSteps(): Array<{ title: string; description: string }> {
    return [
      {
        title: 'Revisar checklist',
        description: 'Verificar itens não concluídos e atualizar definição de pronto.',
      },
      {
        title: 'Planejar próximo passo',
        description: 'Criar uma micro-tarefa com o próximo passo sugerido.',
      },
    ];
  }

  // ===========================================================================
  // 5. Private Parsing Utils
  // ===========================================================================

  private safeParseJson(raw: string): any | null {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    const arrMatch = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/);
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
