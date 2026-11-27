import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, h, defineComponent } from 'vue';
import {
  GRIMOIRE_CHAPTERS,
  clampChapter,
  grimoireKeyAction,
  hasProjectPlanning,
  useGrimoireBook,
} from '~/composables/features/useGrimoireBook';

// Páginas de planejamento fazem chamadas à API: no teste viram stubs simples.
vi.mock('~/components/features/projects/pages/GeneralInfoPage.vue', () => ({ default: stub('geral') }));
vi.mock('~/components/features/projects/pages/SmartObjectivesPage.vue', () => ({
  default: stub('smart'),
}));
vi.mock('~/components/features/projects/pages/WBSPage.vue', () => ({ default: stub('eap') }));
vi.mock('~/components/features/projects/pages/CriticalPathPage.vue', () => ({
  default: stub('caminho'),
}));
vi.mock('~/components/features/projects/pages/RTMPage.vue', () => ({ default: stub('rtm') }));
vi.mock('~/components/features/projects/pages/RiskPage.vue', () => ({ default: stub('riscos') }));
vi.mock('~/components/features/projects/pages/GanttPage.vue', () => ({ default: stub('gantt') }));
vi.mock('~/components/features/projects/pages/PertDiagramPage.vue', () => ({ default: stub('pert') }));
vi.mock('~/components/features/projects/pages/XMatrixPage.vue', () => ({ default: stub('x-matrix') }));
vi.mock('~/components/features/projects/pages/BacklogAndProgress.vue', () => ({
  default: stub('backlog'),
}));

function stub(label: string) {
  return defineComponent({
    name: `StubPage-${label}`,
    setup: () => () => h('div', { class: 'stub-page' }, label),
  });
}

// Import após os mocks para que o componente use os stubs
const { default: GrimoireBookViewer } =
  await import('~/components/features/projects/GrimoireBookViewer.vue');

const plannedProject = {
  _id: 'p1',
  name: 'Projeto Teste',
  color: '#8b4513',
  smartObjective: { summary: 'Entregar o MVP até março' },
};

const emptyProject = { _id: 'p2', name: 'Projeto Vazio', taskCount: 0 };

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

function mountViewer(props: Record<string, unknown>) {
  wrapper = mount(GrimoireBookViewer, {
    props: { isOpen: true, project: plannedProject, initialChapter: 0, ...props },
    attachTo: document.body,
    global: { stubs: { teleport: true, transition: false } },
  });
  return wrapper;
}

function pressKey(key: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('hasProjectPlanning', () => {
  it('é falso sem projeto', () => {
    expect(hasProjectPlanning(null)).toBe(false);
    expect(hasProjectPlanning(undefined)).toBe(false);
  });

  it('é falso para projeto sem objetivo, metas ou tarefas', () => {
    expect(hasProjectPlanning(emptyProject)).toBe(false);
  });

  it('ignora metas só com espaços', () => {
    expect(hasProjectPlanning({ name: 'x', shortTermGoal: '   ' })).toBe(false);
  });

  it('é verdadeiro com objetivo SMART, meta ou tarefas', () => {
    expect(hasProjectPlanning(plannedProject)).toBe(true);
    expect(hasProjectPlanning({ name: 'x', midTermGoal: 'Lançar beta' })).toBe(true);
    expect(hasProjectPlanning({ name: 'x', taskCount: 3 })).toBe(true);
  });
});

describe('navegação de páginas', () => {
  it('mantém a lista de etapas com ids únicos e 10 páginas', () => {
    const ids = GRIMOIRE_CHAPTERS.map((c) => c.id);
    expect(GRIMOIRE_CHAPTERS).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('segue o fluxo WBS → ondas → micro-tarefas', () => {
    expect(GRIMOIRE_CHAPTERS.map((c) => c.id)).toEqual([
      'geral',
      'smart',
      'eap',
      'rtm',
      'caminho-critico',
      'pert',
      'gantt',
      'riscos',
      'x-matrix',
      'backlog',
    ]);
  });

  it('limita o índice aos limites do livro', () => {
    expect(clampChapter(-3, 10)).toBe(0);
    expect(clampChapter(4, 10)).toBe(4);
    expect(clampChapter(99, 10)).toBe(9);
    expect(clampChapter(Number.NaN, 10)).toBe(0);
    expect(clampChapter(2, 0)).toBe(0);
  });

  it('traduz as teclas de navegação', () => {
    expect(grimoireKeyAction('ArrowLeft')).toBe('prev');
    expect(grimoireKeyAction('ArrowRight')).toBe('next');
    expect(grimoireKeyAction('Escape')).toBe('close');
    expect(grimoireKeyAction('Enter')).toBeNull();
  });

  it('useGrimoireBook avança, volta e para nas extremidades', () => {
    const book = useGrimoireBook(3);
    expect(book.isFirst.value).toBe(true);

    book.prev();
    expect(book.current.value).toBe(0);

    book.next();
    book.next();
    book.next();
    expect(book.current.value).toBe(2);
    expect(book.isLast.value).toBe(true);

    book.goTo(1);
    expect(book.current.value).toBe(1);
  });
});

describe('GrimoireBookViewer', () => {
  it('mostra o estado vazio quando o projeto não tem planejamento', async () => {
    mountViewer({ project: emptyProject });
    await nextTick();

    expect(document.body.textContent).toContain('Este tomo ainda está em branco');
    expect(document.querySelector('.chapter-ribbons')).toBeNull();
  });

  it('mostra uma fita por etapa e a página atual no rodapé', async () => {
    mountViewer({});
    await nextTick();

    expect(document.querySelectorAll('.chapter-ribbon')).toHaveLength(10);
    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 1 de 10');
  });

  it('troca de página com as setas do teclado', async () => {
    mountViewer({});
    await nextTick();

    pressKey('ArrowRight');
    await nextTick();
    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 2 de 10');

    pressKey('ArrowLeft');
    pressKey('ArrowLeft');
    await nextTick();
    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 1 de 10');
  });

  it('não troca de página enquanto o usuário digita em um campo', async () => {
    mountViewer({});
    await nextTick();

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressKey('ArrowRight', input);
    await nextTick();

    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 1 de 10');
  });

  it('leva à etapa certa ao clicar na fita', async () => {
    mountViewer({});
    await nextTick();

    const ribbons = document.querySelectorAll<HTMLButtonElement>('.chapter-ribbon');
    ribbons[3].click();
    await nextTick();

    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 4 de 10');
    // Busca de novo: a fita pode ter sido recriada no re-render
    expect(document.querySelectorAll('.chapter-ribbon')[3].getAttribute('aria-current')).toBe('page');
  });

  it('fecha com Esc e emite close', async () => {
    const w = mountViewer({});
    await nextTick();

    pressKey('Escape');
    await nextTick();

    expect(w.emitted('close')).toHaveLength(1);
  });

  it('emite open-editor com a etapa atual ao pedir edição', async () => {
    const w = mountViewer({});
    await nextTick();

    pressKey('ArrowRight');
    await nextTick();
    const edit = Array.from(document.querySelectorAll<HTMLButtonElement>('.action-btn')).find((b) =>
      b.textContent?.includes('Editar'),
    );
    edit?.click();

    expect(w.emitted('open-editor')?.[0]).toEqual([1]);
  });

  it('começa na etapa informada', async () => {
    mountViewer({ initialChapter: 5 });
    await nextTick();

    expect(document.querySelector('.page-indicator')?.textContent).toContain('Etapa 6 de 10');
  });
});
