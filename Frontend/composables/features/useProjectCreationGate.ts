/**
 * Bloqueio de páginas ao criar um projeto.
 * Enquanto o projeto não está salvo, cada página só libera a próxima depois de
 * preenchida: Geral (nome) → SMART (resumo do objetivo). Da página WBS em diante
 * o livro fica bloqueado até salvar, porque essas páginas chamam a API com o id do projeto.
 */

export type CreationLockReason = 'name' | 'smart' | 'save' | null;

export interface CreationGateInput {
  /** true quando o livro está em modo de criação (projeto sem id) */
  isCreating: boolean;
  name?: string | null;
  smartSummary?: string | null;
  /** Índice da última página do livro (ex.: 9) */
  lastIndex: number;
}

/** Índice da página mais distante que pode ser aberta agora. */
export function unlockedPageIndex(input: CreationGateInput): number {
  if (!input.isCreating) return input.lastIndex;
  if (!String(input.name ?? '').trim()) return 0;
  if (!String(input.smartSummary ?? '').trim()) return 1;
  return 2;
}

/** Motivo do bloqueio para mostrar ao usuário, ou null se não há bloqueio. */
export function creationLockReason(current: number, input: CreationGateInput): CreationLockReason {
  const unlocked = unlockedPageIndex(input);
  if (current < unlocked || current >= input.lastIndex) return null;
  if (unlocked === 0) return 'name';
  if (unlocked === 1) return 'smart';
  return 'save';
}

export const CREATION_LOCK_MESSAGES: Record<Exclude<CreationLockReason, null>, string> = {
  name: 'Preencha o nome do projeto para avançar.',
  smart: 'Preencha o resumo do objetivo SMART para avançar.',
  save: 'Salve o projeto para liberar as demais páginas.',
};
