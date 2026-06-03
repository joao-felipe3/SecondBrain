import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateTaskDto, ChecklistItemDto } from '../../dto/create-task.dto';

@Injectable()
export class TasksInputService {

  // ===========================================================================
  // 1. Validation
  // ===========================================================================

  public validatePertInput(dto: Partial<CreateTaskDto>): void {
    const o = dto.pertOptimisticMinutes;
    const m = dto.pertMostLikelyMinutes;
    const p = dto.pertPessimisticMinutes;

    if (o === undefined && m === undefined && p === undefined) return;
    if (o === undefined || m === undefined || p === undefined) {
      throw new BadRequestException(
        'Para PERT manual, informe pertOptimisticMinutes, pertMostLikelyMinutes e pertPessimisticMinutes.',
      );
    }

    this.validatePertValuesArePositive(o, m, p);
    this.validatePertOrder(o, m, p);
  }

  // ===========================================================================
  // 2. Normalization
  // ===========================================================================

  public normalizeChecklist(
    checklist?: Array<string | ChecklistItemDto>,
  ): Array<{ item: string; completed: boolean; order: number }> | undefined {
    if (!Array.isArray(checklist) || checklist.length === 0) {
      return undefined;
    }

    const normalized = checklist
      .map((entry, index) => this.normalizeChecklistItem(entry, index))
      .filter((entry): entry is { item: string; completed: boolean; order: number } => entry !== null);

    return normalized.length > 0 ? normalized : undefined;
  }

  // ===========================================================================
  // 3. Private Helpers
  // ===========================================================================

  private validatePertValuesArePositive(o: number, m: number, p: number): void {
    if (!(o > 0 && m > 0 && p > 0)) {
      throw new BadRequestException('Valores PERT devem ser maiores que zero.');
    }
  }

  private validatePertOrder(o: number, m: number, p: number): void {
    if (!(o < m && m < p)) {
      throw new BadRequestException('PERT inválido: use optimistic < mostLikely < pessimistic.');
    }
  }

  private normalizeChecklistItem(
    entry: string | ChecklistItemDto,
    index: number,
  ): { item: string; completed: boolean; order: number } | null {
    if (typeof entry === 'string') {
      const item = entry.trim();
      return item ? { item, completed: false, order: index } : null;
    }

    if (!entry || typeof entry !== 'object') return null;
    const item = String(entry.item || '').trim();
    if (!item) return null;

    return {
      item,
      completed: Boolean(entry.completed),
      order: Number.isFinite(entry.order) ? Number(entry.order) : index,
    };
  }
}
