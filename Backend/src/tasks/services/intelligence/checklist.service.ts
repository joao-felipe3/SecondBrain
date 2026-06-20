import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument, TaskChecklistItem } from '../../schemas/task.schema';
import { ChecklistItemDto } from '../../dto/task/create-task.dto';
import { TasksInputService } from '../workflow/input.service';
import { GeminiService } from '../../../ai/gemini.service';
import {
  ChecklistValidationResult,
  TaskHistorySummary,
  ChecklistHistoryProjectRef,
} from '../../interfaces';

export { ChecklistValidationResult, TaskHistorySummary, ChecklistHistoryProjectRef };

@Injectable()
export class ChecklistService {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

  // ===========================================================================
  // 1. Historical Similarity Analysis
  // ===========================================================================

  async findSimilarTasksInProject(
    projectId: string,
    microTaskType?: string,
    limit: number = 3,
  ): Promise<TaskHistorySummary[]> {
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return [];
    }

    if (!microTaskType || !['habit', 'complex', 'quick', 'subtask'].includes(microTaskType)) {
      return [];
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const similars = await this.taskModel
        .find({
          project: new Types.ObjectId(projectId),
          microTaskType: microTaskType,
          status: 'completed',
          createdAt: { $gte: thirtyDaysAgo },
          checklist: { $exists: true, $ne: null, $type: 'array' },
          'checklist.0': { $exists: true },
        })
        .select('name description checklist')
        .limit(limit)
        .exec();

      return similars.map((task) => ({
        name: task.name,
        description: task.description,
        checklist: task.checklist
          ? task.checklist.map((item) => {
              if (typeof item === 'string') return { item };
              return { item: item.item || '' };
            })
          : undefined,
      }));
    } catch {
      return [];
    }
  }

  enrichHistoryContext(tasks: TaskHistorySummary[]): string {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return '';
    }

    const summaries = tasks
      .filter((t) => t && t.name)
      .map((t) => {
        const items =
          t.checklist && t.checklist.length > 0 ? t.checklist.map((c) => `- ${c.item}`).join('\n') : '';
        return `Tarefa: ${t.name}\nChecklist: ${items || 'N/A'}`;
      })
      .join('\n\n');

    return summaries ? `\n\nTarefas similares concluídas no histórico:\n${summaries}` : '';
  }

  // ===========================================================================
  // 2. Checklist Validation & Metrics
  // ===========================================================================

  validateChecklistStructure(checklist?: Array<ChecklistItemDto | string>): ChecklistValidationResult {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return {
        isValid: false,
        reason: 'Checklist não pode estar vazio.',
      };
    }

    if (checklist.length < 3) {
      return {
        isValid: false,
        reason: `Checklist deve ter no mínimo 3 itens. Atual: ${checklist.length}.`,
      };
    }

    if (checklist.length > 10) {
      return {
        isValid: false,
        reason: `Checklist não pode ter mais de 10 itens. Atual: ${checklist.length}.`,
      };
    }

    const items = new Set<string>();
    for (const entry of checklist) {
      let item: string;
      if (typeof entry === 'string') {
        item = entry.trim();
      } else if (entry && typeof entry === 'object' && 'item' in entry) {
        item = String(entry.item || '').trim();
      } else {
        return {
          isValid: false,
          reason: 'Formato inválido de item do checklist.',
        };
      }

      if (!item) {
        return {
          isValid: false,
          reason: 'Itens do checklist não podem estar vazios.',
        };
      }

      if (items.has(item.toLowerCase())) {
        return {
          isValid: false,
          reason: `Item duplicado no checklist: "${item}".`,
        };
      }

      items.add(item.toLowerCase());
    }

    return { isValid: true };
  }

  validateChecklistCompletion(checklist?: Array<{ completed: boolean }>): ChecklistValidationResult {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return { isValid: true };
    }

    const completed = checklist.filter((item) => item.completed).length;
    const total = checklist.length;
    const percentage = (completed / total) * 100;

    if (percentage < 100) {
      return {
        isValid: false,
        reason: `Checklist incompleto: ${completed}/${total} (${Math.round(percentage)}%). Completa todos os itens antes de concluir.`,
      };
    }

    return { isValid: true };
  }

  calculateCompletionPercentage(checklist?: Array<{ completed: boolean }>): number {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return 0;
    }

    const completed = checklist.filter((item) => item.completed).length;
    return Math.round((completed / checklist.length) * 100);
  }
}

@Injectable()
export class TasksChecklistService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly checklistService: ChecklistService,
    private readonly inputService: TasksInputService,
    private readonly geminiService: GeminiService,
  ) {}

  public validateChecklistStructure(
    checklist?: Array<ChecklistItemDto | string>,
  ): ChecklistValidationResult {
    return this.checklistService.validateChecklistStructure(checklist);
  }

  // ===========================================================================
  // 1. Checklist Lifecycle & Management
  // ===========================================================================

  async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const normalizedChecklist = this.inputService.normalizeChecklist(checklist);
    if (!normalizedChecklist || normalizedChecklist.length === 0) {
      throw new BadRequestException('Checklist inválido: informe pelo menos um item.');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, { checklist: normalizedChecklist }, { new: true })
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
  }

  async updateChecklistItem(
    taskId: string,
    itemIndex: string,
    completed: boolean,
  ): Promise<TaskDocument & { completionPercentage: number }> {
    const index = this.parseAndValidateItemIndex(itemIndex);
    const task = await this.getTaskByIdOrThrow(taskId);

    const checklist = task.checklist;
    if (!Array.isArray(checklist) || checklist.length === 0) {
      throw new BadRequestException('Tarefa não possui checklist');
    }

    if (index >= checklist.length) {
      throw new BadRequestException(
        `Item index ${index} fora do intervalo (checklist tem ${checklist.length} itens)`,
      );
    }

    const checklistItem = checklist[index];
    if (typeof checklistItem === 'string') {
      throw new BadRequestException(`Item ${index} é uma string, não objeto com completed`);
    }

    checklistItem.completed = Boolean(completed);

    const checklistObjects = checklist.filter(
      (item): item is TaskChecklistItem => typeof item !== 'string',
    );
    const completionPercentage = this.checklistService.calculateCompletionPercentage(checklistObjects);

    const updatedTask = await task.save();
    return Object.assign(updatedTask, { completionPercentage });
  }

  private parseAndValidateItemIndex(itemIndex: string): number {
    const index = parseInt(itemIndex, 10);
    if (!Number.isFinite(index) || index < 0) {
      throw new BadRequestException(`Item ID inválido: ${itemIndex}`);
    }
    return index;
  }

  private async getTaskByIdOrThrow(taskId: string): Promise<TaskDocument> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }
    return task;
  }

  // ===========================================================================
  // 2. Quality Gates & Validation
  // ===========================================================================

  async validateCompletionRequirements(taskId: string): Promise<{ isValid: boolean; reason?: string }> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      return {
        isValid: false,
        reason: `ID inválido: ${taskId}`,
      };
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return {
        isValid: false,
        reason: `Tarefa com id ${taskId} não encontrada`,
      };
    }

    const checklist = task.checklist;
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return { isValid: true };
    }

    const checklistItems = checklist.map((entry) => {
      if (typeof entry === 'string') return { completed: false };
      return { completed: Boolean(entry.completed) };
    });

    return this.checklistService.validateChecklistCompletion(checklistItems);
  }

  async getValidationErrors(taskId: string): Promise<{ valid: boolean; errors: string[] }> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      return { valid: false, errors: [`Invalid id: ${taskId}`] };
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return { valid: false, errors: [`Task not found: ${taskId}`] };
    }

    const errors: string[] = [];
    const isHabit =
      task.microTaskType === 'habit' || Boolean(task.parentRecurringId) || Boolean(task.recurringRule);

    if (!isHabit) {
      this.checkChecklistErrors(task, errors);
      this.checkPertErrors(task, errors);
    }

    return { valid: errors.length === 0, errors };
  }

  private checkChecklistErrors(task: TaskDocument, errors: string[]): void {
    const checklist = task.checklist;
    if (Array.isArray(checklist) && checklist.length > 0) {
      const checklistItems = checklist.map((entry) => {
        if (typeof entry === 'string') return { completed: false };
        return { completed: Boolean(entry.completed) };
      });

      const checklistResult = this.checklistService.validateChecklistCompletion(checklistItems);
      if (!checklistResult.isValid) {
        errors.push(checklistResult.reason || 'Checklist incomplete');
      }
    }
  }

  private checkPertErrors(task: TaskDocument, errors: string[]): void {
    if (task.microTaskType && !Number.isFinite(task.pertExpectedMinutes || 0)) {
      errors.push('PERT estimate missing');
    }
  }

  // ===========================================================================
  // 3. AI Generation
  // ===========================================================================

  async generateChecklistForTask(
    taskName: string,
    description?: string,
    microTaskType?: string,
  ): Promise<string[]> {
    return this.geminiService.generateChecklistForTask(taskName, description, microTaskType);
  }

  async generateChecklistWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    projectId?: ChecklistHistoryProjectRef,
  ): Promise<string[]> {
    const historicalContext = await this.buildHistoricalContext(projectId, microTaskType);

    if (historicalContext) {
      return this.geminiService.generateChecklistWithHistory(
        taskName,
        description,
        microTaskType,
        historicalContext,
      );
    }

    return this.geminiService.generateChecklistForTask(taskName, description, microTaskType);
  }

  private async buildHistoricalContext(
    projectId?: ChecklistHistoryProjectRef,
    microTaskType?: string,
  ): Promise<string> {
    if (!projectId) {
      return '';
    }

    let targetProjectId = '';
    if (typeof projectId === 'string') {
      targetProjectId = projectId;
    } else if (typeof projectId === 'object' && '_id' in projectId && projectId._id) {
      targetProjectId = projectId._id.toString();
    }

    if (!targetProjectId) {
      return '';
    }

    const similarTasks = await this.checklistService.findSimilarTasksInProject(
      targetProjectId,
      microTaskType,
      3,
    );
    return this.checklistService.enrichHistoryContext(similarTasks);
  }
}
