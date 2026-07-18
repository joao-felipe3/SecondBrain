import { BadRequestException } from '@nestjs/common';
import { RecurringRuleDto } from '../../../dto/task/create-task.dto';
import { parseExceptions, cleanExceptions } from './recurring-exception.utils';

// ===========================================================================
// Core Rule Normalization
// ===========================================================================

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

  const endDate = parseAndValidateEndDate(recurringRule!.endDate, Boolean(options?.allowPastEndDate));
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

// ===========================================================================
// Field-Level Parsers & Validations
// ===========================================================================

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
  const endDate =
    raw instanceof Date ? raw : new Date(typeof raw === 'string' || typeof raw === 'number' ? raw : '');
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
