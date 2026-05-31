import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';

export interface TaskLineageNode {
  _id: string | Types.ObjectId;
  name: string;
  status: string;
}

export interface TaskLineageResult {
  ancestors: TaskLineageNode[];
  children: TaskLineageNode[];
  warnings: string[];
}

export interface TaskDescendantNode {
  _id: string | Types.ObjectId;
  name: string;
  status: string;
  experience: number;
  isConcluded: boolean;
}

@Injectable()
export class TasksHierarchyService {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

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
          experience: Number((child as any).experience) || 0,
          isConcluded: Boolean((child as any).isConcluded),
        });
        stack.push({ id: String(child._id), depth: depth + 1 });
      }
    }

    return descendants;
  }

  async calculateValueContribution(id: string): Promise<{
    contributionPercent: number;
    subtreeCompletedXP: number;
    totalCompletedXP: number;
    breakdown: Array<{ _id: any; experience: number; isConcluded: boolean }>;
  }> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    let current: any = task;
    while (current.parentTaskId) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;
      current = parent;
    }
    const rootId = String(current._id ?? id);

    const rootDescendants = await this.getDescendants(rootId, 5000);
    const rootTask = await this.taskModel.findById(rootId).select('_id experience isConcluded').exec();

    const allNodes = [] as Array<{
      _id: any;
      experience: number;
      isConcluded: boolean;
    }>;
    if (rootTask) {
      allNodes.push({
        _id: rootTask._id,
        experience: Number((rootTask as any).experience) || 0,
        isConcluded: Boolean((rootTask as any).isConcluded),
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
    const subtreeNodes = [] as Array<{
      _id: any;
      experience: number;
      isConcluded: boolean;
    }>;
    const taskSel = await this.taskModel.findById(id).select('_id experience isConcluded').exec();
    if (taskSel) {
      subtreeNodes.push({
        _id: taskSel._id,
        experience: Number((taskSel as any).experience) || 0,
        isConcluded: Boolean((taskSel as any).isConcluded),
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

    const contributionPercent = totalCompletedXP > 0 ? (subtreeCompletedXP / totalCompletedXP) * 100 : 0;

    return {
      contributionPercent: Math.round(contributionPercent * 100) / 100,
      subtreeCompletedXP,
      totalCompletedXP,
      breakdown: subtreeNodes,
    };
  }
}
