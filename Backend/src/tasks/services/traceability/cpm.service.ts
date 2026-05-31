import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    DependencyType,
    TaskDependency,
    TaskDependencyDocument,
} from '../../schemas/task-dependency.schema';

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

@Injectable()
export class CPMService {
    private readonly logger = new Logger(CPMService.name);

    getTaskMetrics(task: TaskNode): TaskMetrics {
        return {
            taskId: task.id,
            taskName: task.name,
            earlyStart: task.earlyStart ?? 0,
            earlyFinish: task.earlyFinish ?? 0,
            lateStart: task.lateStart ?? 0,
            lateFinish: task.lateFinish ?? 0,
            slack: task.slack ?? 0,
            isCritical: Boolean(task.isCritical),
        };
    }

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
            const existing = grouped.get(packageId) || {
                path: task.wbsPath,
                tasks: [],
            };
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
            const durationScore =
                maxCriticalDuration > 0 ? (item.criticalDuration / maxCriticalDuration) * 100 : 0;
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

        const eps = 0.11;

        let end: TaskNode | undefined;
        for (const t of tasks) {
            if (typeof t.earlyFinish !== 'number') continue;
            if (!end || (t.earlyFinish ?? 0) > (end.earlyFinish ?? 0)) end = t;
        }

        if (!end || typeof end.earlyFinish !== 'number') return [];
        if (projectDuration > 0 && Math.abs(end.earlyFinish - projectDuration) > eps) {
            const candidate = tasks.find(
                (t) =>
                    typeof t.earlyFinish === 'number' && Math.abs((t.earlyFinish ?? 0) - projectDuration) <= eps,
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
                const predEF =
                    typeof pred.earlyFinish === 'number' ? pred.earlyFinish : predES + (pred.duration || 0);

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

                const criticalBonus =
                    Math.abs(Number(pred.slack ?? Number.POSITIVE_INFINITY)) < 0.1 ? 1_000_000_000 : 0;
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
        @InjectModel(TaskDependency.name)
        private dependencyModel: Model<TaskDependencyDocument>,
    ) {}

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

    async upsertDependencies(
        deps: Array<{
            taskId: string;
            dependsOnTaskId: string;
            projectId: string;
            relationship?: string;
            reason?: string;
            isAutoIdentified?: boolean;
        }> ,
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
        const result: any = await this.dependencyModel.bulkWrite(ops as any, {
            ordered: false,
        });
        const upserted = Number(result?.upsertedCount || 0);
        const modified = Number(result?.modifiedCount || 0);
        return upserted + modified;
    }

    normalizeRelationship(input?: string): DependencyType {
        const raw = String(input ?? '').trim();
        const lowered = raw.toLowerCase();

        if (
            lowered === DependencyType.FINISH_TO_START ||
            lowered === DependencyType.START_TO_START ||
            lowered === DependencyType.FINISH_TO_FINISH
        ) {
            return lowered as DependencyType;
        }

        const upper = raw.toUpperCase();
        if (upper === 'FINISH_TO_START') return DependencyType.FINISH_TO_START;
        if (upper === 'START_TO_START') return DependencyType.START_TO_START;
        if (upper === 'FINISH_TO_FINISH') return DependencyType.FINISH_TO_FINISH;

        return DependencyType.FINISH_TO_START;
    }

    async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
        await this.dependencyModel.deleteOne({ taskId, dependsOnTaskId });
    }

    async getDependencies(projectId: string): Promise<TaskDependency[]> {
        return this.dependencyModel.find({ projectId }).exec();
    }

    async removeDependenciesByIds(ids: string[]): Promise<number> {
        const list = Array.isArray(ids) ? ids.filter(Boolean).map((s) => String(s)) : [];
        if (list.length === 0) return 0;
        const res: any = await this.dependencyModel.deleteMany({ _id: { $in: list } }).exec();
        return Number(res?.deletedCount || 0);
    }

    calculateCriticalPath(tasks: TaskNode[]): CPMAnalysis {
        if (tasks.length === 0) {
            return {
                criticalPath: [],
                projectDuration: 0,
                tasksByImpact: [],
                alerts: [],
            };
        }

        const tasksInHours = tasks.map((t) => ({
            ...t,
            duration: t.duration / 60,
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
                        missingDependencySamples.push({
                            taskId: t.id,
                            dependsOnTaskId: dep.predecessorId,
                        });
                    }
                }
            }
        }

        const forward = this.forwardPass(tasksInHours, edgeMap);
        const projectDuration = Math.max(...tasksInHours.map((t) => t.earlyFinish || 0));
        const backward = this.backwardPass(tasksInHours, projectDuration, edgeMap);

        const criticalTasks = tasksInHours.filter((t) => {
            if (typeof t.earlyStart !== 'number') t.earlyStart = 0;
            if (typeof t.earlyFinish !== 'number') t.earlyFinish = t.duration;
            if (typeof t.lateFinish !== 'number') t.lateFinish = projectDuration;
            if (typeof t.lateStart !== 'number') t.lateStart = (t.lateFinish ?? projectDuration) - t.duration;

            t.slack = t.lateStart - t.earlyStart;
            t.isCritical = Math.abs(t.slack) < 0.1;
            return t.isCritical;
        });

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
        const criticalChainDuration = criticalPathSequence.reduce(
            (sum, id) => sum + (taskById.get(id)?.duration ?? 0),
            0,
        );
        const totalWork = tasksInHours.reduce(
            (sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0),
            0,
        );
        const impliedParallelism = projectDuration > 0 ? totalWork / projectDuration : 0;
        const nearCriticalCount = tasksInHours.filter((t) => {
            const slack = typeof t.slack === 'number' ? t.slack : 0;
            return slack >= 0 && slack < 2;
        }).length;

        const startNodeCount = [...indegree.values()].filter((v) => v === 0).length;
        const endNodeCount = [...outdegree.values()].filter((v) => v === 0).length;

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

        const effectiveCriticalPath =
            criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id);
        const packageCriticality = this.computePackageCriticality(tasksInHours, effectiveCriticalPath);

        const reliability: 'high' | 'medium' | 'low' =
            forward.hasCycle || backward.hasCycle ? 'low' : missingDependencyRefs > 0 ? 'medium' : 'high';

        return {
            criticalPath:
                criticalPathSequence.length > 0 ? criticalPathSequence : criticalTasks.map((t) => t.id),
            projectDuration: Math.round(projectDuration * 100) / 100,
            tasksByImpact,
            alerts,
            packageCriticality,
            diagnostics: {
                taskCount: tasksInHours.length,
                criticalCount: criticalTasks.length,
                criticalPercent:
                    tasksInHours.length > 0
                        ? Math.round((criticalTasks.length / tasksInHours.length) * 1000) / 10
                        : 0,
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
                avgDependenciesPerTask:
                    tasksInHours.length > 0 ? Math.round((depSum / tasksInHours.length) * 100) / 100 : 0,
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
            const lateFinish = Math.min(
                predecessorBounds.get(id)?.maxLateFinish ?? projectDuration,
                projectDuration,
            );
            const lateStart = Math.min(
                predecessorBounds.get(id)?.maxLateStart ?? projectDuration - t.duration,
                lateFinish - t.duration,
            );
            t.lateFinish = lateFinish;
            t.lateStart = lateStart;
            processed++;

            for (const dep of edgeMap.get(id) || []) {
                const pred = taskMap.get(dep.predecessorId);
                if (!pred) continue;

                let candidateLateFinish = lateStart;
                let candidateLateStart = lateStart;

                if (dep.relationship === DependencyType.START_TO_START) {
                    candidateLateStart = lateStart;
                    candidateLateFinish = lateStart + pred.duration;
                } else if (dep.relationship === DependencyType.FINISH_TO_FINISH) {
                    candidateLateFinish = lateFinish;
                    candidateLateStart = lateFinish - pred.duration;
                }

                const bounds = predecessorBounds.get(dep.predecessorId) || {
                    maxLateFinish: projectDuration,
                    maxLateStart: projectDuration - pred.duration,
                };
                bounds.maxLateFinish = Math.min(bounds.maxLateFinish, candidateLateFinish);
                bounds.maxLateStart = Math.min(bounds.maxLateStart, candidateLateStart);
                predecessorBounds.set(dep.predecessorId, bounds);

                const newDeg = (outdegree.get(dep.predecessorId) || 0) - 1;
                outdegree.set(dep.predecessorId, newDeg);
                if (newDeg === 0) queue.push(dep.predecessorId);
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

    private generateAlerts(
        tasks: TaskNode[],
        criticalTasks: TaskNode[],
        diagnostics: {
            cycleDetected: boolean;
            unprocessedForward: number;
            unprocessedBackward: number;
            missingDependencyRefs: number;
        },
    ): string[] {
        const alerts: string[] = [];
        if (diagnostics.cycleDetected) {
            alerts.push('Ciclo detectado nas dependências do projeto.');
        }
        if (diagnostics.missingDependencyRefs > 0) {
            alerts.push(`Há ${diagnostics.missingDependencyRefs} referências de dependência ausentes.`);
        }
        if (criticalTasks.length === tasks.length && tasks.length > 0) {
            alerts.push('Todas as tarefas estão críticas; o cronograma está sem folga.');
        } else if (criticalTasks.length > 0 && criticalTasks.length < tasks.length) {
            alerts.push('O cronograma possui tarefas com folga; revise o paralelismo e o caminho crítico.');
        }
        return alerts;
    }
}
