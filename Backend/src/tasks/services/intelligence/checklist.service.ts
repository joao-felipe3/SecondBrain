import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { ChecklistService } from '../shared/checklist.service';
import { TasksInputService } from '../workflow/input.service';
import { GeminiService } from '../../../ai/gemini.service';

export type ChecklistHistoryProjectRef =
  | string
  | Types.ObjectId
  | {
      _id: string | Types.ObjectId;
    };

@Injectable()
export class TasksChecklistService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly checklistService: ChecklistService,
    private readonly inputService: TasksInputService,
    private readonly geminiService: GeminiService,
  ) {}

  async updateMicroTaskChecklist(id: string, checklist: Array<string | any>): Promise<any> {
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

  async updateChecklistItem(taskId: string, itemIndex: string, completed: boolean): Promise<any> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }

    const index = parseInt(itemIndex, 10);
    if (!Number.isFinite(index) || index < 0) {
      throw new BadRequestException(`Item ID inválido: ${itemIndex}`);
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    if (!Array.isArray(task.checklist) || task.checklist.length === 0) {
      throw new BadRequestException('Tarefa não possui checklist');
    }

    if (index >= task.checklist.length) {
      throw new BadRequestException(
        `Item index ${index} fora do intervalo (checklist tem ${task.checklist.length} itens)`,
      );
    }

    const checklistItem = task.checklist[index];
    if (typeof checklistItem === 'string') {
      throw new BadRequestException(`Item ${index} é uma string, não objeto com completed`);
    }

    (checklistItem as any).completed = Boolean(completed);

    const checklistItems = task.checklist.filter((item) => typeof item !== 'string');
    const completionPercentage = this.checklistService.calculateCompletionPercentage(
      checklistItems as any,
    );

    const updatedTask = await task.save();

    return {
      ...updatedTask.toObject(),
      completionPercentage,
    } as any;
  }

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

    if (!Array.isArray(task.checklist) || task.checklist.length === 0) {
      return { isValid: true };
    }

    const checklistItems = task.checklist.map((entry: any) => {
      if (typeof entry === 'string') return { completed: false };
      if (entry && typeof entry === 'object') return { completed: Boolean(entry.completed) };
      return { completed: false };
    });

    return this.checklistService.validateChecklistCompletion(checklistItems as any);
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

    if (!isHabit && Array.isArray(task.checklist) && task.checklist.length > 0) {
      const checklistItems = task.checklist.map((entry: any) => {
        if (typeof entry === 'string') return { completed: false };
        if (entry && typeof entry === 'object') return { completed: Boolean(entry.completed) };
        return { completed: false };
      });

      const checklistResult = this.checklistService.validateChecklistCompletion(checklistItems as any);
      if (!checklistResult.isValid) {
        errors.push(checklistResult.reason || 'Checklist incomplete');
      }
    }

    if (!isHabit && task.microTaskType && !Number.isFinite(task.pertExpectedMinutes || 0)) {
      errors.push('PERT estimate missing');
    }

    return { valid: errors.length === 0, errors };
  }

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
    let historicalContext = '';
    if (projectId && typeof projectId === 'string') {
      const similarTasks = await this.checklistService.findSimilarTasksInProject(
        projectId,
        microTaskType,
        3,
      );
      historicalContext = this.checklistService.enrichHistoryContext(similarTasks);
    } else if (projectId && typeof projectId === 'object' && '_id' in projectId && projectId._id) {
      const similarTasks = await this.checklistService.findSimilarTasksInProject(
        projectId._id.toString(),
        microTaskType,
        3,
      );
      historicalContext = this.checklistService.enrichHistoryContext(similarTasks);
    }

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
}