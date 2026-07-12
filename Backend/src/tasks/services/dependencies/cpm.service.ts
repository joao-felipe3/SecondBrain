import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, mongo } from 'mongoose';
import {
  DependencyType,
  TaskDependency as TaskDependencySchema,
  TaskDependencyDocument,
} from '../../schemas/task-dependency.schema';
import { TaskDependency } from '../../entities/task-dependency.entity';
import { TaskDependencyMapper } from '../../mappers/task-dependency.mapper';
import { TaskNode, CPMAnalysis, TaskMetrics } from '../../interfaces/cpm.interface';
import {
  calculateCriticalPath as calculateCP,
  getTaskMetrics as getTM,
  normalizeRelationship,
} from './utils/cpm-analysis.utils';
import {
  CreateDependencyDto,
  UpsertDependencyDto,
  TaskNodeResponseDto,
  CPMAnalysisResponseDto,
  TaskMetricsResponseDto,
} from '../../dto';

// Re-export interfaces for backwards compatibility
export {
  TaskDependencyEdge,
  TaskNode,
  PackageCriticality,
  CPMAnalysis,
  TaskMetrics,
} from '../../interfaces/cpm.interface';

@Injectable()
export class CPMService {
  private readonly logger = new Logger(CPMService.name);

  constructor(
    @InjectModel(TaskDependencySchema.name)
    private readonly dependencyModel: Model<TaskDependencyDocument>,
  ) {}

  // #region Public Dependency Database CRUD Operations

  async addDependency(dto: CreateDependencyDto): Promise<TaskDependency> {
    const { taskId, dependsOnTaskId, projectId, relationship } = dto;
    try {
      const normalizedRelationship = this.normalizeRelationship(relationship);
      const created = await this.dependencyModel.create({
        ...dto,
        relationship: normalizedRelationship,
      });
      return TaskDependencyMapper.toDomain(created);
    } catch (error: any) {
      this.logger.error(
        `Failed to add dependency between task ${taskId} and ${dependsOnTaskId} for project ${projectId}.`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to add dependency.', {
        cause: error,
      });
    }
  }

  async upsertDependencies(deps: UpsertDependencyDto[]): Promise<number> {
    if (!Array.isArray(deps) || deps.length === 0) return 0;

    const bulkOps = this._createBulkWriteOperations(deps);
    if (bulkOps.length === 0) return 0;

    try {
      const result: mongo.BulkWriteResult = await this.dependencyModel.bulkWrite(bulkOps, {
        ordered: false,
      });
      const upserted = result?.upsertedCount ?? 0;
      const modified = result?.modifiedCount ?? 0;
      return upserted + modified;
    } catch (error) {
      this.logger.error('Failed to bulk upsert dependencies.', error.stack);
      throw new InternalServerErrorException('Failed to upsert dependencies.', { cause: error });
    }
  }

  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    try {
      await this.dependencyModel.deleteOne({ taskId, dependsOnTaskId }).exec();
    } catch (error) {
      this.logger.error(
        `Failed to remove dependency between task ${taskId} and ${dependsOnTaskId}.`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to remove dependency.', {
        cause: error,
      });
    }
  }

  async getDependencies(projectId: string): Promise<TaskDependency[]> {
    try {
      const docs = await this.dependencyModel.find({ projectId }).exec();
      return docs.map(TaskDependencyMapper.toDomain);
    } catch (error) {
      this.logger.error(`Failed to get dependencies for project ${projectId}.`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve dependencies.', { cause: error });
    }
  }

  async removeDependenciesByIds(ids: string[]): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const validIds = ids.filter(Boolean).map(String);
    if (validIds.length === 0) return 0;

    try {
      const result = await this.dependencyModel.deleteMany({ _id: { $in: validIds } }).exec();
      return result?.deletedCount ?? 0;
    } catch (error) {
      this.logger.error(`Failed to remove dependencies by IDs: [${ids.join(', ')}].`, error.stack);
      throw new InternalServerErrorException('Failed to remove dependencies by IDs.', { cause: error });
    }
  }

  normalizeRelationship(input?: string): DependencyType {
    return normalizeRelationship(input);
  }

  calculateCriticalPath(tasks: TaskNodeResponseDto[]): CPMAnalysisResponseDto {
    return calculateCP(tasks);
  }

  getTaskMetrics(task: TaskNodeResponseDto): TaskMetricsResponseDto {
    return getTM(task);
  }

  private _createBulkWriteOperations(deps: UpsertDependencyDto[]) {
    return deps
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
  }
}
