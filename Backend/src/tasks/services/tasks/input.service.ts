import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateTaskDto, ChecklistItemDto } from '../../dto/create-task.dto';

@Injectable()
export class TasksInputService {
  validatePertInput(dto: Partial<CreateTaskDto>) {
    const o = dto.pertOptimisticMinutes;
    const m = dto.pertMostLikelyMinutes;
    const p = dto.pertPessimisticMinutes;

    if (o === undefined && m === undefined && p === undefined) return;
    if (o === undefined || m === undefined || p === undefined) {
      throw new BadRequestException(
        'Para PERT manual, informe pertOptimisticMinutes, pertMostLikelyMinutes e pertPessimisticMinutes.',
      );
    }
    if (!(o > 0 && m > 0 && p > 0)) {
      throw new BadRequestException('Valores PERT devem ser maiores que zero.');
    }
    if (!(o < m && m < p)) {
      throw new BadRequestException(
        'PERT inválido: use optimistic < mostLikely < pessimistic.',
      );
    }
  }

  normalizeChecklist(
    checklist?: Array<string | ChecklistItemDto>,
  ): Array<{ item: string; completed: boolean; order: number }> | undefined {
    if (!Array.isArray(checklist) || checklist.length === 0) return undefined;

    const normalized = checklist
      .map((entry, index) => {
        if (typeof entry === 'string') {
          const item = entry.trim();
          if (!item) return null;
          return { item, completed: false, order: index };
        }

        if (!entry || typeof entry !== 'object') return null;
        const item = String(entry.item || '').trim();
        if (!item) return null;
        return {
          item,
          completed: Boolean(entry.completed),
          order: Number.isFinite(entry.order) ? Number(entry.order) : index,
        };
      })
      .filter(Boolean) as Array<{
      item: string;
      completed: boolean;
      order: number;
    }>;

    return normalized.length > 0 ? normalized : undefined;
  }
}
