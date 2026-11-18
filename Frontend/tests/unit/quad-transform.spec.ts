import { describe, it, expect } from 'vitest';
import { projectPoint, quadMatrix3d, quadToPx, type Quad } from '~/composables/ui/useQuadTransform';

const close = (p: readonly number[], q: readonly number[]) => {
  expect(p[0]).toBeCloseTo(q[0]!, 4);
  expect(p[1]).toBeCloseTo(q[1]!, 4);
};

describe('useQuadTransform', () => {
  it('leva os cantos do elemento exatamente aos cantos da folha (perspectiva)', () => {
    const quad: Quad = [
      [10, 48],
      [260, 15],
      [440, 150],
      [160, 212],
    ];
    close(projectPoint(250, 210, quad, 0, 0), quad[0]);
    close(projectPoint(250, 210, quad, 250, 0), quad[1]);
    close(projectPoint(250, 210, quad, 250, 210), quad[2]);
    close(projectPoint(250, 210, quad, 0, 210), quad[3]);
  });

  it('quadrilátero paralelogramo vira transformação afim (sem termos de perspectiva)', () => {
    const m = quadMatrix3d(100, 50, [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]);
    expect(m).toBe('matrix3d(2,0,0,0,0,2,0,0,0,0,1,0,0,0,0,1)');
  });

  it('converte frações da imagem para px do contêiner', () => {
    expect(
      quadToPx(
        [
          [0.5, 0.25],
          [1, 0.25],
          [1, 1],
          [0.5, 1],
        ],
        200,
        100,
      ),
    ).toEqual([
      [100, 25],
      [200, 25],
      [200, 100],
      [100, 100],
    ]);
  });
});
