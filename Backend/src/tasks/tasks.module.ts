import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GeminiService } from './gemini.service'; // Importa o GeminiService
import { PertService } from './services/pert.service';
import { TasksController } from './tasks.controller';
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
import { forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: MicroTaskMilestone.name, schema: MicroTaskMilestoneSchema },
      { name: MicroTaskGenerationRun.name, schema: MicroTaskGenerationRunSchema },
      { name: MicroTaskSimilarityCache.name, schema: MicroTaskSimilarityCacheSchema },
      { name: Project.name, schema: ProjectSchema }
    ]),
    forwardRef(() => ProjectsModule)
  ],
  controllers: [TasksController],
  providers: [TasksService, GeminiService, PertService], // Adiciona o PertService aos providers
  exports: [TasksService, GeminiService, PertService] // Exporta PertService para uso em outros módulos
})
export class TasksModule {}
