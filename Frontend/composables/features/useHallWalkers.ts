/**
 * Caminhantes do Saguão: NPCs que atravessam a cena (pipeline `scripts/hall-life/walker.py`).
 *
 * Cada caminhante tem um ciclo de passos (a → b → c → d) desenhado no lugar e é deslocado
 * aqui ao longo de uma rota em frações da imagem. A escala acompanha a profundidade do piso
 * (quanto mais perto do horizonte, menor) e o deslocamento por passo é proporcional ao
 * tamanho do corpo, para os pés não "patinarem".
 *
 * Roteiro: espera fora de cena → entra (fade) caminhando até o fim da rota → fica parado um
 * tempo → volta (espelhado) → sai (fade) → espera de novo.
 *
 * Continua andando com `prefers-reduced-motion` (no Windows essa preferência vem só de "efeitos
 * de animação" desligados e a cena ficaria morta); nesse modo só o pulso de luz é desligado.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import walkersData from '~/assets/data/hall-walkers.json';
import { HALL_IMAGE } from '~/composables/ui/useSceneSpace';

export interface WalkerData {
  frames: string[];
  /** tamanho da tela de cada frame (px da imagem, na escala de referência) */
  canvas: [number, number];
  /** ponto dos pés dentro da tela (px) */
  anchor: [number, number];
  bodyHeight: number;
  /** v (fração da imagem) dos pés quando o personagem foi gerado */
  refFeetV: number;
  route: { points: [number, number][]; horizon: number; fadeIn: number };
  behaviour: {
    stepLength: number;
    stepMs: number;
    idleAtEnd: [number, number];
    waitBetween: [number, number];
    returns: boolean;
    standFrame?: string;
  };
  tooltip: string | null;
}

export type WalkerPhase = 'waiting' | 'going' | 'idle' | 'returning';

export interface WalkerState {
  phase: WalkerPhase;
  /** progresso na rota, 0 = início, 1 = fim */
  t: number;
  frame: number;
  facing: 1 | -1;
  opacity: number;
}

/** Escala pela profundidade: altura ∝ distância vertical até o horizonte. */
export function depthScale(feetV: number, refFeetV: number, horizon: number): number {
  return Math.max(0.05, (feetV - horizon) / (refFeetV - horizon));
}

/** Ponto da rota (fração da imagem) para um progresso t. Rota de 2 pontos = segmento reto. */
export function routePoint(points: [number, number][], t: number): [number, number] {
  const [a, b] = [points[0]!, points[points.length - 1]!];
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** Comprimento da rota em px da imagem. */
export function routeLengthPx(points: [number, number][]): number {
  const [a, b] = [points[0]!, points[points.length - 1]!];
  return Math.hypot((b[0] - a[0]) * HALL_IMAGE.width, (b[1] - a[1]) * HALL_IMAGE.height);
}

/** Opacidade de entrada/saída nas pontas da rota (só no início, onde ele "surge"). */
export function edgeOpacity(t: number, fadeIn: number): number {
  if (fadeIn <= 0) return 1;
  return Math.min(1, Math.max(0, t / fadeIn));
}

/**
 * Avança o caminhante dt milissegundos. Função pura (testável): devolve o novo estado e se o
 * frame mudou. `phaseMs` é o tempo restante da fase parada (waiting/idle).
 */
export function stepWalker(
  w: WalkerData,
  s: WalkerState & { phaseMs: number; frameMs: number },
  dt: number,
  rng: () => number = Math.random,
): WalkerState & { phaseMs: number; frameMs: number } {
  const n = { ...s };
  const pick = ([min, max]: [number, number]) => min + (max - min) * rng();
  const stand = Math.max(
    0,
    w.frames.findIndex((f) => f.endsWith(`/${w.behaviour.standFrame ?? 'b'}.webp`)),
  );

  if (n.phase === 'waiting' || n.phase === 'idle') {
    n.phaseMs -= dt;
    if (n.phaseMs > 0) return n;
    if (n.phase === 'waiting') {
      return { ...n, phase: 'going', t: 0, facing: 1, frame: 0, frameMs: 0, opacity: 0 };
    }
    if (w.behaviour.returns) return { ...n, phase: 'returning', facing: -1, frame: 0, frameMs: 0 };
    return { ...n, phase: 'waiting', phaseMs: pick(w.behaviour.waitBetween), opacity: 0 };
  }

  // caminhando: velocidade = meio passo por frame, proporcional ao corpo na profundidade atual
  const [, v] = routePoint(w.route.points, n.t);
  const bodyPx = w.bodyHeight * depthScale(v, w.refFeetV, w.route.horizon);
  const pxPerMs = (w.behaviour.stepLength * bodyPx) / 2 / w.behaviour.stepMs;
  const dT = (pxPerMs * dt) / routeLengthPx(w.route.points);
  n.t += n.phase === 'going' ? dT : -dT;
  n.frameMs += dt;
  if (n.frameMs >= w.behaviour.stepMs) {
    n.frameMs -= w.behaviour.stepMs;
    n.frame = (n.frame + 1) % w.frames.length;
  }
  n.opacity = edgeOpacity(n.t, w.route.fadeIn);

  if (n.phase === 'going' && n.t >= 1) {
    return { ...n, t: 1, phase: 'idle', frame: stand, phaseMs: pick(w.behaviour.idleAtEnd), opacity: 1 };
  }
  if (n.phase === 'returning' && n.t <= 0) {
    return { ...n, t: 0, phase: 'waiting', phaseMs: pick(w.behaviour.waitBetween), opacity: 0 };
  }
  return n;
}

/** Estilo do caminhante dentro do GuildSceneSpace (frações da imagem). */
export function walkerStyle(w: WalkerData, s: WalkerState): Record<string, string> {
  const [u, v] = routePoint(w.route.points, s.t);
  const scale = depthScale(v, w.refFeetV, w.route.horizon);
  const pct = (x: number) => `${+(x * 100).toFixed(4)}%`;
  const width = (w.canvas[0] * scale) / HALL_IMAGE.width;
  const height = (w.canvas[1] * scale) / HALL_IMAGE.height;
  // posiciona a tela de modo que o ponto dos pés caia exatamente em (u, v)
  const ax = w.anchor[0] / w.canvas[0];
  const ay = w.anchor[1] / w.canvas[1];
  return {
    left: pct(u - ax * width),
    top: pct(v - ay * height),
    width: pct(width),
    height: pct(height),
    opacity: s.opacity.toFixed(3),
    transformOrigin: `${pct(ax)} ${pct(ay)}`,
    transform: s.facing === -1 ? 'scaleX(-1)' : 'none',
  };
}

const allWalkers = walkersData as unknown as Record<string, WalkerData>;

export function useHallWalkers(options: { freezeAt?: { t: number; frame: number } | null } = {}) {
  const states = ref<Record<string, WalkerState & { phaseMs: number; frameMs: number }>>({});
  let raf: number | null = null;
  let last = 0;

  function reset() {
    const next: typeof states.value = {};
    for (const [id, w] of Object.entries(allWalkers)) {
      if (options.freezeAt) {
        // calibração (?walkerT=0..1&walkerFrame=n): congela numa posição da rota
        const { t, frame } = options.freezeAt;
        next[id] = { phase: 'idle', t, frame, facing: 1, opacity: 1, phaseMs: Infinity, frameMs: 0 };
        continue;
      }
      // primeira entrada logo no início, para a cena já começar viva
      next[id] = {
        phase: 'waiting',
        t: 0,
        frame: 0,
        facing: 1,
        opacity: 0,
        phaseMs: 1500,
        frameMs: 0,
      };
    }
    states.value = next;
  }

  function tick(now: number) {
    const dt = Math.min(100, last ? now - last : 16); // evita saltos após a aba voltar
    last = now;
    const next: typeof states.value = {};
    for (const [id, s] of Object.entries(states.value)) next[id] = stepWalker(allWalkers[id]!, s, dt);
    states.value = next;
    raf = requestAnimationFrame(tick);
  }

  function start() {
    stop();
    if (options.freezeAt) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  const views = computed(() =>
    Object.entries(states.value).map(([id, s]) => {
      const w = allWalkers[id]!;
      return {
        id,
        frames: w.frames,
        frame: s.frame,
        tooltip: w.tooltip,
        style: walkerStyle(w, s),
        visible: s.opacity > 0.01,
      };
    }),
  );

  onMounted(() => {
    reset();
    start();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { views };
}
