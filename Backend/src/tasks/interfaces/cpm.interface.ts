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

export interface CPMAnalysis {
  criticalPath: string[];
  projectDuration: number;
  tasksByImpact: TaskNode[];
  alerts: string[];
  packageCriticality?: PackageCriticality[];
  diagnostics?: {
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
    slackBuckets?: {
      negative: number;
      critical: number;
      nearCritical: number;
      lowSlack: number;
      comfortable: number;
    };
    topUnlockers?: Array<{
      taskId: string;
      taskName: string;
      outDegree: number;
    }>;
    topBottlenecks?: Array<{
      taskId: string;
      taskName: string;
      inDegree: number;
    }>;
    validation?: {
      missingDependencyRefs: number;
      missingDependencySamples?: Array<{
        taskId: string;
        dependsOnTaskId: string;
      }>;
      reliability: 'high' | 'medium' | 'low';
    };
  };
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
