/**
 * Projeção de um retângulo HTML sobre um quadrilátero pintado na cena (folha no balcão, placa na parede).
 *
 * `quadMatrix3d(w, h, quad)` devolve o `matrix3d(...)` que leva o retângulo (0,0)-(w,h) de um
 * elemento com `transform-origin: 0 0` aos quatro cantos `quad` (em px do contêiner), na ordem
 * topo-esquerda, topo-direita, base-direita, base-esquerda. É a homografia quadrado→quadrilátero
 * (Heckbert), então a escrita ganha a mesma perspectiva do desenho.
 */
export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];

export function quadMatrix3d(w: number, h: number, quad: Quad): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;

  let g = 0;
  let k = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;

  // quadrado unitário -> px do elemento: divide as colunas de u por w e as de v por h
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((n) => +n.toPrecision(12)).join(',')})`;
}

/** Aplica a homografia a um ponto do elemento (para testes e hit-testing). */
export function projectPoint(w: number, h: number, quad: Quad, px: number, py: number): Point {
  const nums = quadMatrix3d(w, h, quad).slice(9, -1).split(',').map(Number);
  const [m0, m1, , m3, m4, m5, , m7, , , , , m12, m13] = nums as number[];
  const den = m3! * px + m7! * py + 1;
  return [(m0! * px + m4! * py + m12!) / den, (m1! * px + m5! * py + m13!) / den];
}

/** Quadrilátero em frações da imagem -> px de um contêiner w×h. */
export function quadToPx(quad: Quad, w: number, h: number): Quad {
  return quad.map(([u, v]) => [u * w, v * h] as const) as unknown as Quad;
}
