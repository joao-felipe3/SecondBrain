import { BadRequestException } from '@nestjs/common';
import { RecurringRuleDto, RecurringExceptionDto } from '../../dto/create-task.dto';
import { toDateKey } from './recurring.utils';

export function normalizeRecurringRule(
  recurringRule?: RecurringRuleDto,
  options?: {
    allowPastEndDate?: boolean;
    prunePastExceptions?: boolean;
  },
): RecurringRuleDto {
  ensureRequiredFields(recurringRule);

  const frequency = normalizeFrequency(recurringRule!.frequency);
  const interval = normalizeInterval(recurringRule!.interval);

  const endDate = parseAndValidateEndDate(
    recurringRule!.endDate,
    Boolean(options?.allowPastEndDate),
  );
  const daysOfWeek = normalizeDaysOfWeek(recurringRule!.daysOfWeek);

  const exceptions = parseExceptions(recurringRule!.exceptions);
  const cleanedExceptions = exceptions
    ? cleanExceptions(exceptions, endDate, options?.prunePastExceptions)
    : undefined;

  return {
    ...recurringRule!,
    frequency,
    interval,
    daysOfWeek,
    exceptions: cleanedExceptions,
  };
}


export function ensureRequiredFields(recurringRule?: RecurringRuleDto): void {
  if (!recurringRule?.frequency || !recurringRule?.interval) {
    throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
  }
}


export function normalizeFrequency(raw: unknown): string {
  const frequency = String(raw).toLowerCase();
  const allowedFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
  if (!allowedFrequencies.includes(frequency)) {
    throw new BadRequestException(`recurringRule inválida: frequency "${String(raw)}" não suportada.`);
  }
  return frequency;
}


export function normalizeInterval(raw: unknown): number {
  const interval = Number(raw);
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new BadRequestException('recurringRule inválida: interval deve ser maior que zero.');
  }
  return interval;
}


export function parseAndValidateEndDate(raw?: unknown, allowPast = false): Date | undefined {
  if (raw === undefined || raw === null) return undefined;
  const endDate = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(endDate.getTime())) {
    throw new BadRequestException('recurringRule inválida: endDate inválida.');
  }
  if (!allowPast && endDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    throw new BadRequestException('recurringRule inválida: endDate não pode estar no passado.');
  }
  return endDate;
}


export function normalizeDaysOfWeek(raw?: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const filtered = raw.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as number[];
  return filtered.length > 0 ? filtered : undefined;
}


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


export function cleanExceptions(
  exceptions: RecurringExceptionDto[],
  endDateRaw?: string | Date,
  prunePastExceptions?: boolean,
): RecurringExceptionDto[] {
  return exceptions.filter((exception) => {
    if (endDateRaw) {
      const endDate = parseAndValidateEndDate(endDateRaw, true);

      if (endDate) {
        endDate.setUTCHours(23, 59, 59, 999);
        if (exception.date.getTime() > endDate.getTime()) return false;
      }
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
      let rawDate: unknown;
      if (exception instanceof Date) {
        rawDate = exception;
      } else if (exception && typeof exception === 'object' && 'date' in exception) {
        rawDate = (exception as Record<string, unknown>)['date'];
      } else {
        rawDate = undefined;
      }

      const parsed = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
      if (Number.isNaN(parsed.getTime())) return false;

      return toDateKey(parsed) === dateKey;
    })
    : false;
}
