import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock('#app', () => ({ useNuxtApp: () => ({ $api: api }) }));

import InteractiveConversionDialog from '~/components/features/projects/dialogs/InteractiveConversionDialog.vue';

const item = (sliceId: string, hours: number) => ({
  sliceId,
  sliceIndex: 1,
  sliceCount: 2,
  goal: 'Decks dos capítulos 1 a 3',
  path: 'Chinês > Anki',
  level: 2,
  node: { _id: 'anki', name: 'Anki básico', estimatedHours: hours, level: 2 },
});

describe('InteractiveConversionDialog (detalhar onda)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('carrega as fatias da onda e gera a primeira pelo endpoint da fatia, pré-carregando a próxima', async () => {
    api.get.mockResolvedValue({ data: { items: [item('s1', 10), item('s2', 8)] } });
    api.post.mockResolvedValue({
      data: { tasks: [{ name: 'T1', pomodorosPlanned: 2 }], generatedHours: 1 },
    });

    const wrapper = mount(InteractiveConversionDialog, {
      props: { modelValue: false, project: { _id: 'p1' }, wave: { _id: 'w1', waveNumber: 1 } },
      global: { stubs: { 'v-dialog': { template: '<div><slot /></div>' }, WBSTreeVisualization: true } },
    });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/projects/p1/waves/w1/detail-items');
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/projects/p1/waves/w1/slices/s1/generate-tasks');
    expect(body.prefetchSliceIds).toEqual(['s2']);
    expect(wrapper.text()).toContain('Detalhar Onda 1');
  });

  it('onda sem fatias pendentes avisa e não gera nada', async () => {
    api.get.mockResolvedValue({ data: { items: [] } });
    const wrapper = mount(InteractiveConversionDialog, {
      props: { modelValue: false, project: { _id: 'p1' }, wave: { _id: 'w1', waveNumber: 1 } },
      global: { stubs: { 'v-dialog': { template: '<div><slot /></div>' }, WBSTreeVisualization: true } },
    });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    expect(window.alert).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('onda com um item só: "Salvar Todas" salva as tarefas em revisão e fecha o detalhamento', async () => {
    api.get.mockResolvedValue({ data: { items: [item('s1', 10)] } });
    api.post.mockImplementation((url: string) => {
      if (url.endsWith('/generate-tasks')) {
        return Promise.resolve({
          data: {
            tasks: [{ name: 'T1', pomodorosPlanned: 2, waveId: 'w1', waveSliceId: 's1' }],
            generatedHours: 1,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const wrapper = mount(InteractiveConversionDialog, {
      props: { modelValue: false, project: { _id: 'p1' }, wave: { _id: 'w1', waveNumber: 1 } },
      global: { stubs: { 'v-dialog': { template: '<div><slot /></div>' }, WBSTreeVisualization: true } },
    });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    expect(wrapper.text()).toContain('Salvar Todas (1 tasks)');
    await (wrapper.vm as any).$.setupState.handleSaveAll();
    await flushPromises();

    const urls = api.post.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/tasks/bulk');
    expect(urls).toContain('/projects/p1/waves/w1/commit-tasks');
    const bulk = api.post.mock.calls.find((c) => c[0] === '/tasks/bulk')[1];
    expect(bulk.tasks).toHaveLength(1);
    expect(bulk.tasks[0]).toMatchObject({ waveId: 'w1', waveSliceId: 's1', project: 'p1' });
  });
});
