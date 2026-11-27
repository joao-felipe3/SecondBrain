import { computed, ref } from 'vue';
import type { Project } from '~/models/Project';

export interface GrimoireChapter {
  id: string;
  title: string;
  icon: string;
}

/**
 * Etapas do planejamento exibidas como páginas do livro.
 * A ordem espelha os slides do BookModal (índice = focusedSlide), para que
 * a fita "Editar" abra o modal exatamente na mesma etapa.
 */
export const GRIMOIRE_CHAPTERS: readonly GrimoireChapter[] = [
  // Planejamento: objetivo → pacotes (WBS) → ondas (Rolling Wave)
  { id: 'geral', title: 'Visão Geral', icon: '📜' },
  { id: 'smart', title: 'Objetivo SMART', icon: '🎯' },
  { id: 'eap', title: 'EAP (WBS)', icon: '🌳' },
  { id: 'rtm', title: 'Ondas & Rastreabilidade', icon: '🌊' },
  // Execução: análises que dependem das micro-tarefas detalhadas por onda
  { id: 'caminho-critico', title: 'Caminho Crítico', icon: '🛤️' },
  { id: 'pert', title: 'Diagrama PERT', icon: '🕸️' },
  { id: 'gantt', title: 'Cronograma (Gantt)', icon: '📅' },
  { id: 'riscos', title: 'Riscos', icon: '⚠️' },
  // Alinhamento e acompanhamento
  { id: 'x-matrix', title: 'X-Matrix', icon: '✖️' },
  { id: 'backlog', title: 'Backlog & Progresso', icon: '📈' },
];

const SMART_TEXT_FIELDS = [
  'summary',
  'specific',
  'measurable',
  'achievable',
  'relevant',
  'temporal',
] as const;

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Um projeto tem planejamento quando já possui objetivo SMART, metas
 * preenchidas ou tarefas. Sem nenhum desses, o livro mostra o estado vazio.
 */
export function hasProjectPlanning(project: Project | null | undefined): boolean {
  if (!project) return false;

  const smart = project.smartObjective;
  const smartFilled = Boolean(
    smart &&
    (SMART_TEXT_FIELDS.some((field) => hasText(smart[field])) ||
      (Array.isArray(smart.risks) && smart.risks.length > 0) ||
      Number(smart.weeklyHours) > 0),
  );

  const goalsFilled = [project.shortTermGoal, project.midTermGoal, project.longTermGoal].some(hasText);
  const hasTasks = (project.taskCount ?? 0) > 0;

  return smartFilled || goalsFilled || hasTasks;
}

/** Limita um índice ao intervalo válido de páginas. */
export function clampChapter(index: number, total: number): number {
  if (total <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

export type GrimoireKeyAction = 'prev' | 'next' | 'close';

/** Traduz a tecla pressionada na ação do livro (← → trocam de página, Esc fecha). */
export function grimoireKeyAction(key: string): GrimoireKeyAction | null {
  if (key === 'ArrowLeft') return 'prev';
  if (key === 'ArrowRight') return 'next';
  if (key === 'Escape') return 'close';
  return null;
}

/** Estado de página do livro, com limites seguros nas extremidades. */
export function useGrimoireBook(total: number = GRIMOIRE_CHAPTERS.length) {
  const current = ref(0);
  const isFirst = computed(() => current.value <= 0);
  const isLast = computed(() => current.value >= total - 1);

  function goTo(index: number) {
    current.value = clampChapter(index, total);
  }

  function next() {
    goTo(current.value + 1);
  }

  function prev() {
    goTo(current.value - 1);
  }

  return { current, isFirst, isLast, goTo, next, prev };
}
