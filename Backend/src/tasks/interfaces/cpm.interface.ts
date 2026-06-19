import { DependencyType } from '../schemas/task-dependency.schema';

export interface TaskDependencyEdge {
  predecessorId: string;
  relationship: DependencyType;
}

export interface TaskNode {
  id: string;
  name: string;
  duration: number;
  dependencies: string[];
  dependencyEdges?: TaskDependencyEdge[];
  parentWbsNodeId?: string;
  wbsPath?: string;
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  slack?: number;
  isCritical?: boolean;
}

export interface PackageCriticality {
  packageId: string;
  packagePath?: string;
  taskCount: number;
  criticalTaskCount: number;
  criticalRatio: number;
  minSlack: number;
  criticalDuration: number;
  criticalPathTaskCount: number;
  score: number;
}

export interface SlackBuckets {
  negative: number;
  critical: number;
  nearCritical: number;
  lowSlack: number;
  comfortable: number;
}

export interface TopUnlocker {
  taskId: string;
  taskName: string;
  outDegree: number;
}

export interface TopBottleneck {
  taskId: string;
  taskName: string;
  inDegree: number;
}

export interface MissingDependencySample {
  taskId: string;
  dependsOnTaskId: string;
}

export interface CPMValidation {
  missingDependencyRefs: number;
  missingDependencySamples?: MissingDependencySample[];
  reliability: 'high' | 'medium' | 'low';
}

export interface CPMDiagnostics {
  taskCount: number;
  criticalCount: number;
  criticalPercent: number;
  criticalChainTaskCount: number;
  criticalChainDuration: number;
  nearCriticalCount: number;
  totalWork: number;
  impliedParallelism: number;
  hasCycle: boolean;
  unprocessedForward: number;
  unprocessedBackward: number;
  edgeCount: number;
  startNodeCount: number;
  endNodeCount: number;
  avgDependenciesPerTask: number;
  slackBuckets?: SlackBuckets;
  topUnlockers?: TopUnlocker[];
  topBottlenecks?: TopBottleneck[];
  validation?: CPMValidation;
}

export interface CPMAnalysis {
  criticalPath: string[];
  projectDuration: number;
  tasksByImpact: TaskNode[];
  alerts: string[];
  packageCriticality?: PackageCriticality[];
  diagnostics?: CPMDiagnostics;
}


export interface TaskMetrics {
  taskId: string;
  taskName: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  slack: number;
  isCritical: boolean;
}

export interface ValidateDependenciesParams {
  tasksInHours: TaskNode[];
  edgeMap: Map<string, TaskDependencyEdge[]>;
  taskIds: Set<string>;
}

export interface ComputeGraphDegreesParams {
  tasksInHours: TaskNode[];
  edgeMap: Map<string, TaskDependencyEdge[]>;
  taskIds: Set<string>;
}

export interface FindEndNodeParams {
  tasks: TaskNode[];
  projectDuration: number;
  eps: number;
}

export interface EvaluateAlignmentParams {
  pred: TaskNode;
  cur: TaskNode;
  dep: TaskDependencyEdge;
  eps: number;
}

export interface FindBestPredecessorParams {
  cur: TaskNode;
  deps: TaskDependencyEdge[];
  taskById: Map<string, TaskNode>;
  eps: number;
}

export interface BuildCriticalPathParams {
  tasks: TaskNode[];
  projectDuration: number;
  edgeMap: Map<string, TaskDependencyEdge[]>;
}

export interface GenerateAlertsParams {
  tasks: TaskNode[];
  criticalTasks: TaskNode[];
  diagnostics: {
    cycleDetected: boolean;
    unprocessedForward: number;
    unprocessedBackward: number;
    missingDependencyRefs: number;
  };
}

export interface CreateCPMDiagnosticsParams {
  tasksInHours: TaskNode[];
  criticalTasks: TaskNode[];
  criticalPathSequence: string[];
  projectDuration: number;
  indegree: Map<string, number>;
  outdegree: Map<string, number>;
  edgeCount: number;
  depSum: number;
  forward: { hasCycle: boolean; unprocessed: number };
  backward: { hasCycle: boolean; unprocessed: number };
  missingDependencyRefs: number;
  missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }>;
}

