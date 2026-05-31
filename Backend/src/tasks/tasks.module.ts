import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GeminiService } from '../ai/gemini.service';
import { ChecklistService } from './services/intelligence';
import { PertService, CPMService, DependencyInferenceService, BufferService } from './services/analysis';
import { TasksController } from './tasks.controller';
import { CPMController } from './controllers/cpm.controller';
import { BufferController } from './controllers/buffer.controller';
import { RTMService } from './services/traceability';
import { RTMController } from './controllers/rtm.controller';
import { HabitsController } from './controllers/habits.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskSchema } from './schemas/task.schema';
import { Task } from './entities/task.entity';
import { MicroTaskMilestoneSchema } from './schemas/microtask-milestone.schema';
import { MicroTaskMilestone } from './entities/microtask-milestone.entity';
import { MicroTaskGenerationRunSchema } from './schemas/microtask-generation-run.schema';
import { MicroTaskGenerationRun } from './entities/microtask-generation-run.entity';
import { MicroTaskSimilarityCacheSchema } from './schemas/microtask-similarity-cache.schema';
import { MicroTaskSimilarityCache } from './entities/microtask-similarity-cache.entity';
import { ProjectSchema } from '../projects/schemas/project.schema';
import { Project } from '../projects/entities/project.entity';
import { TaskDependencySchema } from './schemas/task-dependency.schema';
import { TaskDependency } from './schemas/task-dependency.schema';
import { ProjectBufferSchema } from './schemas/project-buffer.schema';
import { ProjectBuffer } from './entities/project-buffer.entity';
import { RequirementSchema } from './schemas/requirement.schema';
import { Requirement } from './entities/requirement.entity';
import { TaskCompletionFeedbackSchema } from './schemas/task-completion-feedback.schema';
import { TaskCompletionFeedback } from './entities/task-completion-feedback.entity';
import { FeedbackService } from './services/intelligence';
import { TasksRecurringService, TasksInputService, TasksCompletionService, TasksWriteService } from './services/workflow';
import { TasksAiSuggestionsService, TasksChecklistService } from './services/intelligence';
import { TasksHabitsService } from './services/monitoring';
import { TasksMetricsService, TasksHierarchyService, TasksPertService } from './services/analysis';
import { forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TaskAlertSchema } from './schemas/task-alert.schema';
import { TaskAlert } from './entities/task-alert.entity';
import { AlertsService, DeviationDetectionService } from './services/monitoring';
import { AlertsController } from './controllers/alerts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: MicroTaskMilestone.name, schema: MicroTaskMilestoneSchema },
      {
        name: MicroTaskGenerationRun.name,
        schema: MicroTaskGenerationRunSchema,
      },
      {
        name: MicroTaskSimilarityCache.name,
        schema: MicroTaskSimilarityCacheSchema,
      },
      { name: Project.name, schema: ProjectSchema },
      { name: TaskDependency.name, schema: TaskDependencySchema },
      { name: ProjectBuffer.name, schema: ProjectBufferSchema },
      { name: Requirement.name, schema: RequirementSchema },
      {
        name: TaskCompletionFeedback.name,
        schema: TaskCompletionFeedbackSchema,
      },
      { name: TaskAlert.name, schema: TaskAlertSchema },
    ]),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [
    TasksController,
    CPMController,
    BufferController,
    RTMController,
    HabitsController,
    AlertsController,
  ],
  providers: [
    TasksService,
    GeminiService,
    ChecklistService,
    TasksInputService,
    TasksAiSuggestionsService,
    TasksHabitsService,
    TasksMetricsService,
    TasksHierarchyService,
    TasksChecklistService,
    TasksPertService,
    TasksWriteService,
    PertService,
    TasksCompletionService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
    TasksRecurringService,
  ],
  exports: [
    TasksService,
    GeminiService,
    ChecklistService,
    TasksInputService,
    TasksAiSuggestionsService,
    TasksHabitsService,
    TasksMetricsService,
    TasksHierarchyService,
    TasksChecklistService,
    TasksPertService,
    TasksWriteService,
    PertService,
    TasksCompletionService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
    TasksRecurringService,
  ],
})
export class TasksModule {}
