import { describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import {
  buildSliceHoursPayload,
  canDetailWave,
  horizonWaveIds,
  nextWaveToDetail,
  waveProgress,
} from '~/composables/features/useWaveHorizon';
import ProjectWavesTimeline from '~/components/features/projects/sections/ProjectWavesTimeline.vue';

const slice = (over: any = {}) => ({
  _id: `s-${Math.random()}`,
  wbsNodeId: 'anki',
  wbsPath: 'Chinês > Anki',
  packageName: 'Anki básico',
  sliceIndex: 1,
  sliceCount: 2,
  goal: 'Decks dos capítulos 1 a 3',
  hours: 20,
  status: 'planned',
  taskIds: [],
  ...over,
});
const wave = (id: string, status: any, over: any = {}) => ({
  _id: id,
  projectId: 'p1',
  waveNumber: Number(id.replace('w', '')),
  startDate: '2026-12-01',
  endDate: '2026-12-29',
  status,
  taskIds: [],
  slices: [slice()],
  createdAt: '',
  ...over,
});

describe('useWaveHorizon', () => {
  it('horizonte: onda ativa + seguinte; sem ativa, primeira não concluída', () => {
    const waves = [
      wave('w1', 'completed'),
      wave('w2', 'planned'),
      wave('w3', 'planned'),
      wave('w4', 'planned'),
    ];
    expect(horizonWaveIds(waves)).toEqual(['w2', 'w3']);
    waves[2].status = 'active';
    expect(horizonWaveIds(waves)).toEqual(['w3', 'w4']);
    expect(horizonWaveIds([wave('w1', 'completed')])).toEqual([]);
  });

  it('só detalha onda no horizonte com fatias pendentes', () => {
    const waves = [
      wave('w1', 'active', { slices: [slice({ status: 'detailed' })] }),
      wave('w2', 'planned'),
      wave('w3', 'planned'),
    ];
    expect(canDetailWave(waves[0], waves)).toBe(false); // nada pendente
    expect(canDetailWave(waves[1], waves)).toBe(true);
    expect(canDetailWave(waves[2], waves)).toBe(false); // fora do horizonte
  });

  it('sugere a próxima onda quando a atual passa de 70% (por horas)', () => {
    const waves = [wave('w1', 'active', { taskIds: ['t1', 't2'] }), wave('w2', 'planned')];
    const tasks = [
      { _id: 't1', pomodorosPlanned: 6, isConcluded: true }, // 3h
      { _id: 't2', pomodorosPlanned: 2, isConcluded: false }, // 1h
    ];
    expect(waveProgress(waves[0], tasks)).toBe(0.75);
    expect(nextWaveToDetail(waves, tasks)?._id).toBe('w2');
    tasks[0].isConcluded = false;
    expect(nextWaveToDetail(waves, tasks)).toBeNull();
  });

  it('payload do commit: só re-baselines de fatias, o último vale', () => {
    expect(
      buildSliceHoursPayload([
        { sliceId: 's1', newEstimatedHours: 20 },
        { newEstimatedHours: 5 },
        { sliceId: 's1', newEstimatedHours: 24 },
      ]),
    ).toEqual([{ sliceId: 's1', hours: 24 }]);
  });
});

describe('ProjectWavesTimeline', () => {
  const stubs = {
    'v-tooltip': { template: '<div><slot name="activator" :props="{}" /></div>' },
    'v-list-item': {
      props: ['title', 'subtitle'],
      template: '<div class="slice-item">{{ title }}|{{ subtitle }}<slot name="append" /></div>',
    },
    'v-btn': { template: '<button class="v-btn"><slot /></button>' },
    InteractiveConversionDialog: true,
  };

  const mountWith = async (waves: any[]) => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.endsWith('/waves') ? waves : []));
    vi.stubGlobal('$fetch', fetchMock);
    const wrapper = mount(ProjectWavesTimeline, { props: { projectId: 'p1' }, global: { stubs } });
    await flushPromises();
    return wrapper;
  };

  it('mostra as horas planejadas da onda e, no detalhe, as fatias com objetivo e o botão Detalhar', async () => {
    const wrapper = await mountWith([
      wave('w1', 'active', { slices: [slice(), slice({ sliceIndex: 2, goal: 'Decks 4 a 6' })] }),
      wave('w2', 'planned'),
      wave('w3', 'planned'),
    ]);

    expect(wrapper.findAll('.wave-tasks-count')[0].text()).toBe('40h');

    await wrapper.findAll('.wave-item')[0].trigger('click');
    const items = wrapper.findAll('.slice-item');
    expect(items).toHaveLength(2);
    expect(items[1].text()).toContain('Anki básico (2/2)|Decks 4 a 6');
    expect(wrapper.text()).toContain('Detalhar Onda (2)');
  });

  it('diferencia pela cor as ondas com tarefas planejadas das ondas sem tarefas', async () => {
    const wrapper = await mountWith([
      wave('w1', 'active', { taskIds: ['t1'] }),
      wave('w2', 'planned'),
    ]);

    expect(wrapper.findAll('.wave-has-tasks')).toHaveLength(1);
    expect(wrapper.findAll('.wave-no-tasks')).toHaveLength(1);
    expect(wrapper.find('.wave-task-chip').exists()).toBe(false);
  });

  it('mantém visíveis os labels da linha ativa, incluindo a terceira onda', async () => {
    const wrapper = await mountWith([
      wave('w1', 'completed'),
      wave('w2', 'active'),
      wave('w3', 'planned'),
      wave('w4', 'planned'),
      wave('w5', 'planned'),
    ]);
    const waveItems = wrapper.findAll('.wave-item');

    expect(waveItems[0].classes()).toContain('wave-compact');
    expect(waveItems[1].classes()).not.toContain('wave-compact');
    expect(waveItems[2].classes()).not.toContain('wave-compact');
    expect(waveItems[3].classes()).toContain('wave-compact');
    expect(waveItems[4].classes()).toContain('wave-compact');
    expect(waveItems[0].find('.wave-subtitle').exists()).toBe(false);
    expect(waveItems[0].find('.wave-footer').exists()).toBe(false);
    expect(waveItems[1].find('.wave-subtitle').exists()).toBe(true);
    expect(waveItems[1].find('.wave-footer').exists()).toBe(true);
    expect(waveItems[2].find('.wave-subtitle').exists()).toBe(true);
    expect(waveItems[2].find('.wave-footer').exists()).toBe(true);
    expect(waveItems[3].find('.wave-subtitle').exists()).toBe(false);
    expect(waveItems[3].find('.wave-footer').exists()).toBe(false);
    expect(waveItems[3].find('.wave-connector-wave path').attributes('d')).toContain('C');
    expect(waveItems[4].find('.wave-subtitle').exists()).toBe(false);
    expect(waveItems[4].find('.wave-footer').exists()).toBe(false);
  });

  it('agrupa até cinco ondas em cada linha compacta', async () => {
    const wrapper = await mountWith(
      Array.from({ length: 10 }, (_, index) =>
        wave(`w${index + 1}`, index === 0 ? 'active' : 'planned'),
      ),
    );
    const compactRows = wrapper.findAll('.timeline-row--compact');

    expect(wrapper.find('.timeline-row--active').findAll('.wave-item')).toHaveLength(3);
    expect(compactRows.map((row) => row.findAll('.wave-item').length)).toEqual([5, 2]);
  });

  it('onda fora do horizonte não tem botão de detalhar e explica quando será detalhada', async () => {
    const wrapper = await mountWith([
      wave('w1', 'active'),
      wave('w2', 'planned'),
      wave('w3', 'planned'),
    ]);
    await wrapper.findAll('.wave-item')[2].trigger('click');
    expect(wrapper.text()).not.toContain('Detalhar Onda');
    expect(wrapper.text()).toContain('quando estiver no horizonte');
  });

  it('planejamento bloqueado mostra o motivo e não chama a API', async () => {
    const wrapper = await mountWith([]);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await wrapper.setProps({ planDisabledReason: 'Corrija a WBS' });
    await (wrapper.vm as any).$.setupState.generateWaves();
    expect(alertSpy).toHaveBeenCalledWith('Corrija a WBS');
    expect(($fetch as any).mock.calls.some((c: any[]) => String(c[0]).includes('generate-waves'))).toBe(
      false,
    );
  });

  it('salva a WBS (beforePlan) antes de planejar as ondas', async () => {
    const wrapper = await mountWith([]);
    const order: string[] = [];
    const beforePlan = vi.fn(async () => {
      order.push('save');
      return true;
    });
    ($fetch as any).mockImplementation((url: string) => {
      if (url.includes('generate-waves')) order.push('plan');
      return Promise.resolve([]);
    });
    await wrapper.setProps({ beforePlan });
    await (wrapper.vm as any).$.setupState.generateWaves();
    expect(order).toEqual(['save', 'plan']);
  });
});
