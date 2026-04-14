import { ChecklistItemDto } from './create-task.dto';

export class UpdateChecklistDto {
  checklist!: Array<string | ChecklistItemDto>;
}
