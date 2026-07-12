import { Task } from '../entities/task.entity';
import { FindByProjectIdOptionsDto } from '../dto/query/find-by-project-id-options.dto';

export interface TaskRepository {
  findAll(): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  findByProjectId(projectId: string, opts?: FindByProjectIdOptionsDto): Promise<Task[]>;
  save(task: Task): Promise<Task>;
  delete(id: string): Promise<void>;
}
