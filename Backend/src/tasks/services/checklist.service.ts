import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../schemas/task.schema';
import { ChecklistItemDto } from '../dto/create-task.dto';

export interface ChecklistValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface TaskHistorySummary {
  name: string;
  description?: string;
  checklist?: Array<{ item: string }>;
}

/**
 * ChecklistService: Validação, enriquecimento com histórico, e gerenciamento de checklist.
 *
 * Sprint 2 Focus:
 * - Validar estrutura de checklist (min/max itens, sem duplicatas)
 * - Buscar histórico de tarefas similares (RAG-like)
 * - Enriquecer contexto para GeminiService
 * - Validar conclusão de tarefa (exigir checklist 100%)
 */
@Injectable()
export class ChecklistService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
  ) {}

  /**
   * Busca tarefas similares completas no projeto.
   * Procura por tipo (microTaskType) e status=completed nos últimos 30 dias.
   *
   * @param projectId ID do projeto
   * @param microTaskType Tipo de micro-tarefa (habit, complex, quick, subtask)
   * @param limit Número máximo de tarefas (default 3)
   * @returns Array com tarefas similares completas
   */
  async findSimilarTasksInProject(
    projectId: string,
    microTaskType?: string,
    limit: number = 3,
  ): Promise<TaskHistorySummary[]> {
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      return [];
    }

    if (
      !microTaskType ||
      !['habit', 'complex', 'quick', 'subtask'].includes(microTaskType)
    ) {
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
          ? task.checklist.map((item: any) => ({ item: item.item || '' }))
          : undefined,
      }));
    } catch (error) {
      // Log error silently and return empty array as fallback
      return [];
    }
  }

  /**
   * Enriquece contexto histórico em texto para injetar no prompt do Gemini.
   *
   * @param tasks Array de tarefas similares do histórico
   * @returns String com resumo formatado ou vazio se sem histórico
   */
  enrichHistoryContext(tasks: TaskHistorySummary[]): string {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return '';
    }

    const summaries = tasks
      .filter((t) => t && t.name)
      .map((t) => {
        const items =
          t.checklist && t.checklist.length > 0
            ? t.checklist.map((c) => `- ${c.item}`).join('\n')
            : '';
        return `Tarefa: ${t.name}\nChecklist: ${items || 'N/A'}`;
      })
      .join('\n\n');

    return summaries
      ? `\n\nTarefas similares concluídas no histórico:\n${summaries}`
      : '';
  }

  /**
   * Valida a estrutura do checklist.
   *
   * Regras:
   * - Mínimo 3 itens, máximo 10
   * - Sem itens vazios ou duplicados
   * - Estrutura válida { item: string, completed: boolean, order: number }
   *
   * @param checklist Array de itens
   * @returns ValidationResult com isValid e reason (se inválido)
   */
  validateChecklistStructure(
    checklist?: Array<ChecklistItemDto | string>,
  ): ChecklistValidationResult {
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

    // Extract item strings para verificar duplicatas
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

  /**
   * Valida se checklist está 100% completo para conclusão de tarefa.
   * Usado quando tarefa possui checklist e precisa ser marcada como concluída.
   *
   * @param checklist Array de itens do checklist
   * @returns ValidationResult - passa se 100% ou vazio, falha se incompleto
   */
  validateChecklistCompletion(
    checklist?: Array<{ completed: boolean }>,
  ): ChecklistValidationResult {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return { isValid: true }; // Checklist vazio = permite conclusão
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

  /**
   * Calcula percentual de conclusão do checklist.
   *
   * @param checklist Array de itens
   * @returns Percentual (0-100)
   */
  calculateCompletionPercentage(
    checklist?: Array<{ completed: boolean }>,
  ): number {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return 0;
    }

    const completed = checklist.filter((item) => item.completed).length;
    return Math.round((completed / checklist.length) * 100);
  }
}
