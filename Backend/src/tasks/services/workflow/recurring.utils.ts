import { RecurringRuleDto, RecurringTaskOccurrenceDto, CreateTaskDto } from '../../dto/create-task.dto';
import { TaskDocument } from '../../schemas/task.schema';

// ===========================================================================
// Re-export specific utils for backwards compatibility
// ===========================================================================
export * from './recurring-validation.utils';
export * from './recurring-calculation.utils';

// ===========================================================================
// Date Helpers
// ===========================================================================

export function toDateKey(date: Date): string {
  const normalized = new Date(date);
  const year = normalized.getUTCFullYear();
  const month = String(normalized.getUTCMonth() + 1).padStart(2, '0');
  const day = String(normalized.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

// ===========================================================================
// Task & Payload Normalization Utils
// ===========================================================================

export function normalizeChecklistFromTask(task: TaskDocument): CreateTaskDto['checklist'] {
  if (!Array.isArray(task.checklist)) return [];

  return task.checklist
    .map((entry, index): NonNullable<CreateTaskDto['checklist']>[number] | null => {
      if (typeof entry === 'string') {
        return { item: entry, completed: false, order: index };
      }

      const item = String((entry as any).item || '');
      if (!item) return null;

      return {
        item,
        completed: false,
        order: Number.isFinite((entry as any).order) ? Number((entry as any).order) : index,
      };
    })
    .filter((item): item is NonNullable<CreateTaskDto['checklist']>[number] => item !== null);
}

export function computeParentRecurringId(task: TaskDocument): string {
  return String(task.parentRecurringId || task._id);
}

export function assembleOccurrencePayload(
  task: TaskDocument,
  nextDeadline: Date,
  recurringRule: RecurringRuleDto | undefined,
  normalizedChecklist: CreateTaskDto['checklist'],
  parentRecurringId: string,
): RecurringTaskOccurrenceDto {
  const payload: RecurringTaskOccurrenceDto = {
    ...task,
    checklist: normalizedChecklist,
    deadline: nextDeadline,
    pomodorosDid: 0,
    isConcluded: false,
    late: false,
    notification: new Date(nextDeadline.getTime() - 60 * 60 * 1000),
    parentRecurringId,
    isRecurringInstance: true,
    recurringState: 'pending',
    recurringRule,
    status: 'todo',
    statusUpdatedAt: new Date(),
    kanbanOrder: 0,
  } as RecurringTaskOccurrenceDto;

  return payload;
}
