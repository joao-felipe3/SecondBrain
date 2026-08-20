import { TaskPertContext } from '../../tasks/interfaces/task-contexts.interface';
import { TaskDependency } from '../../tasks/entities/task-dependency.entity';
import { TaskNode } from '../../tasks/interfaces/cpm.interface';
import { DependencyType } from '../../tasks/schemas/task-dependency.schema';

export interface BuildPertTaskNodesParams {
  tasks: TaskPertContext[];
  dependencies: TaskDependency[];
  normalizeRelationship: (rel?: string) => DependencyType;
}

export interface MapPertNodesParams {
  tasks: TaskPertContext[];
  metricsById: Map<string, TaskNode>;
  taskLevels: Map<string, number>;
}

export interface MapPertEdgesParams {
  dependencies: TaskDependency[];
  taskNodesById: Map<string, TaskNode>;
  criticalPath: string[];
}
