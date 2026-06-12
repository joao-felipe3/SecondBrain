import { ChecklistItemDto } from '../task/create-task.dto';

export class UpdateChecklistDto {
  checklist!: Array<string | ChecklistItemDto>;
}
