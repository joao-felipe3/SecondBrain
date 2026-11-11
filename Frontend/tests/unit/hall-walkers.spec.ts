import { describe, it, expect } from 'vitest';
import {
  depthScale,
  routePoint,
  edgeOpacity,
  stepWalker,
  walkerStyle,
  type WalkerData,
  type WalkerState,
} from '~/composables/features/useHallWalkers';

const walker: WalkerData = {
  frames: ['/w/a.webp', '/w/b.webp', '/w/c.webp', '/w/d.webp'],
  canvas: [200, 400],
  anchor: [100, 380],
  bodyHeight: 360,
  refFeetV: 0.66,
  route: {
    points: [
      [0.25, 0.66],
      [0.55, 0.66],
    ],
    horizon: 0.54,
    fadeIn: 0.05,
  },
  behaviour: {
    stepLength: 0.36,
    stepMs: 300,
    idleAtEnd: [1000, 1000],
    waitBetween: [2000, 2000],
    returns: true,
    standFrame: 'b',
  },
  tooltip: 'Viajante',
};

type S = WalkerState & { phaseMs: number; frameMs: number };
const base: S = { phase: 'going', t: 0.5, frame: 0, facing: 1, opacity: 1, phaseMs: 0, frameMs: 0 };

describe('useHallWalkers', () => {
  it('escala pela profundidade: mesma linha = 1, mais perto do horizonte = menor', () => {
    expect(depthScale(0.66, 0.66, 0.54)).toBeCloseTo(1);
    expect(depthScale(0.6, 0.66, 0.54)).toBeCloseTo(0.5);
  });

  it('interpola a rota e faz fade só na entrada', () => {
    expect(routePoint(walker.route.points, 0.5)).toEqual([0.4, 0.66]);
    expect(edgeOpacity(0, 0.05)).toBe(0);
    expect(edgeOpacity(0.025, 0.05)).toBeCloseTo(0.5);
    expect(edgeOpacity(0.8, 0.05)).toBe(1);
  });

  it('anda na velocidade do passo (sem patinar) e troca de frame a cada stepMs', () => {
    const after = stepWalker(walker, base, 300);
    // meio passo = 0.36 * 360 / 2 = 64.8 px; rota = 0.30 * 5056 = 1516.8 px
    expect(after.t - base.t).toBeCloseTo(64.8 / 1516.8, 4);
    expect(after.frame).toBe(1);
  });

  it('para no fim da rota no frame parado e depois volta espelhado', () => {
    const atEnd = stepWalker(walker, { ...base, t: 0.999 }, 300);
    expect(atEnd.phase).toBe('idle');
    expect(atEnd.frame).toBe(1); // 'b'
    const back = stepWalker(walker, atEnd, 1001);
    expect(back.phase).toBe('returning');
    expect(back.facing).toBe(-1);
    const gone = stepWalker(walker, { ...back, t: 0.001 }, 300);
    expect(gone.phase).toBe('waiting');
    expect(gone.opacity).toBe(0);
  });

  it('posiciona a tela para os pés caírem exatamente no ponto da rota', () => {
    const style = walkerStyle(walker, { ...base, t: 0 });
    const left = parseFloat(style.left) / 100;
    const width = parseFloat(style.width) / 100;
    // o estilo guarda 4 casas em %: precisão de 1e-6 da imagem (~0,005 px)
    expect(left + (100 / 200) * width).toBeCloseTo(0.25, 5);
    expect(style.transform).toBe('none');
    expect(walkerStyle(walker, { ...base, facing: -1 }).transform).toBe('scaleX(-1)');
  });
});
