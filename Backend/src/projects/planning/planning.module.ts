import { Module, forwardRef } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { TasksModule } from '../../tasks/tasks.module';

@Module({
  imports: [forwardRef(() => TasksModule)],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
