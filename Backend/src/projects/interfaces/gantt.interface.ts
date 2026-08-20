import { ProjectDocument } from '../schemas/project.schema';
import { ProjectWaveDocument } from '../schemas/project-wave.schema';
import { TaskGanttContext } from '../../tasks/interfaces/task-contexts.interface';
import { TaskDependency } from '../../tasks/entities/task-dependency.entity';
import { TaskNode } from '../../tasks/interfaces/cpm.interface';
import { DependencyType } from '../../tasks/schemas/task-dependency.schema';

export interface EffectiveEndParams {
  taskDeadline: Date | null;
  waveEnd: Date | null;
  projectDeadline: Date | null;
}

export interface AdjustWindowBoundsParams {
  start: Date;
  end: Date;
  waveStart: Date | null;
  waveEnd: Date | null;
  durationMs: number;
}

export interface ResolveWindowParams {
  task: TaskGanttContext;
  durationHours: number;
  wave: ProjectWaveDocument | null;
  project: ProjectDocument;
}

export interface BuildTaskNodesParams {
  tasks: TaskGanttContext[];
  dependencies: TaskDependency[];
  normalizeRelationship: (rel?: string) => DependencyType;
}

export interface MapSingleTaskItemParams {
  task: TaskGanttContext;
  metric: TaskNode | undefined;
  wave: ProjectWaveDocument | null;
  project: ProjectDocument;
}

export interface MapTaskItemsParams {
  tasks: TaskGanttContext[];
  metricsById: Map<string, TaskNode>;
  waveByTaskId: Map<string, ProjectWaveDocument>;
  project: ProjectDocument;
}
