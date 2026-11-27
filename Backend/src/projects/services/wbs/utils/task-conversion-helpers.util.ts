import { Task, DraftToTaskContext, MicroTaskDraft } from '../../../interfaces';

// Convert draft objects into task DTOs ready for database creation
export function convertDraftsToTasks(
  drafts: MicroTaskDraft[],
  context: DraftToTaskContext = {},
): Task[] {
  const ctx = context || {};
  if (!drafts || drafts.length === 0) {
    return [];
  }

  const tasks: Record<string, unknown>[] = [];
  let taskIndex = 1;
  const totalTasks = drafts.length;

  let projectId: string | undefined;
  if (ctx.project?._id != null) {
    projectId = String(ctx.project._id);
  } else if (ctx.project?.id != null) {
    projectId = String(ctx.project.id);
  }
  const parentWbsNodeId = ctx.wbsNode?._id || ctx.wbsNode?.name;

  for (const draft of drafts) {
    const task: Record<string, unknown> = {
      name: String(draft.name || `Tarefa ${taskIndex}`).trim(),
      description: (draft.description || '').trim() || undefined,
      // Canonical fields used by Task schema/DTO
      project: projectId,
      parentWbsNodeId,
      wbsPath: ctx.path,

      // Backward-compatible aliases (some clients used these)
      projectId,
      wbsNodeId: parentWbsNodeId,

      // Task-specific fields from draft
      checklist: Array.isArray(draft.checklist) ? draft.checklist : [],
      definitionOfDone: (draft.definitionOfDone || '').trim() || undefined,
      estimatedMinutes: (draft.pomodorosPlanned || 1) * 25,
      pomodorosPlanned: Math.max(1, Math.min(6, draft.pomodorosPlanned || 1)),
      priority: Math.max(1, Math.min(4, draft.priority || 2)),
      difficult: Math.max(1, Math.min(4, draft.difficult || 2)),

      // Metadata from draft
      microTaskType: draft.microTaskType || 'execute',
      themeTag: (draft.themeTag || '').trim() || undefined,
      contextTag: (draft.contextTag || '').trim() || undefined,
      cognitiveMode: draft.cognitiveMode || 'medium',
      milestoneIndex: draft.milestoneIndex || undefined,

      // Index info
      taskIndexInBatch: taskIndex,
      totalTasksInBatch: totalTasks,
    };

    tasks.push(task);
    taskIndex++;
  }

  return tasks as unknown as Task[];
}
