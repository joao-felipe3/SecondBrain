/**
 * Números do livro-caixa do Mural de Contratos: mesmas regras do antigo `board/StatsCard.vue`
 * (pendente = !isConcluded, cumprida = isConcluded, tempo = pomodorosPlanned x 25 min).
 */
export interface StatsLine {
  count: number;
  minutes: number;
  time: string;
}

export function formatPomodoroTime(minutes: number): string {
  if (!minutes) return '0min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function line(tasks: any[]): StatsLine {
  const minutes = tasks.reduce((sum, task) => sum + (Number(task?.pomodorosPlanned) || 0) * 25, 0);
  return { count: tasks.length, minutes, time: formatPomodoroTime(minutes) };
}

export function summarizeTasks(tasks: any[] = []): { pending: StatsLine; completed: StatsLine } {
  return {
    pending: line(tasks.filter((t) => !t?.isConcluded)),
    completed: line(tasks.filter((t) => t?.isConcluded)),
  };
}
