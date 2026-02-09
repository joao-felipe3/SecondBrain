/**
 * Normalization utilities for task properties and text
 */

import { MICRO_TASK_PREFERRED_MINUTES } from '../constants/wbs.constants';

/**
 * Normalize preferred pomodoros value (1-3 range)
 */
export function normalizePreferredPomodoros(value?: number): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return Math.ceil(MICRO_TASK_PREFERRED_MINUTES / 25);
  return Math.max(1, Math.min(3, Math.round(v)));
}

/**
 * Normalize title for comparison (remove numbers, special chars, etc)
 */
export function normalizeTitle(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z\u00c0-\u017f\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract template pattern from title (for duplicate detection)
 */
export function templateTitle(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(parte|modulo|módulo|tarefa|micro[-\s]?tarefa|dia|semana)\b/gi, '')
    .replace(/[^a-z\u00c0-\u017f\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract action verb from title (first word)
 */
export function extractVerb(title?: string): string {
  if (!title) return 'unknown';
  const normalized = title.trim().toLowerCase();
  const first = normalized.split(/\s+/)[0];
  return first || 'unknown';
}

/**
 * Normalize micro-task type to valid enum value
 */
export function normalizeMicroTaskType(value?: string): string {
  const v = String(value || '').toLowerCase().trim();
  if (['prepare', 'practice', 'produce', 'review', 'test', 'consolidate'].includes(v)) return v;
  return 'practice';
}

/**
 * Normalize cognitive mode to valid enum value (low/medium/high)
 */
export function normalizeCognitiveMode(value?: string): string {
  const v = String(value || '').toLowerCase().trim();
  if (['low', 'medium', 'high'].includes(v)) return v;
  return 'medium';
}

/**
 * Map cognitive type to micro-task type
 */
export function mapCognitiveTypeToMicroTaskType(type?: string): string {
  switch (type) {
    case 'capture':
      return 'prepare';
    case 'review':
      return 'review';
    case 'test':
      return 'test';
    case 'deep':
      return 'produce';
    default:
      return 'practice';
  }
}

/**
 * Map micro-task type to cognitive mode
 */
export function mapMicroTaskTypeToCognitiveMode(type?: string): string {
  switch (String(type || '').toLowerCase()) {
    case 'prepare':
      return 'low';
    case 'review':
      return 'low';
    case 'practice':
      return 'medium';
    case 'produce':
      return 'high';
    case 'test':
      return 'high';
    case 'consolidate':
      return 'medium';
    default:
      return 'medium';
  }
}

/**
 * Map cognitive mode to GTD context tag
 */
export function mapCognitiveModeToContextTag(mode?: string): string {
  switch (String(mode || '').toLowerCase()) {
    case 'low':
      return '@celular/offline';
    case 'high':
      return '@mesa/foco';
    default:
      return '@computador';
  }
}

/**
 * Normalize workflow types into an array matching the total count
 */
export function normalizeWorkflowTypes(types: string[], total: number): string[] {
  if (!types || !types.length) return Array(total).fill('practice');
  if (types.length === total) return types.map((t) => normalizeMicroTaskType(t));

  // Distribute types evenly across total
  const normalized = types.map((t) => normalizeMicroTaskType(t));
  const result: string[] = [];
  for (let i = 0; i < total; i++) {
    result.push(normalized[i % normalized.length]);
  }
  return result;
}
