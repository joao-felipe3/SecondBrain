import { Model } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { MoveTaskStatusDto } from '../../dto/move-task-status.dto';

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
      .find({ project: projectId, status })
      .sort({ kanbanOrder: 1 })
      .select('kanbanOrder')
      .exec();

    const idx = Math.max(0, Math.floor(move.toIndex));
    const len = destinationTasks.length;

    if (len === 0) return 1;
    if (idx <= 0) return (destinationTasks[0].kanbanOrder || 0) - 1;
    if (idx >= len) return (destinationTasks[len - 1].kanbanOrder || 0) + 1;

    const prev = destinationTasks[idx - 1].kanbanOrder || 0;
    const next = destinationTasks[idx].kanbanOrder || prev + 2;
    return (prev + next) / 2;
  }

  const maxOrder = await taskModel
    .findOne({ project: projectId, status })
    .sort({ kanbanOrder: -1 })
    .select('kanbanOrder')
    .exec();
  return (maxOrder?.kanbanOrder || 0) + 1;
}
