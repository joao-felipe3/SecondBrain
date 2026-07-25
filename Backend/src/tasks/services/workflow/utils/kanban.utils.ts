import { Model } from 'mongoose';
import { TaskDocument } from '../../../schemas/task.schema';
import { MoveTaskStatusDto } from '../../../dto/task/move-task-status.dto';

// ===========================================================================
// Pure Ordering Calculations
// ===========================================================================

export function interpolateOrderAtIndex(existingOrders: number[], targetIndex: number): number {
  const idx = Math.max(0, Math.floor(targetIndex));
  const len = existingOrders.length;

  if (len === 0) return 1;
  if (idx <= 0) return (existingOrders[0] || 0) - 1;
  if (idx >= len) return (existingOrders[len - 1] || 0) + 1;

  const prev = existingOrders[idx - 1] || 0;
  const next = existingOrders[idx] || prev + 2;
  return (prev + next) / 2;
}

export function calculateNextMaxOrder(maxOrder?: number | null): number {
  return (maxOrder || 0) + 1;
}

// ===========================================================================
// Database-coupled Orchestrators
// ===========================================================================

export async function resolveTargetOrder(
  taskModel: Model<TaskDocument>,
  projectId: string | undefined,
  status: MoveTaskStatusDto['status'],
  move: MoveTaskStatusDto,
): Promise<number> {
  if (typeof move.toOrder === 'number' && Number.isFinite(move.toOrder)) {
    return move.toOrder;
  }

  if (typeof move.toIndex === 'number' && projectId) {
    const destinationTasks = await taskModel
      .find({ project: String(projectId), status: String(status) })
      .sort({ kanbanOrder: 1 })
      .select('kanbanOrder')
      .exec();

    const existingOrders = destinationTasks.map((t) => t.kanbanOrder || 0);
    return interpolateOrderAtIndex(existingOrders, move.toIndex);
  }

  const maxOrderDoc = await taskModel
    .findOne({ project: String(projectId), status: String(status) })
    .sort({ kanbanOrder: -1 })
    .select('kanbanOrder')
    .exec();

  return calculateNextMaxOrder(maxOrderDoc?.kanbanOrder);
}
