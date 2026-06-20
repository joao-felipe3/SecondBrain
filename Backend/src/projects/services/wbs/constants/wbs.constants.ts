/**
 * Constantes para WBS e geração de micro-tasks
 */

// Micro-task sizing philosophy:
// Prefer smaller "daily" tasks (1–3 pomodoros) and only use 6 pomodoros (150min)
// when strictly necessary to avoid generating an excessive number of tasks.
export const MICRO_TASK_MIN_MINUTES = 25;
export const MICRO_TASK_PREFERRED_MINUTES = 50; // ~2 pomodoros
export const MICRO_TASK_SOFT_MAX_MINUTES = 60; // ~2-3 pomodoros
export const MICRO_TASK_HARD_MAX_MINUTES = 150; // 6 pomodoros (only if needed)
export const MICRO_TASK_MAX_PER_LEAF = 40;

// Embeddings and theme extraction
export const MIN_EMBEDDING_TEXT_LENGTH = 180;
export const MIN_EMBEDDING_SEGMENTS = 3;
export const MAX_EMBEDDING_CLUSTERS = 6;

// Quality thresholds
export const MAX_DUPLICATE_SCORE = 0.2;
export const MAX_SIMILARITY_SCORE = 0.35;
export const MIN_COGNITIVE_VARIETY = 0.18;
export const MAX_GENERIC_SERIES_RATE = 0.25;
export const MAX_SUFFIX_RATE = 0.15;

// AI call budgets
export const MAX_AI_LEAF_CALLS = 30;
export const EXTRA_FIX_BUDGET = 2;
export const MAX_MONOTONY_FIX_ROUNDS = 2;
export const MONOTONY_FIX_BATCH_SIZE = 5;
export const MAX_TASKS_TO_CREATE = 1000;

// WBS validation (PMBOK 8/80 rule)
export const WBS_MIN_HOURS = 8;
export const WBS_MAX_HOURS = 80;
export const WBS_MAX_DEPTH = 3;
