import { describe, it, expect } from 'vitest';
import {
  pickHold,
  nextFrame,
  transitionPath,
  easedStepDurations,
  stepMs,
  holdPlan,
  buildVignetteViews,
  preloadHallAssetPlan,
  getHallParticleLimits,
  getHallPuppetDpr,
  shouldActivateHallPuppet,
  type HallLifeData,
  type HallLifeFrame,
} from '~/composables/features/useHallLife';

const frames: HallLifeFrame[] = [
  { name: 'a', src: '/a.webp', hold: [3000, 6000] },
  { name: 'b', src: '/b.webp', hold: [1000, 2000] },
  { name: 'c', src: '/c.webp', hold: [500, 500] },
];

describe('useHallLife', () => {
  it('aplica perfis menores no mobile e DPR limitado', () => {
    expect(getHallParticleLimits(true)).toEqual({ embers: 25, dust: 45 });
    expect(getHallParticleLimits(false)).toEqual({ embers: 45, dust: 85 });
    expect(getHallPuppetDpr(3, true)).toBe(1.25);
    expect(getHallPuppetDpr(3, false)).toBe(1.75);
  });

  it('ativa marionetes apenas quando a proximidade intersecta', () => {
    expect(shouldActivateHallPuppet(false)).toBe(false);
    expect(shouldActivateHallPuppet(true)).toBe(true);
  });

  it('sorteia o tempo parado dentro do intervalo do frame', () => {
    expect(pickHold([1000, 2000], () => 0)).toBe(1000);
    expect(pickHold([1000, 2000], () => 1)).toBe(2000);
    expect(pickHold([1000, 2000], () => 0.5)).toBe(1500);
  });

  it("modo 'loop' avança a → b → c e volta ao frame a", () => {
    expect(nextFrame(frames, 0, () => 0, 'loop')).toEqual({ index: 1, holdMs: 1000 });
    expect(nextFrame(frames, 1, () => 0, 'loop')).toEqual({ index: 2, holdMs: 500 });
    expect(nextFrame(frames, 2, () => 0, 'loop')).toEqual({ index: 0, holdMs: 3000 });
  });

  it("modo 'gestures' alterna repouso e gesto sorteado sem repetir o último", () => {
    // do repouso vai para um gesto sorteado
    expect(nextFrame(frames, 0, () => 0, 'gestures').index).toBe(1);
    expect(nextFrame(frames, 0, () => 0.99, 'gestures').index).toBe(2);
    // de qualquer gesto volta ao repouso
    expect(nextFrame(frames, 2, () => 0.5, 'gestures').index).toBe(0);
    // não repete o gesto anterior
    expect(nextFrame(frames, 0, () => 0, 'gestures', 1).index).toBe(2);
  });

  it("modo 'conversation' percorre os gestos em ordem, retornando ao repouso entre eles", () => {
    expect(nextFrame(frames, 0, () => 0.99, 'conversation').index).toBe(1);
    expect(nextFrame(frames, 1, () => 0, 'conversation', 1).index).toBe(0);
    expect(nextFrame(frames, 0, () => 0, 'conversation', 1).index).toBe(2);
    expect(nextFrame(frames, 2, () => 0, 'conversation', 2).index).toBe(0);
    expect(nextFrame(frames, 0, () => 0, 'conversation', 2).index).toBe(1);
  });

  it('toca os intermediários na ida ao gesto e ao contrário na volta ao repouso', () => {
    const withTweens: HallLifeFrame[] = [
      frames[0]!,
      {
        ...frames[1]!,
        tweens: [
          { name: 'b_1', src: '/b_1.webp' },
          { name: 'b_2', src: '/b_2.webp' },
        ],
      },
      frames[2]!,
    ];
    expect(transitionPath(withTweens, 0, 1)).toEqual(['b_1', 'b_2']);
    expect(transitionPath(withTweens, 1, 0)).toEqual(['b_2', 'b_1']);
    // gesto sem intermediários troca direto
    expect(transitionPath(withTweens, 0, 2)).toEqual([]);
    expect(transitionPath(withTweens, 2, 0)).toEqual([]);
    // no loop só há ida (o caminho de volta não é o mesmo movimento)
    expect(transitionPath(withTweens, 1, 0, 'loop')).toEqual([]);
    expect(transitionPath(withTweens, 1, 1)).toEqual([]);
  });

  it('espaça os passos com ease-in-out: pontas mais longas que o meio, mesma duração total', () => {
    const d = easedStepDurations(4, 140);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(560, -1);
    expect(d[0]!).toBeGreaterThan(d[1]!);
    expect(d[3]!).toBeGreaterThan(d[2]!);
    expect(d[0]).toBe(d[3]);
    expect(easedStepDurations(1, 140)).toEqual([140]);
    expect(easedStepDurations(0)).toEqual([]);
  });

  it('cada gesto pode ter seu próprio ritmo (ida e volta), senão o padrão limitado a ~0,8 s', () => {
    const fr: HallLifeFrame[] = [frames[0]!, { ...frames[1]!, tweenMs: 40 }, frames[2]!];
    expect(stepMs({ frames: fr }, 0, 1, 25)).toBe(40);
    expect(stepMs({ frames: fr }, 1, 0, 25)).toBe(40);
    expect(stepMs({ frames: fr }, 0, 2, 4)).toBe(140);
    expect(stepMs({ frames: fr }, 0, 2, 8)).toBe(100);
    expect(stepMs({ frames: fr }, 0, 2, 20)).toBe(80);
    expect(stepMs({ frames: fr, tweenMs: 60 }, 0, 2, 4)).toBe(60);
  });

  it('parado numa pose com ciclo (goles), toca ciclos inteiros que cabem e volta à pose', () => {
    const loop = [1, 2, 3].map((k) => ({ name: `b_loop_${k}`, src: `/b_loop_${k}.webp` }));
    const plan = holdPlan({ name: 'b', loop, loopMs: 100 }, 2000);
    // ciclo = 3 quadros + a pose = 400 ms; espera inicial 300 ms -> 4 ciclos (1600 ms), sobra 100
    expect(plan.leadMs).toBe(300);
    expect(plan.steps).toHaveLength(16);
    expect(plan.steps.slice(0, 4)).toEqual(['b_loop_1', 'b_loop_2', 'b_loop_3', 'b']);
    expect(plan.steps.at(-1)).toBe('b');
    expect(plan.restMs).toBe(100);
    // parada curta: ainda faz um ciclo inteiro
    expect(holdPlan({ name: 'b', loop, loopMs: 100 }, 300).steps).toHaveLength(4);
    // pose sem ciclo: só espera
    expect(holdPlan({ name: 'c' }, 1500)).toEqual({ leadMs: 0, steps: [], stepMs: 70, restMs: 1500 });
  });

  it('NPC marionete: a view traz o arquivo e só o repouso (reserva até carregar)', () => {
    const data: HallLifeData = {
      gloin: {
        order: 1,
        rect: [0, 0, 10, 10],
        frames: [frames[0]!, { ...frames[1]!, tweens: [{ name: 'b_1', src: '/b_1.webp' }] }],
        light: { source: 'torch', gain: 0.08 },
        tooltip: 'Gloin',
        puppet: { src: '/gloin/puppet.json' },
      },
    };
    const [view] = buildVignetteViews(data);
    expect(view!.puppet).toEqual({ src: '/gloin/puppet.json' });
    expect(view!.frames.map((f) => f.name)).toEqual(['a']);
    expect(
      buildVignetteViews({ ...data, gloin: { ...data.gloin!, puppet: undefined } })[0]!.puppet,
    ).toBeNull();
  });

  it('planeja o preload essencial e deixa intermediários para segundo plano', () => {
    const data: HallLifeData = {
      dwarf: {
        order: 1,
        rect: [0, 0, 10, 10],
        frames: [
          frames[0]!,
          {
            ...frames[1]!,
            tweens: [{ name: 'b_1', src: '/b_1.webp' }],
            loop: [{ name: 'b_loop', src: '/b_loop.webp' }],
          },
        ],
        light: { source: 'torch', gain: 0.08 },
        tooltip: null,
        puppet: { src: '/dwarf/puppet.json' },
      },
    };
    const plan = preloadHallAssetPlan(data);
    expect(plan.essential).toContain('/imagens/Entrada-expandida.webp');
    expect(plan.essential).toContain('/a.webp');
    expect(plan.background).toContain('/b_1.webp');
    expect(plan.background).toContain('/b_loop.webp');
  });

  it('views trazem chaves primeiro e intermediários depois (frame A embaixo de tudo)', () => {
    const data: HallLifeData = {
      dwarf: {
        order: 1,
        rect: [0, 0, 10, 10],
        frames: [frames[0]!, { ...frames[1]!, tweens: [{ name: 'b_1', src: '/b_1.webp' }] }],
        light: { source: 'torch', gain: 0.08 },
        tooltip: null,
      },
    };
    expect(buildVignetteViews(data)[0]!.frames.map((f) => f.name)).toEqual(['a', 'b', 'b_1']);
  });

  it('vinheta de um frame só nunca agenda troca', () => {
    expect(nextFrame([frames[0]!], 0).holdMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('posiciona pelo retângulo em pixels da imagem e ordena fundo → frente', () => {
    const data: HallLifeData = {
      front: {
        order: 80,
        rect: [2528, 1696, 505.6, 339.2],
        frames,
        light: { source: 'torch', gain: 0.08 },
        tooltip: 'Olá',
      },
      back: {
        order: 10,
        rect: [0, 0, 5056, 3392],
        frames: [frames[0]!],
        light: { source: 'hearth', gain: 0.14 },
        tooltip: null,
      },
    };
    const views = buildVignetteViews(data);
    expect(views.map((v) => v.id)).toEqual(['back', 'front']);
    expect(views[1]!.style.left).toBe('50%');
    expect(views[1]!.style.width).toBe('10%');
    expect(views[1]!.style.zIndex).toBe('2');
    expect(views[1]!.style['--light-gain']).toBe('0.08');
    expect(views[0]!.lightClass).toBe('light-hearth');
    expect(views[0]!.style.height).toBe('100%');
  });

  it('camada de primeiro plano traz só vinhetas com silhueta, sem tooltip e com a mesma profundidade', () => {
    const data: HallLifeData = {
      cat: {
        order: 45,
        rect: [0, 0, 100, 100],
        frames,
        light: { source: 'hearth', gain: 0.1 },
        tooltip: 'Gato',
      },
      drinkers: {
        order: 40,
        rect: [0, 0, 5056, 3392],
        frames,
        light: { source: 'hearth', gain: 0.14 },
        tooltip: 'Brinde',
        foreground: {
          rect: [2528, 1696, 505.6, 339.2],
          frames: frames.map(({ name }) => ({ name, src: `/${name}.fg.webp` })),
        },
      },
    };
    const base = buildVignetteViews(data, 'base');
    const fg = buildVignetteViews(data, 'foreground');
    expect(fg.map((v) => v.id)).toEqual(['drinkers']);
    expect(fg[0]!.tooltip).toBeNull();
    expect(fg[0]!.frames[1]!.src).toBe('/b.fg.webp');
    expect(fg[0]!.style.left).toBe('50%');
    // mesma ordem/atraso de luz da base, para pulsar junto
    const baseDrinkers = base.find((v) => v.id === 'drinkers')!;
    expect(fg[0]!.style['--light-delay']).toBe(baseDrinkers.style['--light-delay']);
  });

  it('marionete com primeiro plano anima na frente dos efeitos; a base fica só com o repouso', () => {
    const data: HallLifeData = {
      drinkers: {
        order: 40,
        rect: [0, 0, 5056, 3392],
        frames,
        light: { source: 'hearth', gain: 0.14 },
        tooltip: 'Brinde',
        puppet: { src: '/drinkers/puppet.json' },
        foreground: {
          rect: [2528, 1696, 505.6, 339.2],
          frames: frames.map(({ name }) => ({ name, src: `/${name}.fg.webp` })),
        },
      },
    };
    const [base] = buildVignetteViews(data, 'base');
    const [fg] = buildVignetteViews(data, 'foreground');
    expect(base!.puppet).toBeNull();
    expect(base!.frames.map((f) => f.name)).toEqual(['a']);
    expect(base!.tooltip).toBe('Brinde');
    expect(fg!.puppet).toEqual({ src: '/drinkers/puppet.json' });
    expect(fg!.frames).toEqual([]);
    // a marionete usa o retângulo inteiro da vinheta, não o recorte do primeiro plano
    expect(fg!.style.left).toBe('0%');
    expect(fg!.tooltip).toBeNull();
  });
});
