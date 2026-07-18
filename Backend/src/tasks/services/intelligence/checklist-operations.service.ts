import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument, TaskChecklistItem } from '../../schemas/task.schema';
import { ChecklistItemDto } from '../../dto/task/create-task.dto';
import { TasksInputService } from '../workflow/input.service';
import { GeminiService } from '../../../ai/services/core/gemini.service';
import { ChecklistService } from './checklist.service';
import { ChecklistValidationResult, ChecklistHistoryProjectRef } from '../../interfaces';
import {
  UpdateChecklistTaskItemDto,
  GenerateChecklistDto,
  GenerateChecklistWithHistoryDto,
} from '../../dto';

@Injectable()
export class ChecklistOperationsService {
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
    dto: UpdateChecklistTaskItemDto,
  ): Promise<TaskDocument & { completionPercentage: number }> {
    const { taskId, itemIndex, completed } = dto;
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

  async generateChecklistForTask(dto: GenerateChecklistDto): Promise<string[]> {
    const { taskName, description, microTaskType } = dto;
    return this.geminiService.generateChecklistForTask(taskName, description, microTaskType);
  }

  async generateChecklistWithHistory(dto: GenerateChecklistWithHistoryDto): Promise<string[]> {
    const { taskName, description, microTaskType, projectId } = dto;
    const historicalContext = await this.buildHistoricalContext({ projectId, microTaskType });

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

  private async buildHistoricalContext(params: {
    projectId?: ChecklistHistoryProjectRef;
    microTaskType?: string;
  }): Promise<string> {
    const { projectId, microTaskType } = params;
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

    const similarTasks = await this.checklistService.findSimilarTasksInProject({
      projectId: targetProjectId,
      microTaskType,
      limit: 3,
    });
    return this.checklistService.enrichHistoryContext(similarTasks);
  }
}
