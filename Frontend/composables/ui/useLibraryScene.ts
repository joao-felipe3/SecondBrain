// Geometria da sala da biblioteca (/projects). O palco tem exatamente a proporção da arte
// `Projects-expandido.webp` (2560×1440, object-fit: fill), então frações da imagem = frações do palco.

export const LIBRARY_IMAGE = { w: 2560, h: 1440 } as const;

export interface LibraryFlame {
  kind: 'torch' | 'candle';
  /** centro horizontal da chama pintada, em px da imagem */
  x: number;
  /** topo e base da chama pintada, em px da imagem */
  top: number;
  base: number;
}

/** Tochas e velas pintadas na arte, onde vão as chamas animadas (medidas na arte 2560×1440). */
export const LIBRARY_FLAMES: LibraryFlame[] = [
  // tochas: centro da boca do copo; base = borda do copo; topo ~25 px acima das línguas pintadas
  // (y≈452) para a chama animada ficar mais alta que a pintada
  { kind: 'torch', x: 428, top: 425, base: 572 }, // tocha da parede esquerda
  { kind: 'torch', x: 2120, top: 425, base: 572 }, // tocha da parede direita
  { kind: 'candle', x: 304, top: 886, base: 924 }, // vela da mesinha, junto à poltrona
  { kind: 'candle', x: 2423, top: 878, base: 919 }, // vela da escrivaninha
];

const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;

/**
 * Abertura das baias da estante, sob o arco entalhado (medida na arte; igual nas três baias), em % da
 * caixa da baia (topo 22,5% e altura 31,8% do palco): laterais em 2% e 99%, o arco nasce a 14,5% da
 * altura e chega ao topo a −2%. O arco fica NA FRENTE dos livros, então o que passa dele é escondido.
 * Embaixo o recorte vai além da baia para não cortar a sombra de contato nem a plaquinha de missões.
 */
export const BAY_ARCH = { left: 0.02, right: 0.99, spring: 0.145, apex: -0.02 } as const;

export function bayArchClipPath(steps = 16): string {
  const { left, right, spring, apex } = BAY_ARCH;
  const cx = (left + right) / 2;
  const rx = (right - left) / 2;
  const ry = spring - apex;
  // superelipse (n = 2,6): sobe rápido junto às colunas e fica achatado no alto, como o arco pintado
  const n = 2.6;
  const points: string[] = [`${pct(left)} 140%`];
  for (let i = 0; i <= steps; i++) {
    const t = Math.PI - (Math.PI * i) / steps;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = spring - ry * Math.abs(s) ** (2 / n);
    points.push(`${pct(x)} ${pct(y)}`);
  }
  points.push(`${pct(right)} 140%`);
  return `polygon(${points.join(', ')})`;
}

/**
 * Cor do couro do tomo a partir da cor do projeto: mantém o matiz, mas limita saturação e brilho para
 * a capa parecer couro tingido sob luz de vela (um "#ff0000" vira vermelho-sangue, não vermelho neon).
 */
export function leatherTone(color: string | undefined, fallback = '#6b3a1e'): string {
  const hex = String(color || '').trim();
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) return hex || fallback;
  const full = digits.length === 3 ? digits.replace(/(.)/g, '$1$1') : digits;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  const r = channel(0);
  const g = channel(2);
  const b = channel(4);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const hue = Math.round((h * 60 + 360) % 360);
  const sat = Math.round(Math.min(s, 0.62) * 100);
  const light = Math.round(Math.min(Math.max(l, 0.2), 0.36) * 100);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Posição (em % do palco) do sprite de fogo sobre a chama pintada. Mesma conta das tochas do mural:
 * o quadro do sprite (`assets/img/fire-spritesheet-16.png`, 64×96) tem a chama da linha 0 à 90; a base da
 * caixa cai sobre a base pintada e o topo fica um pouco abaixo da ponta (o corte reto do sprite é mais largo).
 */
const FLAME_TOP_INSET = 0.02;
/** A chama dentro do quadro do sprite fica ~1,5 px (de 64) à esquerda do centro: compensa para centrar no copo. */
const SPRITE_CENTER_SHIFT = 1.5 / 64;
export function libraryFlameStyle(f: LibraryFlame): Record<string, string> {
  const top = f.top + (f.base - f.top) * FLAME_TOP_INSET;
  const h = (f.base - top) / (90 / 96);
  const w = (h * 64) / 96;
  return {
    left: pct((f.x - w / 2 + w * SPRITE_CENTER_SHIFT) / LIBRARY_IMAGE.w),
    top: pct(top / LIBRARY_IMAGE.h),
    width: pct(w / LIBRARY_IMAGE.w),
  };
}
