import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { convertDraftsToTasks } from '../utils/task-conversion-helpers.util';
import { Task } from '../../../interfaces/wbs-conversion.interface';
import { MicroTaskDraft } from '../../../interfaces/drafts.interface';

/**
 * Converte rascunhos de micro-tarefas (gerados pela IA) em DTOs de tarefa.
 * A geração em si é feita por fatia de onda (Rolling Wave); ver WaveDetailingService.
 */
@Injectable()
export class TaskConversionService {
  convertDraftsToTasks(
    drafts: MicroTaskDraft[],
    context: { wbsNode?: WBSNodeDto; project?: { _id?: any; id?: any }; path?: string } = {},
  ): Promise<Task[]> {
    return Promise.resolve(convertDraftsToTasks(drafts, context));
  }
}
