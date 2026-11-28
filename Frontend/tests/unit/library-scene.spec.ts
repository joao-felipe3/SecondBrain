import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  BAY_ARCH,
  LIBRARY_FLAMES,
  bayArchClipPath,
  leatherTone,
  libraryFlameStyle,
} from '~/composables/ui/useLibraryScene';
import LibraryLights from '~/components/features/projects/LibraryLights.vue';
import UiGrimoireBook from '~/components/ui/diegetic/UiGrimoireBook.vue';

describe('sala da biblioteca', () => {
  it('põe uma chama animada sobre cada tocha e vela pintada', () => {
    const wrapper = mount(LibraryLights);
    expect(wrapper.findAll('.flame')).toHaveLength(LIBRARY_FLAMES.length);
    expect(wrapper.findAll('.flame.is-torch')).toHaveLength(2);
    expect(wrapper.findAll('.flame.is-candle')).toHaveLength(2);
    expect(wrapper.find('.window-beams').exists()).toBe(true);
    expect(wrapper.find('.lantern-pool').exists()).toBe(true);
  });

  it('a caixa do sprite fica centrada na chama e com a base sobre a base pintada', () => {
    const torch = LIBRARY_FLAMES[0];
    const style = libraryFlameStyle(torch);
    const left = parseFloat(style.left) / 100;
    const width = parseFloat(style.width) / 100;
    // centro da chama do sprite (≈30,5 de 64 no quadro) cai sobre o centro do copo
    expect((left + width * (30.5 / 64)) * 2560).toBeCloseTo(torch.x, 0);
    // tocha grande o bastante para cobrir as línguas de fogo pintadas (~115 px de altura)
    expect(width * 2560).toBeGreaterThan(75);
    const top = parseFloat(style.top) / 100;
    expect(top * 1440).toBeGreaterThan(torch.top);
    expect(top * 1440).toBeLessThan(torch.base);
  });
});

describe('bayArchClipPath', () => {
  it('recorta a baia no arco: topo no ápice, laterais nas colunas e folga embaixo', () => {
    const clip = bayArchClipPath(16);
    const pts = clip
      .replace(/^polygon\(|\)$/g, '')
      .split(', ')
      .map((p) => p.split(' ').map((v) => parseFloat(v) / 100));
    const ys = pts.map(([, y]) => y);
    const xs = pts.map(([x]) => x);
    expect(Math.min(...ys)).toBeCloseTo(BAY_ARCH.apex, 3);
    expect(Math.max(...ys)).toBeCloseTo(1.4, 3);
    expect(Math.min(...xs)).toBeCloseTo(BAY_ARCH.left, 3);
    expect(Math.max(...xs)).toBeCloseTo(BAY_ARCH.right, 3);
  });
});

describe('leatherTone', () => {
  it('transforma cor neon em couro (mesmo matiz, saturação e brilho limitados)', () => {
    expect(leatherTone('#ff0000')).toBe('hsl(0, 62%, 36%)');
    expect(leatherTone('#f00')).toBe('hsl(0, 62%, 36%)');
    // cor já escura e pouco saturada passa quase igual
    expect(leatherTone('#5a3d1e')).toBe('hsl(31, 50%, 24%)');
    // preto vira couro escuro, não buraco preto
    expect(leatherTone('#000000')).toBe('hsl(0, 0%, 20%)');
  });

  it('mantém formatos que não são hex', () => {
    expect(leatherTone('rebeccapurple')).toBe('rebeccapurple');
    expect(leatherTone(undefined)).toBe('#6b3a1e');
  });
});

describe('UiGrimoireBook (tomo pintado)', () => {
  it('grava a inicial no medalhão e o título na etiqueta', () => {
    const wrapper = mount(UiGrimoireBook, { props: { title: '  aprender Chinês', color: '#7a1f1f' } });
    expect(wrapper.find('.tome-initial').text()).toBe('A');
    expect(wrapper.find('.tome-label-text').text()).toBe('aprender Chinês');
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--book-accent-color')).toBe(
      '#7a1f1f',
    );
  });

  it('reduz a fonte da etiqueta quando uma palavra não cabe na linha', () => {
    const short = mount(UiGrimoireBook, { props: { title: 'Horta em Casa' } });
    const long = mount(UiGrimoireBook, { props: { title: 'Certificação AWS' } });
    // o jsdom descarta a unidade cqh do estilo; lê o tamanho calculado pelo componente
    const size = (w: any) => parseFloat(w.vm.$.setupState.labelFontSize);
    expect(size(short)).toBeCloseTo(7.2, 1);
    expect(size(long)).toBeLessThan(size(short));
  });

  it('mostra o cadeado e avisa no rótulo acessível quando trancado', () => {
    const wrapper = mount(UiGrimoireBook, { props: { title: 'Segredo', isLocked: true, taskCount: 2 } });
    expect(wrapper.find('.tome-lock').exists()).toBe(true);
    expect(wrapper.attributes('aria-label')).toBe('Abrir livro Segredo, 2 missões, trancado');
  });
});
