import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import {
  TaskLineageNode,
  TaskLineageResult,
  TaskDescendantNode,
} from '../../interfaces/hierarchy.interface';
import { TaskLineageQueryDto, TaskDescendantQueryDto, ValueContributionResponseDto } from '../../dto';

// Re-export interfaces for backwards compatibility
export {
  TaskLineageNode,
  TaskLineageResult,
  TaskDescendantNode,
} from '../../interfaces/hierarchy.interface';

@Injectable()
export class TasksHierarchyService {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

  // ===========================================================================
  // 1. Lineage & Hierarchy Retrieval
  // ===========================================================================

  async getTaskLineage(id: string, query?: TaskLineageQueryDto): Promise<TaskLineageResult> {
    const maxDepth = query?.maxDepth ?? 50;
    this.validateId(id);
    const task = await this.findTaskOrThrow(id);

    const warnings: string[] = [];
    const ancestors: TaskLineageNode[] = [];
    let current = task;
    let depth = 0;

    while (current.parentTaskId && depth < maxDepth) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;

      ancestors.unshift(this.mapToLineageNode(parent));
      current = parent;
      depth++;
    }

    if (depth >= maxDepth) {
      warnings.push(`Ancestor chain depth limit (${maxDepth}) reached`);
    }

    const children = await this.taskModel.find({ parentTaskId: id }).select('_id name status').exec();

    return {
      ancestors,
      children: children.map((c) => this.mapToLineageNode(c)),
      warnings,
    };
  }

  async getDescendants(id: string, query?: TaskDescendantQueryDto): Promise<TaskDescendantNode[]> {
    const maxDepth = query?.maxDepth ?? 1000;
    this.validateId(id);
    await this.findTaskOrThrow(id);

    const descendants: TaskDescendantNode[] = [];
    const stack: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];

    while (stack.length > 0) {
      const { id: currentId, depth } = stack.pop()!;
      if (depth >= maxDepth) continue;

      const children = await this.taskModel
        .find({ parentTaskId: currentId })
        .select('_id name status experience isConcluded')
        .exec();

      for (const child of children) {
        descendants.push(this.mapToDescendantNode(child));
        stack.push({ id: String(child._id), depth: depth + 1 });
      }
    }

    return descendants;
  }

  // ===========================================================================
  // 2. Value Contribution Calculations
  // ===========================================================================

  async calculateValueContribution(id: string): Promise<ValueContributionResponseDto> {
    this.validateId(id);
    const task = await this.findTaskOrThrow(id);

    const rootId = await this.findRootTaskId(task);

    const { completedXP: totalCompletedXP } = await this.getSubtreeNodesAndCompletedXP(rootId);
    const { nodes: subtreeNodes, completedXP: subtreeCompletedXP } =
      await this.getSubtreeNodesAndCompletedXP(id);

    const rawPercent = totalCompletedXP > 0 ? (subtreeCompletedXP / totalCompletedXP) * 100 : 0;
    const contributionPercent = Math.round(rawPercent * 100) / 100;

    return {
      contributionPercent,
      subtreeCompletedXP,
      totalCompletedXP,
      breakdown: subtreeNodes,
    };
  }

  // ===========================================================================
  // 3. Private Helpers & Mappers
  // ===========================================================================

  private validateId(id: string): void {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
  }

  private async findTaskOrThrow(id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  private mapToLineageNode(doc: TaskDocument): TaskLineageNode {
    return {
      _id: doc._id,
      name: doc.name,
      status: doc.status || 'todo',
    };
  }

  private mapToDescendantNode(doc: TaskDocument): TaskDescendantNode {
    return {
      _id: doc._id,
      name: doc.name,
      status: doc.status || 'todo',
      experience: doc.experience || 0,
      isConcluded: doc.isConcluded || false,
    };
  }

  private async findRootTaskId(task: TaskDocument): Promise<string> {
    let current: TaskDocument | null = task;
    while (current && current.parentTaskId) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;
      current = parent;
    }
    return current ? String(current._id) : String(task._id);
  }

  private async getSubtreeNodesAndCompletedXP(targetId: string): Promise<{
    nodes: Array<{ _id: string | Types.ObjectId; experience: number; isConcluded: boolean }>;
    completedXP: number;
  }> {
    const descendants = await this.getDescendants(targetId, { maxDepth: 5000 });
    const targetTask = await this.taskModel
      .findById(targetId)
      .select('_id experience isConcluded')
      .exec();

    const nodes: Array<{
      _id: string | Types.ObjectId;
      experience: number;
      isConcluded: boolean;
    }> = [];

    if (targetTask) {
      nodes.push({
        _id: targetTask._id,
        experience: targetTask.experience || 0,
        isConcluded: targetTask.isConcluded || false,
      });
    }

    for (const d of descendants) {
      nodes.push({
        _id: d._id,
        experience: Number(d.experience) || 0,
        isConcluded: Boolean(d.isConcluded),
      });
    }

    const completedXP = nodes.reduce(
      (sum, node) => sum + (node.isConcluded ? Number(node.experience || 0) : 0),
      0,
    );

    return { nodes, completedXP };
  }
}
