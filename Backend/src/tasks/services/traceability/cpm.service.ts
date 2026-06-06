import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DependencyType,
  TaskDependency,
  TaskDependencyDocument,
} from '../../schemas/task-dependency.schema';
import { TaskNode, CPMAnalysis, TaskMetrics } from '../../interfaces/cpm.interface';
import { calculateCriticalPath as calculateCP, getTaskMetrics as getTM, normalizeRelationship } from './cpm.utils';

// Re-export interfaces for backwards compatibility
export { TaskDependencyEdge, TaskNode, PackageCriticality, CPMAnalysis, TaskMetrics } from '../../interfaces/cpm.interface';

@Injectable()
export class CPMService {
  private readonly logger = new Logger(CPMService.name);

  constructor(
    @InjectModel(TaskDependency.name)
    private readonly dependencyModel: Model<TaskDependencyDocument>,
  ) {}

  // ===========================================================================
  // 1. Dependency Database CRUD Operations
  // ===========================================================================

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
    const result = await this.dependencyModel.bulkWrite(ops, {
      ordered: false,
    });
    const upserted = Number(result?.upsertedCount || 0);
    const modified = Number(result?.modifiedCount || 0);
    return upserted + modified;
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
    const res = await this.dependencyModel.deleteMany({ _id: { $in: list } }).exec();
    return Number(res?.deletedCount || 0);
  }

  normalizeRelationship(input?: string): DependencyType {
    return normalizeRelationship(input);
  }

  // ===========================================================================
  // 2. CPM & Critical Path Calculations
  // ===========================================================================

  calculateCriticalPath(tasks: TaskNode[]): CPMAnalysis {
    return calculateCP(tasks);
  }

  getTaskMetrics(task: TaskNode): TaskMetrics {
    return getTM(task);
  }
}
