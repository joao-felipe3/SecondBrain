import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DependencyType, TaskDependency, TaskDependencyDocument } from '../schemas/task-dependency.schema';

export interface TaskDependencyEdge {
  predecessorId: string;
  relationship: DependencyType;
}

export interface TaskNode {
  id: string;
  name: string;
  duration: number; // Tempo esperado em minutos (capturado via PERT)
  dependencies: string[]; // IDs de predecessoras
  dependencyEdges?: TaskDependencyEdge[];
  parentWbsNodeId?: string;
  wbsPath?: string;

  // Calculados:
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
    topUnlockers?: Array<{ taskId: string; taskName: string; outDegree: number }>;
    topBottlenecks?: Array<{ taskId: string; taskName: string; inDegree: number }>;
    validation?: {
      missingDependencyRefs: number;
      missingDependencySamples?: Array<{ taskId: string; dependsOnTaskId: string }>;
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

@Injectable()
export class CPMService {
  private readonly logger = new Logger(CPMService.name);

  private getDependencyEdges(task: TaskNode): TaskDependencyEdge[] {
    const normalized: TaskDependencyEdge[] = [];
    const seen = new Set<string>();

    const explicitEdges = Array.isArray(task.dependencyEdges) ? task.dependencyEdges : [];
    for (const edge of explicitEdges) {
      const predecessorId = String((edge as any)?.predecessorId ?? '').trim();
      if (!predecessorId) continue;
      if (seen.has(predecessorId)) continue;
      seen.add(predecessorId);
      normalized.push({
        predecessorId,
        relationship: this.normalizeRelationship((edge as any)?.relationship),
      });
    }

    const fallbackDeps = Array.isArray(task.dependencies) ? task.dependencies : [];
    for (const depId of fallbackDeps) {
      const predecessorId = String(depId ?? '').trim();
      if (!predecessorId) continue;
      if (seen.has(predecessorId)) continue;
      seen.add(predecessorId);
      normalized.push({
        predecessorId,
        relationship: DependencyType.FINISH_TO_START,
      });
    }

    return normalized;
  }

  private buildEdgeMap(tasks: TaskNode[]): Map<string, TaskDependencyEdge[]> {
    const edgeMap = new Map<string, TaskDependencyEdge[]>();
    for (const task of tasks) {
      edgeMap.set(task.id, this.getDependencyEdges(task));
    }
    return edgeMap;
  }

  private computePackageCriticality(tasks: TaskNode[], criticalPath: string[]): PackageCriticality[] {
    const criticalPathSet = new Set(criticalPath);
    const grouped = new Map<string, { path?: string; tasks: TaskNode[] }>();

    for (const task of tasks) {
      const packageId = String(task.parentWbsNodeId || task.wbsPath || 'unassigned');
      const existing = grouped.get(packageId) || { path: task.wbsPath, tasks: [] };
      existing.tasks.push(task);
      if (!existing.path && task.wbsPath) existing.path = task.wbsPath;
      grouped.set(packageId, existing);
    }

    if (grouped.size === 0) return [];

    const byPackage = [...grouped.entries()].map(([packageId, group]) => {
      const totalTaskCount = group.tasks.length;
      const criticalTasks = group.tasks.filter((t) => Boolean(t.isCritical));
      const criticalTaskCount = criticalTasks.length;
      const criticalRatio = totalTaskCount > 0 ? criticalTaskCount / totalTaskCount : 0;

      let minSlack = Number.POSITIVE_INFINITY;
      for (const t of group.tasks) {
        if (typeof t.slack === 'number') minSlack = Math.min(minSlack, t.slack);
      }
      if (!Number.isFinite(minSlack)) minSlack = 0;

      const criticalDuration = criticalTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
      const criticalPathTaskCount = group.tasks.reduce(
        (count, task) => count + (criticalPathSet.has(task.id) ? 1 : 0),
        0,
      );

      return {
        packageId,
        packagePath: group.path,
        taskCount: totalTaskCount,
        criticalTaskCount,
        criticalRatio,
        minSlack,
        criticalDuration,
        criticalPathTaskCount,
        score: 0,
      };
    });

    const maxCriticalDuration = Math.max(...byPackage.map((item) => item.criticalDuration), 0);

    const scored = byPackage.map((item) => {
      const criticalRatioScore = item.criticalRatio * 100;
      const slackRiskScore = (1 - Math.min(1, Math.max(0, item.minSlack) / 8)) * 100;
      const durationScore = maxCriticalDuration > 0 ? (item.criticalDuration / maxCriticalDuration) * 100 : 0;
      const score = criticalRatioScore * 0.3 + slackRiskScore * 0.2 + durationScore * 0.5;

      return {
        packageId: item.packageId,
        packagePath: item.packagePath,
        taskCount: item.taskCount,
        criticalTaskCount: item.criticalTaskCount,
        criticalRatio: Math.round(item.criticalRatio * 1000) / 10,
        minSlack: Math.round(item.minSlack * 100) / 100,
        criticalDuration: Math.round(item.criticalDuration * 100) / 100,
        criticalPathTaskCount: item.criticalPathTaskCount,
        score: Math.round(score * 100) / 100,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.criticalRatio !== a.criticalRatio) return b.criticalRatio - a.criticalRatio;
      if (a.minSlack !== b.minSlack) return a.minSlack - b.minSlack;
      return a.packageId.localeCompare(b.packageId);
    });

    return scored;
  }

  private buildCriticalPathSequence(
    tasks: TaskNode[],
    projectDuration: number,
    edgeMap: Map<string, TaskDependencyEdge[]>,
  ): string[] {
    const taskById = new Map<string, TaskNode>();
    for (const t of tasks) taskById.set(t.id, t);

    const eps = 0.11; // hours; slightly above critical slack threshold

    // Pick one terminal task that achieves the project duration.
    let end: TaskNode | undefined;
    for (const t of tasks) {
      if (typeof t.earlyFinish !== 'number') continue;
      if (!end || (t.earlyFinish ?? 0) > (end.earlyFinish ?? 0)) end = t;
    }

    if (!end || typeof end.earlyFinish !== 'number') return [];
    // If projectDuration was computed as 0 due to incomplete processing, still return best-effort.
    if (projectDuration > 0 && Math.abs(end.earlyFinish - projectDuration) > eps) {
      // Find a task closer to projectDuration (within eps) if possible.
      const candidate = tasks.find(
        (t) => typeof t.earlyFinish === 'number' && Math.abs((t.earlyFinish ?? 0) - projectDuration) <= eps,
      );
      if (candidate) end = candidate;
    }

    const path: string[] = [];
    const visited = new Set<string>();
    let cur: TaskNode | undefined = end;

    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      path.push(cur.id);

      const deps = edgeMap.get(cur.id) || [];
      if (deps.length === 0) break;

      const es = typeof cur.earlyStart === 'number' ? cur.earlyStart : 0;
      const ef = typeof cur.earlyFinish === 'number' ? cur.earlyFinish : es + (cur.duration || 0);
      let bestPred: TaskNode | undefined;
      let bestScore = -Infinity;

      for (const dep of deps) {
        const pred = taskById.get(dep.predecessorId);
        if (!pred || typeof pred.earlyFinish !== 'number') continue;

        const predES = typeof pred.earlyStart === 'number' ? pred.earlyStart : 0;
        const predEF = typeof pred.earlyFinish === 'number' ? pred.earlyFinish : predES + (pred.duration || 0);

        let aligns = false;
        let timelineRef = predEF;

        if (dep.relationship === DependencyType.START_TO_START) {
          aligns = Math.abs(predES - es) <= eps;
          timelineRef = predES;
        } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
          aligns = Math.abs(predEF - ef) <= eps;
          timelineRef = predEF;
        } else {
          aligns = Math.abs(predEF - es) <= eps;
          timelineRef = predEF;
        }

        const criticalBonus = Math.abs(Number(pred.slack ?? Number.POSITIVE_INFINITY)) < 0.1 ? 1_000_000_000 : 0;
        const alignmentBonus = aligns ? 1_000_000 : 0;
        const score = criticalBonus + alignmentBonus + timelineRef;
        if (score > bestScore) {
          bestScore = score;
          bestPred = pred;
        } else if (score === bestScore && bestPred && pred.id.localeCompare(bestPred.id) < 0) {
          bestPred = pred;
        }
      }

      if (!bestPred) break;
      cur = bestPred;
    }

    return path.reverse();
  }

  constructor(
    @InjectModel(TaskDependency.name) private dependencyModel: Model<TaskDependencyDocument>,
  ) {}

  /**
   * Adiciona uma dependência entre duas tarefas
   */
  async addDependency(
    taskId: string,
    dependsOnTaskId: string,
    projectId: string,
    reason?: string,
    relationship: string = DependencyType.FINISH_TO_START,
    isAutoIdentified = false,
  ): Promise<TaskDependency> {
    const normalizedRelationship = this.normalizeRelationship(relationship);
    const dependency = new this.dependencyModel({
      taskId,
      dependsOnTaskId,
      projectId,
      reason,
      relationship: normalizedRelationship,
      isAutoIdentified,
    });
    return dependency.save();
  }

  /**
   * Cria/atualiza dependências em lote de forma idempotente.
   * Útil para auto-geração (ex.: sequência linear) no save em lote.
   */
  async upsertDependencies(
    deps: Array<{
      taskId: string;
      dependsOnTaskId: string;
      projectId: string;
      relationship?: string;
      reason?: string;
      isAutoIdentified?: boolean;
    }>,
  ): Promise<number> {
    const items = Array.isArray(deps) ? deps : [];
    if (items.length === 0) return 0;

    const ops = items
      .filter((d) => d?.taskId && d?.dependsOnTaskId && d?.projectId)
      .map((d) => {
        const relationship = this.normalizeRelationship(d.relationship);
        return {
          updateOne: {
            filter: {
              taskId: String(d.taskId),
              dependsOnTaskId: String(d.dependsOnTaskId),
              projectId: String(d.projectId),
            },
            update: {
              $set: {
                relationship,
                reason: d.reason ?? '',
                isAutoIdentified: Boolean(d.isAutoIdentified),
              },
            },
            upsert: true,
          },
        };
      });

    if (ops.length === 0) return 0;
    const result: any = await this.dependencyModel.bulkWrite(ops as any, { ordered: false });
    const upserted = Number(result?.upsertedCount || 0);
    const modified = Number(result?.modifiedCount || 0);
    return upserted + modified;
  }

  normalizeRelationship(input?: string): DependencyType {
    const raw = String(input ?? '').trim();
    const lowered = raw.toLowerCase();

    // Accept schema enum values directly
    if (
      lowered === DependencyType.FINISH_TO_START ||
      lowered === DependencyType.START_TO_START ||
      lowered === DependencyType.FINISH_TO_FINISH
    ) {
      return lowered as DependencyType;
    }

    // Accept controller-style constants
    const upper = raw.toUpperCase();
    if (upper === 'FINISH_TO_START') return DependencyType.FINISH_TO_START;
    if (upper === 'START_TO_START') return DependencyType.START_TO_START;
    if (upper === 'FINISH_TO_FINISH') return DependencyType.FINISH_TO_FINISH;

    // Fallback
    return DependencyType.FINISH_TO_START;
  }

  /**
   * Remove uma dependência
   */
  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await this.dependencyModel.deleteOne({ taskId, dependsOnTaskId });
  }

  /**
   * Busca todas as dependências de um projeto
   */
  async getDependencies(projectId: string): Promise<TaskDependency[]> {
    return this.dependencyModel.find({ projectId }).exec();
  }

  async removeDependenciesByIds(ids: string[]): Promise<number> {
    const list = Array.isArray(ids) ? ids.filter(Boolean).map((s) => String(s)) : [];
    if (list.length === 0) return 0;
    const res: any = await this.dependencyModel.deleteMany({ _id: { $in: list } }).exec();
    return Number(res?.deletedCount || 0);
  }

  /**
   * Calcula o caminho crítico usando forward/backward pass
   * Tasks devem ter duration (em minutos) e estar com IDs preenchidos
   */
  calculateCriticalPath(tasks: TaskNode[]): CPMAnalysis {
    if (tasks.length === 0) {
      return {
        criticalPath: [],
        projectDuration: 0,
        tasksByImpact: [],
        alerts: [],
      };
    }

    // Converte minutos para horas para facilitar cálculos
    const tasksInHours = tasks.map(t => ({
      ...t,
      duration: t.duration / 60, // Minutos → Horas
    }));

    const edgeMap = this.buildEdgeMap(tasksInHours);
    const taskIds = new Set(tasksInHours.map((t) => t.id));
    let missingDependencyRefs = 0;
    const missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }> = [];
    for (const t of tasksInHours) {
      const deps = edgeMap.get(t.id) || [];
      for (const dep of deps) {
        if (!taskIds.has(dep.predecessorId)) {
          missingDependencyRefs++;
          if (missingDependencySamples.length < 5) {
            missingDependencySamples.push({ taskId: t.id, dependsOnTaskId: dep.predecessorId });
          }
        }
      }
    }

    // 1. Forward pass: calcula ES e EF
    const forward = this.forwardPass(tasksInHours, edgeMap);

    // 2. Determina duração do projeto
    const projectDuration = Math.max(...tasksInHours.map(t => t.earlyFinish || 0));

    // 3. Backward pass: calcula LS e LF
    const backward = this.backwardPass(tasksInHours, projectDuration, edgeMap);

    // 4. Calcula folga e identifica críticas
    const criticalTasks = tasksInHours.filter(t => {
      // Defensive defaults for partially-processed graphs (e.g., cycle)
      if (typeof t.earlyStart !== 'number') t.earlyStart = 0;
      if (typeof t.earlyFinish !== 'number') t.earlyFinish = t.duration;
      if (typeof t.lateFinish !== 'number') t.lateFinish = projectDuration;
      if (typeof t.lateStart !== 'number') t.lateStart = (t.lateFinish ?? projectDuration) - t.duration;

      t.slack = t.lateStart! - t.earlyStart!;
      // Considera crítica se slack ≤ 0.1 horas (devido a arredondamentos)
      t.isCritical = Math.abs(t.slack) < 0.1;
      return t.isCritical;
    });

    // 5. Gera alertas
    const alerts = this.generateAlerts(tasksInHours, criticalTasks, {
      cycleDetected: forward.hasCycle || backward.hasCycle,
      unprocessedForward: forward.unprocessed,
      unprocessedBackward: backward.unprocessed,
      missingDependencyRefs,
    });

    const indegree = new Map<string, number>();
    const outdegree = new Map<string, number>();
    let edgeCount = 0;
    let depSum = 0;
    for (const t of tasksInHours) {
      indegree.set(t.id, 0);
      outdegree.set(t.id, 0);
    }
    for (const t of tasksInHours) {
      const deps = edgeMap.get(t.id) || [];
      depSum += deps.length;
      for (const dep of deps) {
        if (!taskIds.has(dep.predecessorId)) continue;
        edgeCount++;
        indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
        outdegree.set(dep.predecessorId, (outdegree.get(dep.predecessorId) || 0) + 1);
      }
    }

    // Ordena por impacto (slack crescente = mais crítica) com desempate determinístico
    const tasksByImpact = [...tasksInHours].sort((a, b) => {
      const slackDiff = (a.slack || 0) - (b.slack || 0);
      if (Math.abs(slackDiff) > 0.01) return slackDiff;

      const aInDegree = indegree.get(a.id) || 0;
      const bInDegree = indegree.get(b.id) || 0;
      if (aInDegree !== bInDegree) return bInDegree - aInDegree;

      if (a.duration !== b.duration) return (b.duration || 0) - (a.duration || 0);

      const byName = String(a.name || '').localeCompare(String(b.name || ''));
      if (byName !== 0) return byName;

      return a.id.localeCompare(b.id);
    });

    const criticalPathSequence = this.buildCriticalPathSequence(tasksInHours, projectDuration, edgeMap);

    const taskById = new Map<string, TaskNode>();
    for (const t of tasksInHours) taskById.set(t.id, t);
    const criticalChainDuration = criticalPathSequence.reduce((sum, id) => sum + (taskById.get(id)?.duration ?? 0), 0);
    const totalWork = tasksInHours.reduce((sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0), 0);
    const impliedParallelism = projectDuration > 0 ? totalWork / projectDuration : 0;
    const nearCriticalCount = tasksInHours.filter((t) => {
      const slack = typeof t.slack === 'number' ? t.slack : 0;
      return slack >= 0 && slack < 2; // hours
    }).length;

    const startNodeCount = [...indegree.values()].filter((v) => v === 0).length;
    const endNodeCount = [...outdegree.values()].filter((v) => v === 0).length;

    // Slack distribution (useful for quick risk/room-to-maneuver intuition)
    const slackBuckets = {
      negative: 0,
      critical: 0,
      nearCritical: 0,
      lowSlack: 0,
      comfortable: 0,
    };
    for (const t of tasksInHours) {
      const slack = typeof t.slack === 'number' ? t.slack : 0;
      if (slack < 0) slackBuckets.negative++;
      else if (Math.abs(slack) < 0.1) slackBuckets.critical++;
      else if (slack < 2) slackBuckets.nearCritical++;
      else if (slack < 8) slackBuckets.lowSlack++;
      else slackBuckets.comfortable++;
    }

    const topUnlockers = [...outdegree.entries()]
      .filter(([, deg]) => (deg ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8)
      .map(([taskId, deg]) => ({
        taskId,
        taskName: taskById.get(taskId)?.name ?? taskId,
        outDegree: Number(deg ?? 0),
      }));

    const topBottlenecks = [...indegree.entries()]
      .filter(([, deg]) => (deg ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8)
      .map(([taskId, deg]) => ({
        taskId,
        taskName: taskById.get(taskId)?.name ?? taskId,
        inDegree: Number(deg ?? 0),
      }));

    const effectiveCriticalPath = criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map(t => t.id);
    const packageCriticality = this.computePackageCriticality(tasksInHours, effectiveCriticalPath);

    const reliability: 'high' | 'medium' | 'low' =
      forward.hasCycle || backward.hasCycle
        ? 'low'
        : missingDependencyRefs > 0
          ? 'medium'
          : 'high';

    return {
      criticalPath: criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map(t => t.id),
      projectDuration: Math.round(projectDuration * 100) / 100, // Arredonda a 2 casas decimais
      tasksByImpact,
      alerts,
      packageCriticality,
      diagnostics: {
        taskCount: tasksInHours.length,
        criticalCount: criticalTasks.length,
        criticalPercent:
          tasksInHours.length > 0 ? Math.round((criticalTasks.length / tasksInHours.length) * 1000) / 10 : 0,
        criticalChainTaskCount: criticalPathSequence.length,
        criticalChainDuration: Math.round(criticalChainDuration * 100) / 100,
        nearCriticalCount,
        totalWork: Math.round(totalWork * 100) / 100,
        impliedParallelism: Math.round(impliedParallelism * 100) / 100,
        hasCycle: Boolean(forward.hasCycle || backward.hasCycle),
        unprocessedForward: forward.unprocessed,
        unprocessedBackward: backward.unprocessed,
        edgeCount,
        startNodeCount,
        endNodeCount,
        avgDependenciesPerTask: tasksInHours.length > 0 ? Math.round((depSum / tasksInHours.length) * 100) / 100 : 0,
        slackBuckets,
        topUnlockers,
        topBottlenecks,
        validation: {
          missingDependencyRefs,
          missingDependencySamples,
          reliability,
        },
      },
    };
  }

  /**
   * Forward pass: calcula ES (Early Start) e EF (Early Finish)
   */
  private forwardPass(
    tasks: TaskNode[],
    edgeMap: Map<string, TaskDependencyEdge[]>,
  ): { hasCycle: boolean; unprocessed: number } {
    const taskMap = new Map<string, TaskNode>();
    for (const t of tasks) taskMap.set(t.id, t);

    const indegree = new Map<string, number>();
    const dependents = new Map<string, Array<{ successorId: string; relationship: DependencyType }>>();
    const maxConstraintStart = new Map<string, number>();

    for (const t of tasks) {
      indegree.set(t.id, 0);
      dependents.set(t.id, []);
      maxConstraintStart.set(t.id, 0);
    }

    // Build graph
    for (const t of tasks) {
      const deps = edgeMap.get(t.id) || [];
      for (const dep of deps) {
        if (!taskMap.has(dep.predecessorId)) continue;
        indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
        dependents.get(dep.predecessorId)!.push({
          successorId: t.id,
          relationship: dep.relationship,
        });
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of indegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let processed = 0;
    while (queue.length) {
      const id = queue.shift()!;
      const t = taskMap.get(id);
      if (!t) continue;
      const es = Math.max(0, maxConstraintStart.get(id) || 0);
      t.earlyStart = es;
      t.earlyFinish = es + t.duration;
      processed++;

      for (const dep of dependents.get(id) || []) {
        const dependent = taskMap.get(dep.successorId);
        if (!dependent) continue;

        let candidateStart = t.earlyFinish || 0;
        if (dep.relationship === DependencyType.START_TO_START) {
          candidateStart = t.earlyStart || 0;
        } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
          candidateStart = (t.earlyFinish || 0) - (dependent.duration || 0);
        }

        const nextMax = Math.max(maxConstraintStart.get(dep.successorId) || 0, candidateStart);
        maxConstraintStart.set(dep.successorId, nextMax);

        const newDeg = (indegree.get(dep.successorId) || 0) - 1;
        indegree.set(dep.successorId, newDeg);
        if (newDeg === 0) queue.push(dep.successorId);
      }
    }

    const hasCycle = processed < tasks.length;
    const unprocessed = Math.max(0, tasks.length - processed);
    if (hasCycle) {
      this.logger.warn(
        `Forward pass não processou todas as tarefas (unprocessed=${unprocessed}). Possível ciclo nas dependências.`,
      );
    }
    return { hasCycle, unprocessed };
  }

  /**
   * Backward pass: calcula LS (Late Start) e LF (Late Finish)
   */
  private backwardPass(
    tasks: TaskNode[],
    projectDuration: number,
    edgeMap: Map<string, TaskDependencyEdge[]>,
  ): { hasCycle: boolean; unprocessed: number } {
    const taskMap = new Map<string, TaskNode>();
    for (const t of tasks) taskMap.set(t.id, t);

    const outdegree = new Map<string, number>();
    const predecessorBounds = new Map<string, { maxLateFinish: number; maxLateStart: number }>();

    for (const t of tasks) {
      outdegree.set(t.id, 0);
      predecessorBounds.set(t.id, {
        maxLateFinish: projectDuration,
        maxLateStart: projectDuration - t.duration,
      });
    }

    // Build outdegree (valid successors only)
    for (const t of tasks) {
      const deps = edgeMap.get(t.id) || [];
      for (const dep of deps) {
        if (!taskMap.has(dep.predecessorId)) continue;
        outdegree.set(dep.predecessorId, (outdegree.get(dep.predecessorId) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of outdegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let processed = 0;
    while (queue.length) {
      const id = queue.shift()!;
      const t = taskMap.get(id);
      if (!t) continue;

      const bounds = predecessorBounds.get(id) || {
        maxLateFinish: projectDuration,
        maxLateStart: projectDuration - t.duration,
      };
      const lfLimit = Number.isFinite(bounds.maxLateFinish) ? bounds.maxLateFinish : projectDuration;
      const lsLimit = Number.isFinite(bounds.maxLateStart) ? bounds.maxLateStart : projectDuration - t.duration;

      const ls = Math.min(lsLimit, lfLimit - t.duration);
      const lf = ls + t.duration;

      t.lateFinish = lf;
      t.lateStart = ls;
      processed++;

      // Update predecessors (dependencies)
      const preds = edgeMap.get(id) || [];
      for (const pred of preds) {
        const predecessor = taskMap.get(pred.predecessorId);
        if (!predecessor) continue;

        const predBounds = predecessorBounds.get(pred.predecessorId) || {
          maxLateFinish: projectDuration,
          maxLateStart: projectDuration - predecessor.duration,
        };

        if (pred.relationship === DependencyType.START_TO_START) {
          predBounds.maxLateStart = Math.min(predBounds.maxLateStart, t.lateStart ?? projectDuration);
        } else if (pred.relationship === DependencyType.FINISH_TO_FINISH) {
          predBounds.maxLateFinish = Math.min(predBounds.maxLateFinish, t.lateFinish ?? projectDuration);
        } else {
          predBounds.maxLateFinish = Math.min(predBounds.maxLateFinish, t.lateStart ?? projectDuration);
        }

        predecessorBounds.set(pred.predecessorId, predBounds);

        const newDeg = (outdegree.get(pred.predecessorId) || 0) - 1;
        outdegree.set(pred.predecessorId, newDeg);
        if (newDeg === 0) queue.push(pred.predecessorId);
      }
    }

    const hasCycle = processed < tasks.length;
    const unprocessed = Math.max(0, tasks.length - processed);
    if (hasCycle) {
      this.logger.warn(
        `Backward pass não processou todas as tarefas (unprocessed=${unprocessed}). Possível ciclo nas dependências.`,
      );
    }
    return { hasCycle, unprocessed };
  }

  /**
   * Gera alertas sobre o caminho crítico
   */
  private generateAlerts(
    allTasks: TaskNode[],
    criticalTasks: TaskNode[],
    context?: {
      cycleDetected?: boolean;
      unprocessedForward?: number;
      unprocessedBackward?: number;
      missingDependencyRefs?: number;
    },
  ): string[] {
    const alerts: string[] = [];

    if (criticalTasks.length === 0) {
      alerts.push('⚠️ Nenhuma tarefa crítica encontrada - verifique as dependências');
    }

    // Alerta sobre número de críticas
    if (criticalTasks.length > allTasks.length * 0.7) {
      alerts.push(
        `🔴 ${criticalTasks.length} tarefas críticas (${((criticalTasks.length / allTasks.length) * 100).toFixed(0)}%)! Projeto tem alta rigidez.`,
      );
    } else {
      alerts.push(
        `⚡ ${criticalTasks.length} tarefa(s) crítica(s) identificada(s). Monitore com atenção.`,
      );
    }

    // Alerta sobre tarefas com folga baixa
    const lowSlackTasks = allTasks.filter(t => {
      const slack = t.slack || 0;
      return slack >= 0 && slack < 2;
    });

    if (lowSlackTasks.length > 0) {
      alerts.push(
        `⚠️ ${lowSlackTasks.length} tarefa(s) com folga < 2h. Possuem pouca margem de manobra.`,
      );
    }

    // Alerta sobre ciclos (não deve acontecer, mas verificamos)
    const cycle = Boolean(context?.cycleDetected) || this.hasCycle(allTasks);
    if (cycle) {
      const uf = Number(context?.unprocessedForward || 0);
      const ub = Number(context?.unprocessedBackward || 0);
      alerts.push(
        `⚠️ Ciclo (ou grafo inconsistente) detectado nas dependências. CPM pode ficar impreciso. ` +
          `Não processadas: forward=${uf}, backward=${ub}.`,
      );
    } else {
      alerts.push('✅ Sem ciclos detectados - dependências consistentes.');
    }

    const missingRefs = Number(context?.missingDependencyRefs || 0);
    if (missingRefs > 0) {
      alerts.push(`⚠️ ${missingRefs} referência(s) para predecessoras ausentes foram ignoradas no cálculo.`);
    }

    return alerts;
  }

  /**
   * Detecta ciclos nas dependências (não devem existir)
   */
  private hasCycle(tasks: TaskNode[]): boolean {
    const taskById = new Map<string, TaskNode>();
    for (const task of tasks) taskById.set(task.id, task);

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = taskById.get(taskId);
      if (!task) {
        recursionStack.delete(taskId);
        return false;
      }

      for (const dep of this.getDependencyEdges(task)) {
        const depId = dep.predecessorId;
        if (!taskById.has(depId)) continue;
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true; // Ciclo encontrado
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (dfs(task.id)) return true;
      }
    }

    return false;
  }

  /**
   * Retorna métricas detalhadas de uma tarefa
   */
  getTaskMetrics(task: TaskNode): TaskMetrics {
    return {
      taskId: task.id,
      taskName: task.name,
      earlyStart: Math.round(task.earlyStart! * 100) / 100,
      earlyFinish: Math.round(task.earlyFinish! * 100) / 100,
      lateStart: Math.round(task.lateStart! * 100) / 100,
      lateFinish: Math.round(task.lateFinish! * 100) / 100,
      slack: Math.round((task.slack || 0) * 100) / 100,
      isCritical: task.isCritical || false,
    };
  }

  /**
   * Retorna tarefas críticas ordenadas por importância
   */
  getCriticalTasks(analysis: CPMAnalysis): TaskNode[] {
    return analysis.tasksByImpact.filter(t => t.isCritical);
  }
}
