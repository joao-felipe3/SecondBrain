import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectSchema } from './schemas/project.schema';
import { Project } from './entities/project.entity';
import { TaskSchema } from '../tasks/schemas/task.schema';
import { forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectWaveSchema } from './schemas/project-wave.schema';
import { ProjectWave } from './schemas/project-wave.schema';
import { RiskSchema } from './schemas/risk.schema';
import { Risk } from './schemas/risk.schema';
import { ProjectProgress, ProjectProgressSchema } from './schemas/project-progress.schema';
import { WaveAndRiskController } from './controllers/wave-and-risk.controller';
import { XMatrixSnapshot, XMatrixSnapshotSchema } from './schemas/x-matrix-snapshot.schema';
import { WBSNodeSchema } from './schemas/wbs-node.schema';

// Category Services
import { EVMService, EVMProgressService } from './services/evm';
import { PlanningService, RollingWaveService, RollingWavePlanningService } from './services/strategy';
import { RiskService, LeafTasksBufferService, ProjectStatsService } from './services/execution';
import { GanttService, PertDiagramService, ProjectsXMatrixService } from './services/visualization';
import {
  WBSService,
  MonotonyService,
  ThemeExtractionService,
  CacheService,
  WbsValidationService,
  WbsPersistenceService,
  WbsGenerationService,
  AuditService,
  TaskConversionService,
  TaskConversionHelperService,
  ConfigService,
  WbsConversionOrchestrationService,
} from './services/wbs';
import {
  DraftGenerationService,
  DraftPlanGenerationService,
  DraftSinglePassGenerationService,
  DraftWithPlanGenerationService,
  DraftProcessingService,
  DraftDetailsEnrichmentService,
} from './services/drafts';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: 'Task', schema: TaskSchema },
      { name: ProjectWave.name, schema: ProjectWaveSchema },
      { name: Risk.name, schema: RiskSchema },
      { name: ProjectProgress.name, schema: ProjectProgressSchema },
      { name: XMatrixSnapshot.name, schema: XMatrixSnapshotSchema },
      { name: 'WBSNode', schema: WBSNodeSchema },
    ]),
    forwardRef(() => TasksModule),
  ],
  controllers: [ProjectsController, WaveAndRiskController],
  providers: [
    ProjectsService,
    PlanningService,
    EVMService,
    EVMProgressService,
    ProjectsXMatrixService,
    RollingWaveService,
    RollingWavePlanningService,
    RiskService,
    LeafTasksBufferService,
    ProjectStatsService,
    WBSService,
    MonotonyService,
    ThemeExtractionService,
    CacheService,
    WbsValidationService,
    WbsPersistenceService,
    WbsGenerationService,
    AuditService,
    TaskConversionService,
    TaskConversionHelperService,
    DraftGenerationService,
    DraftPlanGenerationService,
    DraftSinglePassGenerationService,
    DraftWithPlanGenerationService,
    DraftProcessingService,
    DraftDetailsEnrichmentService,
    ConfigService,
    WbsConversionOrchestrationService,
    GanttService,
    PertDiagramService,
  ],
  exports: [
    ProjectsService,
    PlanningService,
    WBSService,
    WbsValidationService,
    TaskConversionService,
    TaskConversionHelperService,
    AuditService,
    RollingWaveService,
    RollingWavePlanningService,
    RiskService,
    ProjectStatsService,
    EVMService,
    EVMProgressService,
    GanttService,
    PertDiagramService,
  ],
})
export class ProjectsModule {}
