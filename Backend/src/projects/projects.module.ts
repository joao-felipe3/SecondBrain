import { Module, forwardRef } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectSchema } from './schemas/project.schema';
import { Project } from './entities/project.entity';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectWaveSchema } from './schemas/project-wave.schema';
import { ProjectWave } from './schemas/project-wave.schema';
import { RiskSchema } from './schemas/risk.schema';
import { Risk } from './schemas/risk.schema';
import { ProjectProgress, ProjectProgressSchema } from './schemas/project-progress.schema';
import { WaveAndRiskController } from './controllers/wave-and-risk.controller';
import { ProjectsCoreController } from './controllers/projects-core.controller';
import { ProjectsPlanningController } from './controllers/projects-planning.controller';
import { ProjectsWbsController } from './controllers/projects-wbs.controller';
import { ProjectsVisualizationController } from './controllers/projects-visualization.controller';
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

const projectMongooseFeature = MongooseModule.forFeature([
  { name: Project.name, schema: ProjectSchema },
  { name: 'Project', schema: ProjectSchema },
  { name: ProjectWave.name, schema: ProjectWaveSchema },
  { name: Risk.name, schema: RiskSchema },
  { name: ProjectProgress.name, schema: ProjectProgressSchema },
  { name: XMatrixSnapshot.name, schema: XMatrixSnapshotSchema },
  { name: 'WBSNode', schema: WBSNodeSchema },
]);

@Module({
  imports: [projectMongooseFeature, forwardRef(() => TasksModule)],
  controllers: [
    ProjectsCoreController,
    ProjectsPlanningController,
    ProjectsWbsController,
    ProjectsVisualizationController,
    WaveAndRiskController,
  ],
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
    projectMongooseFeature,
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
