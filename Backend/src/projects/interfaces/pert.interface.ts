import { TaskDocument } from '../../tasks/schemas/task.schema';
import { TaskDependency } from '../../tasks/entities/task-dependency.entity';
import { TaskNode } from '../../tasks/interfaces/cpm.interface';
import { DependencyType } from '../../tasks/schemas/task-dependency.schema';
import { PertDiagramNode, PertDiagramEdge } from '../dto/pert-diagram.dto';

export interface BuildPertTaskNodesParams {
  tasks: TaskDocument[];
  dependencies: TaskDependency[];
  normalizeRelationship: (rel?: string) => DependencyType;
}

export interface MapPertNodesParams {
  tasks: TaskDocument[];
  metricsById: Map<string, TaskNode>;
  taskLevels: Map<string, number>;
}

export interface MapPertEdgesParams {
  dependencies: TaskDependency[];
  taskNodesById: Map<string, TaskNode>;
  criticalPath: string[];
}
