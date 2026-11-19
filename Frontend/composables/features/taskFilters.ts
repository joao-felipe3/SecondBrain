/**
 * Filtros do Mural de Contratos (projeto, tipo, prioridade), num lugar só.
 *
 * Antes, `layout/Main.vue` e `kanban/KanbanBoard.vue` repetiam a mesma filtragem, e a de prioridade
 * nunca casava: o filtro oferece 'high' | 'medium' | 'low', mas `task.priority` é o número 1..4 do
 * slider do TaskForm (o backend guarda `Number`). Aqui a faixa numérica vira o rótulo do filtro.
 */
export type PriorityFilter = '' | 'high' | 'medium' | 'low';

export interface TaskFilters {
  projectFilter?: string;
  typeFilter?: string;
  priorityFilter?: string;
}

/** 1 = baixa, 2 = média, 3..4 = alta. Sem prioridade conta como baixa (comportamento antigo). */
export function priorityBucket(priority: unknown): Exclude<PriorityFilter, ''> {
  if (typeof priority === 'string' && ['high', 'medium', 'low'].includes(priority)) {
    return priority as Exclude<PriorityFilter, ''>;
  }
  const n = Number(priority);
  if (!Number.isFinite(n) || n <= 1) return 'low';
  if (n < 3) return 'medium';
  return 'high';
}

export function matchesTaskFilters(task: any, filters: TaskFilters): boolean {
  if (filters.projectFilter && String(task?.project ?? '') !== filters.projectFilter) return false;

  if (filters.typeFilter) {
    const taskType = task?.microTaskType || 'task';
    if (taskType !== filters.typeFilter) return false;
  }

  if (filters.priorityFilter && priorityBucket(task?.priority) !== filters.priorityFilter) return false;

  return true;
}
