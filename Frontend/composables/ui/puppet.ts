/**
 * Marionete 2D (player próprio, sem dependências): o formato que `scripts/hall-life/rive_rig.py` grava
 * em `puppet.json` — imagens pintadas, malhas ligadas a ossos (skinning linear), animações por
 * keyframes lineares e um sorteio simples de gestos.
 *
 * Matrizes 2D afins como [a, b, c, d, tx, ty]:  x' = a·x + c·y + tx,  y' = b·x + d·y + ty.
 */

export type Mat2D = [number, number, number, number, number, number];

export interface PuppetBone {
  id: string;
  parent: string | null;
  /** só no osso raiz: origem no artboard */
  x?: number;
  y?: number;
  /** radianos; na raiz é o ângulo no mundo, nos filhos é relativo ao pai */
  rotation: number;
  length: number;
  /** escala uniforme em volta da origem (ex.: garganta estufando no gole); padrão 1 */
  scale?: number;
}

export interface PuppetMesh {
  /** posições na pose de ligação (pares x, y, em px do artboard) */
  v: number[];
  uv: number[];
  tri: number[];
  /** por vértice: [osso0, peso0, osso1, peso1] (índices em `bones` desta malha) */
  w: number[];
  bones: string[];
  /** matriz de cada osso no momento da ligação */
  bind: Mat2D[];
}

export interface PuppetDrawable {
  id: string;
  image: string;
  opacity: number;
  mesh?: PuppetMesh;
}

/** Estado que dura entre gestos (ex.: sujeira da barba); a camada k aparece quando o valor passa de k. */
export interface PuppetVar {
  max: number;
  layers: string[];
}

/** Durante o gesto, entre os quadros `from` e `until`, a variável soma `add` ou vai até `to`. */
export interface PuppetEffect {
  var: string;
  add?: number;
  to?: number;
  from: number;
  until: number;
}

export type PuppetState = Record<string, number>;

export interface PuppetAnim {
  name: string;
  frames: number;
  effects?: PuppetEffect[];
  /** peso do sorteio multiplicado por esta variável (0 = nunca; ex.: só limpa a barba se estiver suja) */
  weightBy?: string;
  /** objeto -> propriedade (rotation | length | scale | opacity) -> [[quadro, valor]] */
  tracks: Record<string, Record<string, [number, number][]>>;
}

export interface Puppet {
  size: [number, number];
  fps: number;
  /** asset -> [arquivo, x, y, largura, altura] no artboard */
  images: Record<string, [string, number, number, number, number]>;
  bones: PuppetBone[];
  /** de trás para a frente */
  draw: PuppetDrawable[];
  anims: PuppetAnim[];
  idleMs: [number, number];
  weights: { idle: number; gesture: number };
  vars?: Record<string, PuppetVar>;
}

export interface PuppetPose {
  bones: Record<string, { rotation: number; length: number; scale: number }>;
  opacity: Record<string, number>;
}

/** Valor de uma trilha no quadro `frame` (interpolação linear, segura nas pontas). */
export function sampleTrack(keys: [number, number][], frame: number): number {
  if (!keys.length) return 0;
  if (frame <= keys[0]![0]) return keys[0]![1];
  const last = keys[keys.length - 1]!;
  if (frame >= last[0]) return last[1];
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid]![0] <= frame) lo = mid;
    else hi = mid;
  }
  const [f0, v0] = keys[lo]!;
  const [f1, v1] = keys[hi]!;
  return v0 + ((v1 - v0) * (frame - f0)) / (f1 - f0);
}

/** Pose: valores de repouso, sobrescritos pela animação ativa (se houver) no quadro dado. */
export function evalPose(p: Puppet, anim: PuppetAnim | null, frame: number): PuppetPose {
  const pose: PuppetPose = { bones: {}, opacity: {} };
  for (const b of p.bones)
    pose.bones[b.id] = { rotation: b.rotation, length: b.length, scale: b.scale ?? 1 };
  for (const d of p.draw) pose.opacity[d.id] = d.opacity;
  if (!anim) return pose;
  for (const [obj, props] of Object.entries(anim.tracks)) {
    for (const [prop, keys] of Object.entries(props)) {
      const val = sampleTrack(keys, frame);
      if (prop === 'opacity') pose.opacity[obj] = val;
      else if (pose.bones[obj] && (prop === 'rotation' || prop === 'length' || prop === 'scale'))
        pose.bones[obj][prop] = val;
    }
  }
  return pose;
}

export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

const rot = (r: number, tx = 0, ty = 0, k = 1): Mat2D => [
  k * Math.cos(r),
  k * Math.sin(r),
  -k * Math.sin(r),
  k * Math.cos(r),
  tx,
  ty,
];

/**
 * Matriz no mundo de cada osso. Raiz: T(x, y)·R(rotação)·S(escala). Filho: começa na ponta do pai —
 * mundo(pai)·T(comprimento do pai, 0)·R(rotação)·S(escala).
 */
export function boneWorlds(p: Puppet, pose: PuppetPose): Record<string, Mat2D> {
  const out: Record<string, Mat2D> = {};
  for (const b of p.bones) {
    const v = pose.bones[b.id]!;
    if (!b.parent) {
      out[b.id] = rot(v.rotation, b.x ?? 0, b.y ?? 0, v.scale);
    } else {
      const parent = out[b.parent]!;
      const tip = multiply(parent, [1, 0, 0, 1, pose.bones[b.parent]!.length, 0]);
      out[b.id] = multiply(tip, rot(v.rotation, 0, 0, v.scale));
    }
  }
  return out;
}

/** Deforma a malha (skinning linear: soma dos pesos × mundo(osso)·inverso(ligação)). */
export function skinMesh(
  mesh: PuppetMesh,
  worlds: Record<string, Mat2D>,
  out: Float32Array,
): Float32Array {
  const mats = mesh.bones.map((id, i) => multiply(worlds[id]!, invert(mesh.bind[i]!)));
  const n = mesh.v.length / 2;
  for (let k = 0; k < n; k++) {
    const x = mesh.v[2 * k]!;
    const y = mesh.v[2 * k + 1]!;
    let ox = 0;
    let oy = 0;
    for (let s = 0; s < 2; s++) {
      const wt = mesh.w[4 * k + 2 * s + 1]!;
      if (!wt) continue;
      const m = mats[mesh.w[4 * k + 2 * s]!]!;
      ox += wt * (m[0] * x + m[2] * y + m[4]);
      oy += wt * (m[1] * x + m[3] * y + m[5]);
    }
    out[2 * k] = ox;
    out[2 * k + 1] = oy;
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Variáveis no quadro `frame` do gesto, partindo do estado `s` (sem gesto: o próprio estado). */
export function varsAt(p: Puppet, anim: PuppetAnim | null, frame: number, s: PuppetState): PuppetState {
  const out = { ...s };
  for (const e of anim?.effects ?? []) {
    const v0 = out[e.var] ?? 0;
    const target = clamp(e.to ?? v0 + (e.add ?? 0), 0, p.vars?.[e.var]?.max ?? Infinity);
    const u = clamp((frame - e.from) / Math.max(1, e.until - e.from), 0, 1);
    out[e.var] = v0 + (target - v0) * u;
  }
  return out;
}

/** Camadas de estado: a k-ésima vai aparecendo enquanto o valor sobe de k para k + 1. */
export function applyVars(p: Puppet, s: PuppetState, opacity: Record<string, number>): void {
  for (const [name, v] of Object.entries(p.vars ?? {})) {
    v.layers.forEach((id, k) => {
      opacity[id] = (opacity[id] ?? 1) * clamp((s[name] ?? 0) - k, 0, 1);
    });
  }
}

/**
 * Próximo passo da vida do personagem: parado de novo (peso `idle`) ou um gesto (peso `gesture`
 * cada, vezes a variável `weightBy` se houver). Devolve o índice do gesto ou -1 (parado).
 */
export function pickNext(p: Puppet, rng: () => number = Math.random, s: PuppetState = {}): number {
  const w = p.anims.map((a) => p.weights.gesture * (a.weightBy ? (s[a.weightBy] ?? 0) : 1));
  const total = p.weights.idle + w.reduce((x, y) => x + y, 0);
  let r = rng() * total - p.weights.idle;
  if (r < 0) return -1;
  for (let i = 0; i < p.anims.length; i++) {
    r -= w[i]!;
    if (r < 0 && w[i]! > 0) return i;
  }
  return -1;
}
