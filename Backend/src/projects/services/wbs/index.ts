/**
 * Barrel exports for WBS services
 */

export { WBSService } from './wbs.service';
export { MonotonyDetectionService } from './monotony-detection.service';
export { MonotonyFixService, MicroTaskDraft } from './monotony-fix.service';
export { PromptBuilderService } from './prompt-builder.service';
export { ThemeExtractionService } from './theme-extraction.service';

// New modular services
export { CacheService } from './cache.service';
export { WbsValidationService } from './wbs-validation.service';
export { WbsPersistenceService } from './wbs-persistence.service';
export { WbsGenerationService } from './wbs-generation.service';
export { AuditService } from './audit.service';
export { TaskConversionService } from './task-conversion.service';
export { DraftGenerationService } from './draft-generation.service';
export { DraftProcessingService } from './draft-processing.service';
export { ConfigService } from './config.service';
export { WbsConversionOrchestrationService } from './wbs-conversion-orchestrator.service';
