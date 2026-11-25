import { describe, it, expect } from 'vitest';
import {
  unlockedPageIndex,
  creationLockReason,
  CREATION_LOCK_MESSAGES,
} from '~/composables/features/useProjectCreationGate';

const base = { lastIndex: 9 };

describe('bloqueio de páginas na criação de projeto', () => {
  it('projeto já salvo: todas as páginas liberadas', () => {
    expect(unlockedPageIndex({ ...base, isCreating: false, name: '', smartSummary: '' })).toBe(9);
    expect(creationLockReason(5, { ...base, isCreating: false })).toBeNull();
  });

  it('sem nome: só a página Geral está liberada', () => {
    const input = { ...base, isCreating: true, name: '   ', smartSummary: '' };
    expect(unlockedPageIndex(input)).toBe(0);
    // Na página 0 não há como avançar: o motivo é mostrado
    expect(creationLockReason(0, input)).toBe('name');
    expect(CREATION_LOCK_MESSAGES.name).toContain('nome');
  });

  it('nome preenchido e sem resumo SMART: libera a página SMART, bloqueia o restante', () => {
    const input = { ...base, isCreating: true, name: 'MVP', smartSummary: '' };
    expect(unlockedPageIndex(input)).toBe(1);
    expect(creationLockReason(0, input)).toBeNull();
    expect(creationLockReason(1, input)).toBe('smart');
  });

  it('nome e resumo SMART preenchidos: libera até a WBS, e o restante pede para salvar', () => {
    const input = { ...base, isCreating: true, name: 'MVP', smartSummary: 'Entregar até março' };
    expect(unlockedPageIndex(input)).toBe(2);
    expect(creationLockReason(1, input)).toBeNull();
    expect(creationLockReason(2, input)).toBe('save');
    expect(creationLockReason(9, input)).toBeNull();
  });
});
