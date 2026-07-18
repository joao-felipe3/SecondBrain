/**
 * Barrel re-exports for all AI prompt builder functions.
 * All functions here are pure (no NestJS dependency injection).
 */

// Core Prompts
export * from './core/gemini.prompts';

// Tasks Prompts
export * from './tasks/dependency.prompts';
export * from './tasks/feedback.prompts';
export * from './tasks/risk.prompts';
export * from './tasks/rtm.prompts';

// Projects Prompts
export * from './projects/planning.prompts';
export * from './projects/wbs.prompts';
export * from './projects/rolling-wave.prompts';
export * from './projects/audit.prompts';
export * from './projects/monotony.prompts';
export * from './projects/microtask-outline.prompts';
export * from './projects/microtask-detail.prompts';
