import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { GeminiService } from './gemini.service'; // Importa o GeminiService
import { TasksController } from './tasks.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskSchema } from './schemas/task.schema';
import { Task } from './entities/task.entity';
import { ProjectSchema } from '../projects/schemas/project.schema';
import { Project } from '../projects/entities/project.entity';
import { forwardRef } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Project.name, schema: ProjectSchema }
    ]),
    forwardRef(() => ProjectsModule)
  ],
  controllers: [TasksController],
  providers: [TasksService, GeminiService], // Adiciona o GeminiService aos providers
  exports: [TasksService, GeminiService] // Exporta GeminiService para uso em outros módulos
})
export class TasksModule {}
