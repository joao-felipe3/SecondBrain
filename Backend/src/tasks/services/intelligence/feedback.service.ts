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
      const structured = await this.generateFeedbackOnCompletion({ task, checklist: task.checklist, timeSpentMinutes });
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

  async generateFeedbackOnCompletion(params: {
    task: TaskDocument;
    checklist?: Array<string | ChecklistItemDto>;
    timeSpentMinutes?: number;
  }): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    const { task, checklist, timeSpentMinutes } = params;
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
      const feedbackObj = await this.geminiService.generateCompletionFeedbackStructured(prompt);

      if (!feedbackObj.celebration) feedbackObj.celebration = `Parabéns por concluir "${String(task.name || '')}".`;
      if (!feedbackObj.validation) feedbackObj.validation = `Checklist: ${percent}% completo.`;
      if (!feedbackObj.question) feedbackObj.question = 'Houve algum impedimento durante a execução? (resuma em 1 frase)';
      if (!feedbackObj.suggestion) feedbackObj.suggestion = 'Sugestão: revisar os pontos não concluídos e planejar próximo passo (PDCA).';

      await this.saveSuccessFeedback({ task, checklistSummary, timeSpentMinutes, feedbackObj });

      return feedbackObj;
    } catch (err: unknown) {
      await this.saveErrorFeedbackOnCompletion({ task, checklistSummary, timeSpentMinutes, error: err as Error });
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

    return this.geminiService.generateNextSteps(task.name, feedback);
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

  private async saveSuccessFeedback(params: {
    task: TaskDocument;
    checklistSummary: any[];
    timeSpentMinutes?: number;
    feedbackObj: any;
  }): Promise<void> {
    const { task, checklistSummary, timeSpentMinutes, feedbackObj } = params;
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

  private async saveErrorFeedbackOnCompletion(params: {
    task: TaskDocument;
    checklistSummary: any[];
    timeSpentMinutes?: number;
    error: Error;
  }): Promise<void> {
    const { task, checklistSummary, timeSpentMinutes, error } = params;
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

}
