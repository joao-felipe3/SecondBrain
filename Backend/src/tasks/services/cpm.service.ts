import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DependencyType, TaskDependency, TaskDependencyDocument } from '../schemas/task-dependency.schema';

export interface TaskNode {
  id: string;
  name: string;
  duration: number; // Tempo esperado em minutos (capturado via PERT)
  dependencies: string[]; // IDs de predecessoras

  // Calculados:
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  slack?: number;
  isCritical?: boolean;
}

export interface CPMAnalysis {
  criticalPath: string[];
  projectDuration: number;
  tasksByImpact: TaskNode[];
  alerts: string[];
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

  private buildCriticalPathSequence(tasks: TaskNode[], projectDuration: number): string[] {
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

      const deps = Array.isArray(cur.dependencies) ? cur.dependencies : [];
      if (deps.length === 0) break;

      const es = typeof cur.earlyStart === 'number' ? cur.earlyStart : 0;
      let bestPred: TaskNode | undefined;
      let bestScore = -Infinity;

      for (const predId of deps) {
        const pred = taskById.get(predId);
        if (!pred || typeof pred.earlyFinish !== 'number') continue;

        // Prefer predecessors that line up with ES (finish-to-start on the longest path)
        const aligns = Math.abs((pred.earlyFinish ?? 0) - es) <= eps;
        const score = (aligns ? 1_000_000 : 0) + (pred.earlyFinish ?? 0);
        if (score > bestScore) {
          bestScore = score;
          bestPred = pred;
        }
      }

      if (!bestPred) break;
      // If it doesn't align at all, stop to avoid producing a misleading chain.
      if (typeof bestPred.earlyFinish === 'number' && Math.abs(bestPred.earlyFinish - es) > eps) break;
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

  private normalizeRelationship(input?: string): DependencyType {
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

    // 1. Forward pass: calcula ES e EF
    const forward = this.forwardPass(tasksInHours);

    // 2. Determina duração do projeto
    const projectDuration = Math.max(...tasksInHours.map(t => t.earlyFinish || 0));

    // 3. Backward pass: calcula LS e LF
    const backward = this.backwardPass(tasksInHours, projectDuration);

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
    });

    // Ordena por impacto (slack crescente = mais crítica)
    const tasksByImpact = [...tasksInHours].sort((a, b) => (a.slack || 0) - (b.slack || 0));

    const criticalPathSequence = this.buildCriticalPathSequence(tasksInHours, projectDuration);

    const taskById = new Map<string, TaskNode>();
    for (const t of tasksInHours) taskById.set(t.id, t);
    const criticalChainDuration = criticalPathSequence.reduce((sum, id) => sum + (taskById.get(id)?.duration ?? 0), 0);
    const totalWork = tasksInHours.reduce((sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0), 0);
    const impliedParallelism = projectDuration > 0 ? totalWork / projectDuration : 0;
    const nearCriticalCount = tasksInHours.filter((t) => {
      const slack = typeof t.slack === 'number' ? t.slack : 0;
      return slack >= 0 && slack < 2; // hours
    }).length;

    // Basic graph stats (ignore missing deps)
    const taskIds = new Set(tasksInHours.map((t) => t.id));
    let edgeCount = 0;
    const indegree = new Map<string, number>();
    const outdegree = new Map<string, number>();
    let depSum = 0;
    for (const t of tasksInHours) {
      indegree.set(t.id, 0);
      outdegree.set(t.id, 0);
    }
    for (const t of tasksInHours) {
      const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
      depSum += deps.length;
      for (const depId of deps) {
        if (!taskIds.has(depId)) continue;
        edgeCount++;
        indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
        outdegree.set(depId, (outdegree.get(depId) || 0) + 1);
      }
    }
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

    return {
      criticalPath: criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map(t => t.id),
      projectDuration: Math.round(projectDuration * 100) / 100, // Arredonda a 2 casas decimais
      tasksByImpact,
      alerts,
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
      },
    };
  }

  /**
   * Forward pass: calcula ES (Early Start) e EF (Early Finish)
   */
  private forwardPass(tasks: TaskNode[]): { hasCycle: boolean; unprocessed: number } {
    const taskMap = new Map<string, TaskNode>();
    for (const t of tasks) taskMap.set(t.id, t);

    const indegree = new Map<string, number>();
    const adj = new Map<string, string[]>(); // precedence edges: depId -> taskId
    const maxPredFinish = new Map<string, number>();

    for (const t of tasks) {
      indegree.set(t.id, 0);
      adj.set(t.id, []);
      maxPredFinish.set(t.id, 0);
    }

    // Build graph
    for (const t of tasks) {
      const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
      for (const depId of deps) {
        if (!taskMap.has(depId)) continue;
        indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
        adj.get(depId)!.push(t.id);
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
      const es = maxPredFinish.get(id) || 0;
      t.earlyStart = es;
      t.earlyFinish = es + t.duration;
      processed++;

      for (const dependentId of adj.get(id) || []) {
        const nextMax = Math.max(maxPredFinish.get(dependentId) || 0, t.earlyFinish || 0);
        maxPredFinish.set(dependentId, nextMax);

        const newDeg = (indegree.get(dependentId) || 0) - 1;
        indegree.set(dependentId, newDeg);
        if (newDeg === 0) queue.push(dependentId);
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
  private backwardPass(tasks: TaskNode[], projectDuration: number): { hasCycle: boolean; unprocessed: number } {
    const taskMap = new Map<string, TaskNode>();
    for (const t of tasks) taskMap.set(t.id, t);

    const outdegree = new Map<string, number>();
    const dependentsAdj = new Map<string, string[]>(); // depId -> list of dependents
    const minSuccStart = new Map<string, number>();

    for (const t of tasks) {
      outdegree.set(t.id, 0);
      dependentsAdj.set(t.id, []);
      minSuccStart.set(t.id, projectDuration);
    }

    // Build dependents adjacency and outdegree
    for (const t of tasks) {
      const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
      for (const depId of deps) {
        if (!taskMap.has(depId)) continue;
        dependentsAdj.get(depId)!.push(t.id);
        outdegree.set(depId, (outdegree.get(depId) || 0) + 1);
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

      const hasDependents = (dependentsAdj.get(id) || []).length > 0;
      const lf = hasDependents ? (minSuccStart.get(id) ?? projectDuration) : projectDuration;
      t.lateFinish = lf;
      t.lateStart = lf - t.duration;
      processed++;

      // Update predecessors (dependencies)
      const preds = Array.isArray(t.dependencies) ? t.dependencies : [];
      for (const predId of preds) {
        if (!taskMap.has(predId)) continue;
        const nextMin = Math.min(minSuccStart.get(predId) ?? projectDuration, t.lateStart ?? projectDuration);
        minSuccStart.set(predId, nextMin);

        const newDeg = (outdegree.get(predId) || 0) - 1;
        outdegree.set(predId, newDeg);
        if (newDeg === 0) queue.push(predId);
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
    context?: { cycleDetected?: boolean; unprocessedForward?: number; unprocessedBackward?: number },
  ): string[] {
    const alerts: string[] = [];

    if (criticalTasks.length === 0) {
      alerts.push('⚠️ Nenhuma tarefa crítica encontrada - verifique as dependências');
      return alerts;
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

    return alerts;
  }

  /**
   * Detecta ciclos nas dependências (não devem existir)
   */
  private hasCycle(tasks: TaskNode[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.dependencies) {
        recursionStack.delete(taskId);
        return false;
      }

      for (const depId of task.dependencies) {
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
