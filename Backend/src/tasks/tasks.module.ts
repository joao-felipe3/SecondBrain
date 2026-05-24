import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GeminiService } from '../ai/gemini.service'; // Importa o GeminiService
import { ChecklistService } from './checklist.service'; // Sprint 2: Importa ChecklistService
import { PertService } from './services/pert.service';
import { CPMService } from './services/cpm.service';
import { DependencyInferenceService } from './services/dependency-inference.service';
import { BufferService } from './services/buffer.service'; // NOVO: Importa BufferService
import { TasksController } from './tasks.controller';
import { CPMController } from './controllers/cpm.controller';
import { BufferController } from './controllers/buffer.controller'; // NOVO: Importa BufferController
import { RTMService } from './services/rtm.service'; // NOVO: Importa RTMService
import { RTMController } from './controllers/rtm.controller'; // NOVO: Importa RTMController
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
import { ProjectBufferSchema } from './schemas/project-buffer.schema'; // NOVO: Importa schema de buffer
import { ProjectBuffer } from './entities/project-buffer.entity'; // NOVO: Importa entidade de buffer
import { RequirementSchema } from './schemas/requirement.schema'; // NOVO: Importa schema de requisito
import { Requirement } from './entities/requirement.entity'; // NOVO: Importa entidade de requisito
import { TaskCompletionFeedbackSchema } from './schemas/task-completion-feedback.schema'; // Sprint 4: Importa schema de feedback
import { TaskCompletionFeedback } from './entities/task-completion-feedback.entity'; // Sprint 4: Importa entidade de feedback
import { FeedbackService } from './feedback.service';
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
      { name: ProjectBuffer.name, schema: ProjectBufferSchema }, // NOVO: Adiciona ProjectBuffer
      { name: Requirement.name, schema: RequirementSchema }, // NOVO: Adiciona Requirement
      { name: TaskCompletionFeedback.name, schema: TaskCompletionFeedbackSchema }, // Sprint 4: Adiciona TaskCompletionFeedback
      { name: TaskAlert.name, schema: TaskAlertSchema },
    ]), 
    forwardRef(() => ProjectsModule)
  ],
  controllers: [TasksController, CPMController, BufferController, RTMController, HabitsController, AlertsController], // NOVO: Adiciona RTMController
  providers: [
    TasksService,
    GeminiService,
    ChecklistService,
    PertService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
  ], // Sprint 2: Adiciona ChecklistService
  exports: [
    TasksService,
    GeminiService,
    ChecklistService,
    PertService,
    CPMService,
    DependencyInferenceService,
    BufferService,
    RTMService,
    FeedbackService,
    AlertsService,
    DeviationDetectionService,
  ], // Sprint 2: Adiciona ChecklistService aos exports
})
export class TasksModule {}
