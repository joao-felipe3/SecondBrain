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

export interface GroupedPackageTasks {
  path?: string;
  tasks: TaskNode[];
}

export interface RawPackageMetrics {
  packageId: string;
  packagePath?: string;
  taskCount: number;
  criticalTaskCount: number;
  criticalRatio: number;
  minSlack: number;
  criticalDuration: number;
  criticalPathTaskCount: number;
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

export interface CPMContext {
  tasksInHours: TaskNode[];
  edgeMap: Map<string, TaskDependencyEdge[]>;
  taskIds: Set<string>;
  missingDependencyRefs: number;
  missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }>;
}

export interface CPMPassSummary {
  hasCycle: boolean;
  unprocessed: number;
}

export interface CPMPassResult {
  forward: CPMPassSummary;
  backward: CPMPassSummary;
  projectDuration: number;
  criticalTasks: TaskNode[];
}

export interface CPMAnalyticsResult {
  indegree: Map<string, number>;
  outdegree: Map<string, number>;
  edgeCount: number;
  depSum: number;
  tasksByImpact: TaskNode[];
  criticalPathSequence: string[];
  effectiveCriticalPath: string[];
  packageCriticality: PackageCriticality[];
  alerts: string[];
}

export interface AlertDiagnosticsInput {
  cycleDetected: boolean;
  unprocessedForward: number;
  unprocessedBackward: number;
  missingDependencyRefs: number;
}

export interface ForwardPassMaps {
  indegree: Map<string, number>;
  dependents: Map<string, Array<{ successorId: string; relationship: DependencyType }>>;
  maxConstraintStart: Map<string, number>;
}

export interface BackwardPassMaps {
  outdegree: Map<string, number>;
  predecessorBounds: Map<string, { maxLateFinish: number; maxLateStart: number }>;
}

export interface BuildForwardPassMapsParams {
  tasks: TaskNode[];
  edgeMap: Map<string, TaskDependencyEdge[]>;
  taskMap: Map<string, TaskNode>;
}

export interface UpdateForwardSuccessorParams {
  predecessor: TaskNode;
  dep: { successorId: string; relationship: DependencyType };
  taskMap: Map<string, TaskNode>;
  indegree: Map<string, number>;
  maxConstraintStart: Map<string, number>;
  queue: string[];
}

export interface ForwardPassParams {
  tasks: TaskNode[];
  edgeMap: Map<string, TaskDependencyEdge[]>;
}

export interface BuildBackwardPassMapsParams {
  tasks: TaskNode[];
  projectDuration: number;
  edgeMap: Map<string, TaskDependencyEdge[]>;
  taskMap: Map<string, TaskNode>;
}

export interface UpdateBackwardPredecessorParams {
  successor: TaskNode;
  dep: TaskDependencyEdge;
  taskMap: Map<string, TaskNode>;
  outdegree: Map<string, number>;
  predecessorBounds: Map<string, { maxLateFinish: number; maxLateStart: number }>;
  projectDuration: number;
  queue: string[];
}

export interface BackwardPassParams {
  tasks: TaskNode[];
  projectDuration: number;
  edgeMap: Map<string, TaskDependencyEdge[]>;
}

export interface ProcessForwardPassQueueParams {
  taskMap: Map<string, TaskNode>;
  queue: string[];
  maxConstraintStart: Map<string, number>;
  dependents: Map<string, Array<{ successorId: string; relationship: DependencyType }>>;
  indegree: Map<string, number>;
}

export interface ProcessBackwardPassQueueParams {
  taskMap: Map<string, TaskNode>;
  queue: string[];
  predecessorBounds: Map<string, { maxLateFinish: number; maxLateStart: number }>;
  projectDuration: number;
  edgeMap: Map<string, TaskDependencyEdge[]>;
  outdegree: Map<string, number>;
}
