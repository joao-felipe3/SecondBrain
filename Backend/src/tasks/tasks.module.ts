import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ChecklistService } from './services/intelligence';
import { PertService, BufferService } from './services/analysis';
import { CPMService, DependencyInferenceService, TasksHierarchyService } from './services/dependencies';
import { TasksController } from './tasks.controller';
import { CPMController } from './controllers/cpm.controller';
import { BufferController } from './controllers/buffer.controller';
import {
  RTMService,
  RTMCrudService,
  RTMAiService,
  RTMJourneyService,
  RTMMappingService,
  RTMValidationService,
  RTMTaskGeneratorService,
} from './services/traceability';
import { RTMController } from './controllers/rtm.controller';
import { HabitsController } from './controllers/habits.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskSchema } from './schemas/task.schema';
import { Task } from './entities/task.entity';
import { MongooseTaskRepository } from './repositories/mongoose-task.repository';
import { ProjectSchema } from '../projects/schemas/project.schema';
import { Project } from '../projects/entities/project.entity';
import { TaskDependencySchema } from './schemas/task-dependency.schema';
import { TaskDependency } from './schemas/task-dependency.schema';
import { ProjectBufferSchema, ProjectBuffer } from './schemas/project-buffer.schema';
import { RequirementSchema, Requirement } from './schemas/requirement.schema';
import { TaskCompletionFeedbackSchema } from './schemas/task-completion-feedback.schema';
import { FeedbackService } from './services/intelligence';
import {
  TasksRecurringService,
  TasksInputService,
  TasksCompletionService,
  TasksWriteService,
} from './services/workflow';
import {
  TasksAiSuggestionsService,
  ChecklistOperationsService,
  TasksAiSuggestionsLoopRunner,
} from './services/intelligence';
import { TasksHabitsService } from './services/monitoring';
import { TasksMetricsService, TasksPertService } from './services/analysis';
import { ProjectStatsService } from '../projects/services/execution/project-stats.service';
import { TaskAlertSchema } from './schemas/task-alert.schema';
import { AlertsService, DeviationDetectionService } from './services/monitoring';
import { AlertsController } from './controllers/alerts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: TaskDependency.name, schema: TaskDependencySchema },
      { name: ProjectBuffer.name, schema: ProjectBufferSchema },
      { name: Requirement.name, schema: RequirementSchema },
      { name: 'TaskCompletionFeedback', schema: TaskCompletionFeedbackSchema },
      { name: 'TaskAlert', schema: TaskAlertSchema },
    ]),
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
    ProjectStatsService,
    ChecklistService,
    TasksInputService,
    TasksAiSuggestionsService,
    TasksAiSuggestionsLoopRunner,
    TasksHabitsService,
    TasksMetricsService,
    TasksHierarchyService,
    ChecklistOperationsService,
    TasksPertService,
    TasksWriteService,
    PertService,
    TasksCompletionService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    RTMCrudService,
    RTMAiService,
    RTMJourneyService,
    RTMMappingService,
    RTMValidationService,
    RTMTaskGeneratorService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
    TasksRecurringService,
    {
      provide: 'TaskRepository',
      useClass: MongooseTaskRepository,
    },
  ],
  exports: [
    TasksService,
    ProjectStatsService,
    ChecklistService,
    TasksInputService,
    TasksAiSuggestionsService,
    TasksHabitsService,
    TasksMetricsService,
    TasksHierarchyService,
    ChecklistOperationsService,
    TasksPertService,
    TasksWriteService,
    PertService,
    TasksCompletionService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    RTMCrudService,
    RTMAiService,
    RTMJourneyService,
    RTMMappingService,
    RTMValidationService,
    RTMTaskGeneratorService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
    TasksRecurringService,
    'TaskRepository',
  ],
})
export class TasksModule {}
