import { CreateTaskDto } from '../task/create-task.dto';
import { TaskDocument } from '../../schemas/task.schema';

export class CalculateProgressDto {
  dto: Partial<CreateTaskDto>;
  fallbackTask: TaskDocument | null | undefined;
  expectedMinutes: number;
}
