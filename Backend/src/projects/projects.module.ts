import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectSchema } from './schemas/project.schema';
import { Project } from './entities/project.entity';
import { TaskSchema } from '../tasks/schemas/task.schema';
import { forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { PlanningModule } from './planning/planning.module';
import { WBSModule } from './wbs/wbs.module';
import { LeafTasksBufferService } from './leaf-tasks-buffer.service';
import { ProjectWaveSchema } from './schemas/project-wave.schema';
import { ProjectWave } from './schemas/project-wave.schema';
import { RiskSchema } from './schemas/risk.schema';
import { Risk } from './schemas/risk.schema';
import { RollingWaveService } from './services/rolling-wave.service';
import { RiskService } from './services/risk.service';
import { WaveAndRiskController } from './controllers/wave-and-risk.controller';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: 'Task', schema: TaskSchema },
      { name: ProjectWave.name, schema: ProjectWaveSchema },
      { name: Risk.name, schema: RiskSchema }
    ]),
    forwardRef(() => TasksModule),
    PlanningModule,
    WBSModule,
  ],
  controllers: [ProjectsController, WaveAndRiskController],
  providers: [ProjectsService, LeafTasksBufferService, RollingWaveService, RiskService],
  exports: [ProjectsService, RollingWaveService, RiskService]
})
export class ProjectsModule {}
