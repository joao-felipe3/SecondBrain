import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectSchema } from './schemas/project.schema';
import { Project } from './entities/project.entity';
import { TaskSchema } from '../tasks/schemas/task.schema';
import { Task } from '../tasks/entities/task.entity';
import { forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { PlanningModule } from './planning/planning.module';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema }
    ]),
    forwardRef(() => TasksModule),
    PlanningModule
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService]
})
export class ProjectsModule {}
