import { RecurringRuleDto, RecurringExceptionDto } from '../../dto/create-task.dto';
import { toDateKey } from './recurring.utils';

// ===========================================================================
// Exception Parsing & Verification
// ===========================================================================

export function parseExceptions(raw?: unknown): RecurringExceptionDto[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const out: RecurringExceptionDto[] = [];
  for (const exception of raw) {
    const date = extractExceptionDate(exception);
    if (!date) continue;

    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const reason = extractExceptionReason(exception);
    out.push({ date: normalizedDate, reason });
  }

  return out.length > 0 ? out : undefined;
}

export function extractExceptionDate(rawException: unknown): Date | undefined {
  if (rawException instanceof Date) return rawException;
  if (!rawException || typeof rawException !== 'object') return undefined;

  const candidate = (rawException as Record<string, unknown>)['date'];
  if (candidate instanceof Date) return candidate;
  if (candidate === undefined || candidate === null) return undefined;

  const parsed = new Date(String(candidate));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function extractExceptionReason(rawException: unknown): string | undefined {
  if (!rawException || typeof rawException !== 'object') return undefined;

  const r = (rawException as Record<string, unknown>)['reason'];
  return typeof r === 'string' ? r : undefined;
}

// ===========================================================================
// Exception Cleaning & Exclusion Check
// ===========================================================================

export function cleanExceptions(
  exceptions: RecurringExceptionDto[],
  endDate?: Date,
  prunePastExceptions?: boolean,
): RecurringExceptionDto[] {
  return exceptions.filter((exception) => {
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setUTCHours(23, 59, 59, 999);
      if (exception.date.getTime() > endDateTime.getTime()) return false;
    }

    if (prunePastExceptions === false) return true;

    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    return exception.date.getTime() >= yesterday.getTime();
  });
}

export function isRecurringDateExcluded(date: Date, recurringRule: RecurringRuleDto): boolean {
  const dateKey = toDateKey(date);

  return Array.isArray(recurringRule.exceptions)
    ? recurringRule.exceptions.some((exception: unknown) => {
        const parsed = extractExceptionDate(exception);
        return parsed ? toDateKey(parsed) === dateKey : false;
      })
    : false;
}
