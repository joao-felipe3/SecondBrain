import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WBSService } from './wbs.service';
import { WBSNodeSchema } from '../schemas/wbs-node.schema';
import { TasksModule } from '../../tasks/tasks.module';
import {
  MonotonyDetectionService,
  MonotonyFixService,
  PromptBuilderService,
  ThemeExtractionService,
} from './services';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'WBSNode', schema: WBSNodeSchema }]),
    forwardRef(() => TasksModule),
  ],
  providers: [
    WBSService,
    MonotonyDetectionService,
    MonotonyFixService,
    PromptBuilderService,
    ThemeExtractionService,
  ],
  exports: [WBSService],
})
export class WBSModule {}
