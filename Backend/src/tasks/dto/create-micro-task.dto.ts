import { CreateTaskDto } from './create-task.dto';

export class CreateMicroTaskDto extends CreateTaskDto {
  /**
   * If true (default), backend tries to auto-generate checklist when missing.
   */
  autoGenerateChecklist?: boolean;
}
