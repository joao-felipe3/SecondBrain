/**
 * Acentos diegéticos de cada folha do Mural de Contratos, por coluna:
 * - Contratos Abertos (todo): selo de cera vermelho;
 * - Em Andamento (doing): selo azul + ampulheta quando a tarefa tem pomodoros planejados;
 * - Missões Cumpridas (done): selo verde, medalha e carimbo "CUMPRIDO".
 * Tarefas atrasadas (e não concluídas) são presas por uma adaga em vez do prego comum.
 *
 * Não existe estado de "Pomodoro rodando" no front: a ampulheta fica "ativa" enquanto a tarefa está
 * em andamento e ainda faltam pomodoros (`pomodorosDid < pomodorosPlanned`).
 */
export type AccentColumn = 'todo' | 'doing' | 'done';

export interface CardAccents {
  seal: 'red' | 'blue' | 'green';
  pin: 'dagger' | 'nail';
  hourglass: null | { progress: number; active: boolean };
  medal: boolean;
  stamp: boolean;
}

const SEAL_BY_COLUMN: Record<AccentColumn, CardAccents['seal']> = {
  todo: 'red',
  doing: 'blue',
  done: 'green',
};

export function isTaskLate(task: any, now: Date = new Date()): boolean {
  if (!task || task.isConcluded || task.status === 'done') return false;
  if (task.late === true) return true;
  if (!task.deadline) return false;
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return deadline.getTime() < startOfToday.getTime();
}

export function getCardAccents(task: any, column: AccentColumn, now: Date = new Date()): CardAccents {
  const done = column === 'done';
  const planned = Number(task?.pomodorosPlanned) || 0;
  const did = Math.max(0, Number(task?.pomodorosDid) || 0);

  return {
    seal: SEAL_BY_COLUMN[column],
    pin: !done && isTaskLate(task, now) ? 'dagger' : 'nail',
    hourglass:
      column === 'doing' && planned > 0
        ? { progress: Math.round(Math.min(1, did / planned) * 100), active: did < planned }
        : null,
    medal: done,
    stamp: done,
  };
}
