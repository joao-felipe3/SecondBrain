import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { ChecklistItemDto } from '../../dto/task/create-task.dto';
import {
  ChecklistValidationResult,
  TaskHistorySummary,
  ChecklistHistoryProjectRef,
} from '../../interfaces';
import { FindSimilarTasksDto } from '../../dto';

export { ChecklistValidationResult, TaskHistorySummary, ChecklistHistoryProjectRef };

@Injectable()
export class ChecklistService {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

  // ===========================================================================
  // 1. Historical Similarity Analysis
  // ===========================================================================

  async findSimilarTasksInProject(dto: FindSimilarTasksDto): Promise<TaskHistorySummary[]> {
    const { projectId, microTaskType, limit = 3 } = dto;
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
