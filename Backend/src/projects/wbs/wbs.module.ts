import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WBSService } from './wbs.service';
import { WBSNodeSchema } from '../schemas/wbs-node.schema';
import { TasksModule } from '../../tasks/tasks.module';
import {
  MonotonyDetectionService,
  MonotonyFixService,
  PromptBuilderService,
  ThemeExtractionService,
  CacheService,
  WbsValidationService,
  WbsPersistenceService,
  WbsGenerationService,
  AuditService,
  TaskConversionService,
  DraftGenerationService,
  DraftProcessingService,
  ConfigService,
  WbsConversionOrchestrationService,
} from './services';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'WBSNode', schema: WBSNodeSchema }]),
    forwardRef(() => TasksModule),
  ],
  providers: [
    WBSService,
    MonotonyDetectionService,
    MonotonyFixService,
    PromptBuilderService,
    ThemeExtractionService,
    CacheService,
    WbsValidationService,
    WbsPersistenceService,
    WbsGenerationService,
    AuditService,
    TaskConversionService,
    DraftGenerationService,
    DraftProcessingService,
    ConfigService,
    WbsConversionOrchestrationService,
  ],
  exports: [
    WBSService,
    WbsValidationService,
    TaskConversionService,
    AuditService,
  ],
})
export class WBSModule {}
