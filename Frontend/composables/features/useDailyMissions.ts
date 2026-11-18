import { computed } from 'vue';
import { useTaskStore } from '~/stores/task';
import { useGuildAudio } from '~/composables/ui/useGuildAudio';
import type { Task } from '~/models/Task';

/** Missões do dia do saguão: as 3 tarefas pendentes mais urgentes, marcáveis direto na folha. */
export function useDailyMissions(limit = 3) {
  const taskStore = useTaskStore();
  const { playPaperFlipSound } = useGuildAudio();

  const missions = computed(() =>
    taskStore.tasks
      .filter((t) => t.status === 'todo' || t.status === 'doing' || t.status === 'pending')
      .slice(0, limit),
  );

  const isDone = (task: Task) => task.status === 'done' || task.status === 'completed';
  const missionId = (task: Task) => (task as any)._id || task.id;
  const missionTitle = (task: Task) => task.name || task.title;

  async function toggleMission(task: Task) {
    playPaperFlipSound();
    const id = missionId(task);
    if (id) await taskStore.setTaskStatus?.(id, isDone(task) ? 'todo' : 'done');
  }

  return { missions, isDone, missionId, missionTitle, toggleMission };
}
