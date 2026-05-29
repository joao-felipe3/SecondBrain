import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GeminiService } from '../ai/gemini.service';
import { ChecklistService } from './services/checklist.service';
import { PertService } from './services/pert.service';
import { CPMService } from './services/cpm.service';
import { DependencyInferenceService } from './services/dependency-inference.service';
import { BufferService } from './services/buffer.service';
import { TasksController } from './tasks.controller';
import { CPMController } from './controllers/cpm.controller';
import { BufferController } from './controllers/buffer.controller';
import { RTMService } from './services/rtm.service';
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
import { FeedbackService } from './services/feedback.service';
import { TasksRecurringService } from './services/tasks/recurring.service';
import { TasksInputService } from './services/tasks/input.service';
import { TasksAiSuggestionsService } from './services/tasks/ai-suggestions.service';
import { TasksHabitsService } from './services/tasks/habits.service';
import { TasksMetricsService } from './services/tasks/metrics.service';
import { TasksHierarchyService } from './services/tasks/hierarchy.service';
import { TasksChecklistService } from './services/tasks/checklist.service';
import { TasksCompletionService } from './services/tasks/completion.service';
import { TasksPertService } from './services/tasks/tasks-pert.service';
import { TasksWriteService } from './services/tasks/write.service';
import { forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TaskAlertSchema } from './schemas/task-alert.schema';
import { TaskAlert } from './entities/task-alert.entity';
import { AlertsService } from './services/alerts.service';
import { DeviationDetectionService } from './services/deviation-detection.service';
import { AlertsController } from './controllers/alerts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: MicroTaskMilestone.name, schema: MicroTaskMilestoneSchema },
      { name: MicroTaskGenerationRun.name, schema: MicroTaskGenerationRunSchema },
      { name: MicroTaskSimilarityCache.name, schema: MicroTaskSimilarityCacheSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: TaskDependency.name, schema: TaskDependencySchema },
      { name: ProjectBuffer.name, schema: ProjectBufferSchema },
      { name: Requirement.name, schema: RequirementSchema },
      { name: TaskCompletionFeedback.name, schema: TaskCompletionFeedbackSchema },
      { name: TaskAlert.name, schema: TaskAlertSchema },
    ]), 
    forwardRef(() => ProjectsModule)
  ],
  controllers: [TasksController, CPMController, BufferController, RTMController, HabitsController, AlertsController],
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
  ], // Sprint 2: Adiciona ChecklistService
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
  ], // Sprint 2: Adiciona ChecklistService aos exports
})
export class TasksModule {}
