import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WBSService } from './wbs.service';
import { WBSNodeSchema } from '../schemas/wbs-node.schema';
import { TasksModule } from '../../tasks/tasks.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'WBSNode', schema: WBSNodeSchema }]),
    forwardRef(() => TasksModule),
  ],
  providers: [WBSService],
  exports: [WBSService],
})
export class WBSModule {}
