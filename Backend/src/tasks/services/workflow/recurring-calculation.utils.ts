import { RecurringRuleDto } from '../../dto/create-task.dto';
import { normalizeRecurringRule } from './recurring-validation.utils';
import { isRecurringDateExcluded } from './recurring-exception.utils';
import { addDays, addMonths } from './recurring.utils';

// ===========================================================================
// Recurrence Date Calculation Utils
// ===========================================================================

export function calculateNextRecurringDate(
  referenceDate: Date,
  recurringRule: RecurringRuleDto,
): Date | null {
  const rule = normalizeRecurringRule(recurringRule, {
    allowPastEndDate: true,
    prunePastExceptions: false,
  });

  const base = new Date(referenceDate);
  base.setSeconds(0, 0);

  const endDate = getRecurringEndDate(rule);
  if (isAfterRecurringEnd(base, endDate)) return null;

  if (rule.frequency === 'monthly') {
    return calculateMonthlyRecurringDate(base, rule, endDate);
  }

  return calculateSteppedRecurringDate(base, rule, endDate);
}

export function calculateMonthlyRecurringDate(
  base: Date,
  rule: RecurringRuleDto,
  endDate?: Date,
): Date | null {
  const monthCandidate = addMonths(base, rule.interval);
  if (isAfterRecurringEnd(monthCandidate, endDate)) return null;

  return isRecurringDateExcluded(monthCandidate, rule)
    ? calculateNextRecurringDate(monthCandidate, rule)
    : monthCandidate;
}

export function calculateSteppedRecurringDate(
  base: Date,
  rule: RecurringRuleDto,
  endDate?: Date,
): Date | null {
  const candidate = addDays(base, getRecurringStepDays(rule));
  const allowedDays = getAllowedDays(rule);

  for (let offset = 0; offset < 365; offset++) {
    const probe = addDays(candidate, offset);
    if (isAfterRecurringEnd(probe, endDate)) return null;
    if (allowedDays && !allowedDays.includes(probe.getUTCDay())) continue;
    if (isRecurringDateExcluded(probe, rule)) continue;

    return probe;
  }

  return null;
}

export function calculateFirstRecurringDate(
  startDate: Date,
  recurringRule: RecurringRuleDto,
): Date | null {
  const rule = normalizeRecurringRule(recurringRule, {
    allowPastEndDate: true,
    prunePastExceptions: false,
  });

  const base = new Date(startDate);
  base.setSeconds(0, 0);

  const endDate = getRecurringEndDate(rule);
  if (isAfterRecurringEnd(base, endDate) && endDate !== undefined) return null;

  if (rule.frequency === 'monthly') {
    return calculateFirstMonthlyRecurringDate(base, rule, endDate);
  }

  return findFirstAllowedRecurringDate(base, rule, endDate);
}

export function calculateFirstMonthlyRecurringDate(
  base: Date,
  rule: RecurringRuleDto,
  endDate?: Date,
): Date | null {
  if (!isRecurringDateExcluded(base, rule)) {
    return base;
  }

  const nextDate = calculateNextRecurringDate(base, rule);
  return isAfterRecurringEnd(nextDate ?? base, endDate) ? null : nextDate;
}

export function findFirstAllowedRecurringDate(
  base: Date,
  rule: RecurringRuleDto,
  endDate?: Date,
): Date | null {
  const allowedDays = getAllowedDays(rule);

  for (let offset = 0; offset < 365; offset++) {
    const probe = addDays(base, offset);

    if (isAfterRecurringEnd(probe, endDate)) return null;
    if (allowedDays && !allowedDays.includes(probe.getUTCDay())) continue;
    if (isRecurringDateExcluded(probe, rule)) continue;

    return probe;
  }

  return null;
}

// ===========================================================================
// Date Helpers
// ===========================================================================

export function getRecurringEndDate(rule: RecurringRuleDto): Date | undefined {
  return rule.endDate instanceof Date ? rule.endDate : undefined;
}

export function isAfterRecurringEnd(date: Date, endDate?: Date): boolean {
  if (!endDate) return false;
  return date.getTime() >= endDate.getTime();
}

export function getRecurringStepDays(rule: RecurringRuleDto): number {
  if (rule.frequency === 'weekly') return rule.interval * 7;
  if (rule.frequency === 'biweekly') return rule.interval * 14;
  return rule.interval;
}

export function getAllowedDays(rule: RecurringRuleDto): number[] | null {
  return Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : null;
}
