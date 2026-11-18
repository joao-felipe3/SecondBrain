import { describe, it, expect } from 'vitest';
import { clampPan, rubberBand, stepInertia } from '~/composables/ui/useHallPan';

describe('useHallPan', () => {
  it('prende a câmera aos limites', () => {
    expect(clampPan(-10, 0, 100)).toBe(0);
    expect(clampPan(50, 0, 100)).toBe(50);
    expect(clampPan(140, 0, 100)).toBe(100);
  });

  it('elástico nas bordas: só uma fração do excesso passa', () => {
    expect(rubberBand(50, 0, 100)).toBe(50);
    expect(rubberBand(-100, 0, 100)).toBeCloseTo(-35);
    expect(rubberBand(200, 0, 100)).toBeCloseTo(135);
  });

  it('inércia desacelera até parar dentro dos limites', () => {
    let s = { pan: 50, v: 1, done: false };
    let steps = 0;
    while (!s.done && steps < 2000) {
      s = stepInertia(s, 16, 0, 1000);
      steps++;
    }
    expect(s.done).toBe(true);
    expect(s.pan).toBeGreaterThan(200); // andou bastante com o impulso
    expect(s.pan).toBeLessThanOrEqual(1000);
  });

  it('quem passa da borda volta para dentro e para exatamente no limite', () => {
    let s = { pan: 980, v: 2, done: false };
    let maxPan = 0;
    for (let i = 0; i < 2000 && !s.done; i++) {
      s = stepInertia(s, 16, 0, 1000);
      maxPan = Math.max(maxPan, s.pan);
    }
    expect(maxPan).toBeGreaterThan(1000); // passou um pouco (elástico)
    expect(s.done).toBe(true);
    expect(s.pan).toBe(1000);
  });
});
