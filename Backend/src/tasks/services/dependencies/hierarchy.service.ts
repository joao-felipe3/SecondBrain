import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import {
  TaskLineageNode,
  TaskLineageResult,
  TaskDescendantNode,
} from '../../interfaces/hierarchy.interface';

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

  async getTaskLineage(id: string, maxDepth: number = 50): Promise<TaskLineageResult> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    const warnings: string[] = [];
    const ancestors: TaskLineageNode[] = [];
    let current = task;
    let depth = 0;

    while (current.parentTaskId && depth < maxDepth) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;

      ancestors.unshift({
        _id: parent._id,
        name: parent.name,
        status: parent.status || 'todo',
      });

      current = parent;
      depth++;
    }

    if (depth >= maxDepth) {
      warnings.push(`Ancestor chain depth limit (${maxDepth}) reached`);
    }

    const children = await this.taskModel.find({ parentTaskId: id }).select('_id name status').exec();

    return {
      ancestors,
      children: children.map((c) => ({
        _id: c._id,
        name: c.name,
        status: c.status || 'todo',
      })),
      warnings,
    };
  }

  async getDescendants(id: string, maxDepth: number = 1000): Promise<TaskDescendantNode[]> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const root = await this.taskModel.findById(id).exec();
    if (!root) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

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
        descendants.push({
          _id: child._id,
          name: child.name,
          status: child.status || 'todo',
          experience: child.experience || 0,
          isConcluded: child.isConcluded || false,
        });
        stack.push({ id: String(child._id), depth: depth + 1 });
      }
    }

    return descendants;
  }

  // ===========================================================================
  // 2. Value Contribution Calculations
  // ===========================================================================

  async calculateValueContribution(id: string): Promise<{
    contributionPercent: number;
    subtreeCompletedXP: number;
    totalCompletedXP: number;
    breakdown: Array<{ _id: string | Types.ObjectId; experience: number; isConcluded: boolean }>;
  }> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    let current: TaskDocument | null = task;
    while (current && current.parentTaskId) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;
      current = parent;
    }
    const rootId = current ? String(current._id) : id;

    const rootDescendants = await this.getDescendants(rootId, 5000);
    const rootTask = await this.taskModel.findById(rootId).select('_id experience isConcluded').exec();

    const allNodes: Array<{
      _id: string | Types.ObjectId;
      experience: number;
      isConcluded: boolean;
    }> = [];
    if (rootTask) {
      allNodes.push({
        _id: rootTask._id,
        experience: rootTask.experience || 0,
        isConcluded: rootTask.isConcluded || false,
      });
    }
    for (const d of rootDescendants) {
      allNodes.push({
        _id: d._id,
        experience: Number(d.experience) || 0,
        isConcluded: Boolean(d.isConcluded),
      });
    }

    const totalCompletedXP = allNodes.reduce(
      (s, n) => s + (n.isConcluded ? Number(n.experience || 0) : 0),
      0,
    );

    const subtreeDescendants = await this.getDescendants(id, 5000);
    const subtreeNodes: Array<{
      _id: string | Types.ObjectId;
      experience: number;
      isConcluded: boolean;
    }> = [];
    const taskSel = await this.taskModel.findById(id).select('_id experience isConcluded').exec();
    if (taskSel) {
      subtreeNodes.push({
        _id: taskSel._id,
        experience: taskSel.experience || 0,
        isConcluded: taskSel.isConcluded || false,
      });
    }
    for (const d of subtreeDescendants) {
      subtreeNodes.push({
        _id: d._id,
        experience: Number(d.experience) || 0,
        isConcluded: Boolean(d.isConcluded),
      });
    }

    const subtreeCompletedXP = subtreeNodes.reduce(
      (s, n) => s + (n.isConcluded ? Number(n.experience || 0) : 0),
      0,
    );

    const rawPercent = totalCompletedXP > 0 ? (subtreeCompletedXP / totalCompletedXP) * 100 : 0;
    const contributionPercent = Math.round(rawPercent * 100) / 100;

    return {
      contributionPercent,
      subtreeCompletedXP,
      totalCompletedXP,
      breakdown: subtreeNodes,
    };
  }
}
