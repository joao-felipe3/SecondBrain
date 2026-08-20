import { CreateTaskDto } from '../task/create-task.dto';
import {
  TaskOperationalInfo,
  TaskPertMetrics,
  TaskGamification,
} from '../../interfaces/task-contexts.interface';

export class CalculateProgressDto {
  dto!: Partial<CreateTaskDto>;
  fallbackTask!: Partial<TaskOperationalInfo & TaskPertMetrics & TaskGamification> | null | undefined;
  expectedMinutes!: number;
}
