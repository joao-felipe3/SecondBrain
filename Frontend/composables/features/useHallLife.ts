/**
 * Vida no Saguão: vinhetas pintadas na própria cena (pipeline `Frontend/scripts/hall-life/`).
 *
 * Cada vinheta é um patch (pixels da cena + personagem) recolocado exatamente no retângulo de
 * onde saiu, dentro do `GuildSceneSpace` (coordenadas da imagem). Os frames só diferem onde há
 * movimento, então a troca é um crossfade curto sem "fantasma".
 *
 * O ritmo não é um ping-pong fixo: cada frame fica parado por um tempo sorteado em `hold`
 * (ex.: Gloin passa 3,5–7 s com a caneca no joelho e 1,3–2 s bebendo), e cada vinheta começa
 * com um atraso próprio, para o saguão não "respirar" em sincronia.
 *
 * Algumas vinhetas têm um "primeiro plano" (silhueta justa) desenhado ACIMA dos efeitos do
 * GuildVfxLayer — ex.: o cavaleiro sentado na frente da chama da lareira. As duas camadas leem o
 * mesmo estado de frame (agendador compartilhado), então trocam juntas.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import hallLifeData from '~/assets/data/hall-life.json';
import { imageRectToPercentStyle, type Rect } from '~/composables/ui/useSceneSpace';

export interface HallLifeFrame {
  name: string;
  src: string;
  /** [min, max] em ms que o frame fica parado */
  hold: [number, number];
  /**
   * Intermediários desenhados do movimento que CHEGA nesta pose (como os 8 frames da porta):
   * repouso → b_1 → b_2 → b; na volta ao repouso tocam ao contrário.
   */
  tweens?: { name: string; src: string }[];
  /** ms médio de cada passo do movimento desta pose (gestos de marionete têm muitos quadros curtos) */
  tweenMs?: number;
  /** ciclo tocado enquanto a pose está parada (ex.: goles do Gloin), sempre volta à pose */
  loop?: { name: string; src: string }[];
  /** ms de cada quadro do ciclo */
  loopMs?: number;
}

/**
 * O que tocar durante a parada de uma pose: ciclos completos (quadros do ciclo + a própria pose)
 * enquanto couberem no tempo parado (pelo menos um), e quanto tempo esperar depois.
 */
export function holdPlan(
  frame: Pick<HallLifeFrame, 'name' | 'loop' | 'loopMs'>,
  holdMs: number,
): { leadMs: number; steps: string[]; stepMs: number; restMs: number } {
  const cycle = [...(frame.loop ?? []).map((f) => f.name), frame.name];
  const stepMs = frame.loopMs ?? 70;
  if (cycle.length === 1 || !Number.isFinite(holdMs)) {
    return { leadMs: 0, steps: [], stepMs, restMs: holdMs };
  }
  // espera um pouco na pose antes do primeiro ciclo (a caneca chega e então começa a beber)
  const leadMs = Math.round(Math.min(300, holdMs * 0.2));
  const cycleMs = cycle.length * stepMs;
  const n = Math.max(1, Math.floor((holdMs - leadMs) / cycleMs));
  return {
    leadMs,
    steps: Array.from({ length: n }, () => cycle).flat(),
    stepMs,
    restMs: Math.max(0, holdMs - leadMs - n * cycleMs),
  };
}

export interface HallLifeVignette {
  order: number;
  /** [x, y, w, h] em pixels da imagem de fundo */
  rect: [number, number, number, number];
  frames: HallLifeFrame[];
  light: { source: 'torch' | 'hearth'; gain: number };
  tooltip: string | null;
  sequence?: HallLifeSequence;
  /** ms de cada intermediário (padrão TWEEN_MS) */
  tweenMs?: number;
  /** silhueta que fica na frente dos efeitos (mesmos nomes de frame da base) */
  foreground?: { rect: [number, number, number, number]; frames: { name: string; src: string }[] };
  /**
   * NPC animado em tempo real pelo player próprio (marionete de scripts/hall-life/rive_rig.py),
   * no mesmo retângulo.
   * O player sorteia os gestos; os quadros ficam só como repouso/reserva.
   */
  puppet?: HallLifePuppet;
}

export interface HallLifePuppet {
  /** puppet.json */
  src: string;
}

export type HallLifeLayer = 'base' | 'foreground';

export type HallLifeData = Record<string, HallLifeVignette>;

export interface VignetteView {
  id: string;
  frames: { name: string; src: string }[];
  tooltip: string | null;
  style: Record<string, string>;
  lightClass: string;
  puppet: HallLifePuppet | null;
}

/** Sorteia quanto tempo um frame fica parado. */
export function pickHold(hold: [number, number], rng: () => number = Math.random): number {
  const [min, max] = hold;
  return Math.round(min + (max - min) * rng());
}

export type HallLifeSequence = 'loop' | 'gestures';

/** Duração MÉDIA de cada passo do movimento (o ease estica as pontas e encurta o meio). */
export const TWEEN_MS = 140;

/** Duração máxima de um movimento completo (até a pose), quando há muitos intermediários. */
export const GESTURE_MAX_MS = 800;

/**
 * Duração de cada passo de um movimento com `steps` passos (intermediários + pose final),
 * com ease-in-out senoidal: as poses estão igualmente espaçadas no caminho, então o tempo entre
 * elas segue t(p) = acos(1 − 2p)/π — devagar ao sair e ao chegar, rápido no meio, como um
 * animador espaça os desenhos. Soma = steps × avgMs.
 */
export function easedStepDurations(steps: number, avgMs: number = TWEEN_MS): number[] {
  if (steps <= 0) return [];
  if (steps === 1) return [avgMs];
  const t = (p: number) => Math.acos(1 - 2 * p) / Math.PI;
  const total = steps * avgMs;
  return Array.from({ length: steps }, (_, k) =>
    Math.round((t((k + 1) / steps) - t(k / steps)) * total),
  );
}

/**
 * Duração média de cada passo de um movimento com `steps` passos: a do gesto envolvido (ida ou
 * volta), senão a da vinheta, senão o padrão — gestos com muitos desenhos duram até ~0,8 s.
 */
export function stepMs(
  v: Pick<HallLifeVignette, 'frames' | 'tweenMs'>,
  from: number,
  to: number,
  steps: number,
): number {
  const gesture = v.frames[to !== 0 ? to : from];
  return gesture?.tweenMs ?? v.tweenMs ?? Math.max(80, Math.min(TWEEN_MS, GESTURE_MAX_MS / steps));
}

/**
 * Quadros intermediários (nomes) a tocar entre a pose `from` e a pose `to`.
 * Ir para um gesto usa os intermediários dele; voltar ao repouso usa os do gesto ao contrário.
 */
export function transitionPath(
  frames: HallLifeFrame[],
  from: number,
  to: number,
  sequence: HallLifeSequence = 'gestures',
): string[] {
  if (from === to) return [];
  const forward = (frames[to]?.tweens ?? []).map((t) => t.name);
  if (forward.length || sequence === 'loop' || to !== 0) return forward;
  return (frames[from]?.tweens ?? []).map((t) => t.name).reverse();
}

/**
 * Próximo frame.
 *  - `loop`: a → b → c … → a (movimento contínuo, ex.: dedilhar o alaúde).
 *  - `gestures` (padrão): repouso (a) → gesto sorteado → repouso → outro gesto…, sem repetir
 *    o mesmo gesto duas vezes seguidas. Fica mais natural que percorrer as poses em ordem.
 * `previous` é o último gesto feito (para não repetir).
 */
export function nextFrame(
  frames: HallLifeFrame[],
  current: number,
  rng: () => number = Math.random,
  sequence: HallLifeSequence = 'gestures',
  previous = -1,
): { index: number; holdMs: number } {
  if (frames.length <= 1) return { index: 0, holdMs: Number.POSITIVE_INFINITY };
  let index: number;
  if (sequence === 'loop' || frames.length === 2) {
    index = (current + 1) % frames.length;
  } else if (current !== 0) {
    index = 0;
  } else {
    const options = frames.map((_, i) => i).filter((i) => i !== 0 && i !== previous);
    index = options[Math.min(options.length - 1, Math.floor(rng() * options.length))]!;
  }
  return { index, holdMs: pickHold(frames[index]!.hold, rng) };
}

/**
 * Converte os dados exportados em views ordenadas por profundidade (fundo → frente).
 * `layer = 'foreground'` devolve só as silhuetas que ficam acima dos efeitos.
 */
export function buildVignetteViews(data: HallLifeData, layer: HallLifeLayer = 'base'): VignetteView[] {
  return Object.entries(data)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, v], i) => ({ id, v, i }))
    .filter(({ v }) => layer === 'base' || !!v.foreground)
    .map(({ id, v, i }) => {
      const src = layer === 'base' ? v : v.foreground!;
      const [x, y, w, h] = src.rect;
      // chaves primeiro (frame A em baixo de tudo), depois os intermediários
      const extras = (f: HallLifeFrame) => [...(f.tweens ?? []), ...(f.loop ?? [])];
      const tweenNames = new Set(v.frames.flatMap((f) => extras(f).map((t) => t.name)));
      const keys = src.frames.filter((f) => !tweenNames.has(f.name));
      const tweens =
        layer === 'base' ? v.frames.flatMap(extras) : src.frames.filter((f) => tweenNames.has(f.name));
      const rect: Rect = { x, y, w, h };
      return {
        id,
        // NPC marionete: só o repouso (aparece até carregar e serve de reserva)
        frames: (layer === 'base' && v.puppet ? keys.slice(0, 1) : [...keys, ...tweens]).map(
          ({ name, src: url }) => ({ name, src: url }),
        ),
        puppet: layer === 'base' ? (v.puppet ?? null) : null,
        // tooltip/hitbox só na base (o primeiro plano é decorativo)
        tooltip: layer === 'base' ? v.tooltip : null,
        lightClass: `light-${v.light.source}`,
        style: {
          ...imageRectToPercentStyle(rect),
          zIndex: String(i + 1),
          '--light-gain': String(v.light.gain),
          // dessincroniza o pulso de luz entre vinhetas (mesmo valor nas duas camadas)
          '--light-delay': `${-((i * 0.37) % 1.7).toFixed(2)}s`,
        },
      };
    });
}

// ─── Agendador compartilhado entre as camadas (base e primeiro plano) ───
const allData = hallLifeData as unknown as HallLifeData;
/** nome do frame exibido e do anterior (que fica opaco por baixo durante o crossfade) */
const sharedActive = ref<Record<string, string>>({});
const sharedPrevious = ref<Record<string, string>>({});
/** duração do dissolve do frame ativo (= duração do passo: dissolve contínuo entre poses) */
const sharedFade = ref<Record<string, number>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let users = 0;

function show(id: string, name: string, fadeMs: number) {
  const current = sharedActive.value[id];
  if (current === name) return;
  sharedFade.value = { ...sharedFade.value, [id]: fadeMs };
  if (current) sharedPrevious.value = { ...sharedPrevious.value, [id]: current };
  sharedActive.value = { ...sharedActive.value, [id]: name };
}

function schedule(id: string, v: HallLifeVignette, current: number, delayMs: number, previous = -1) {
  timers.set(
    id,
    setTimeout(() => {
      const sequence = v.sequence ?? 'gestures';
      const { index, holdMs } = nextFrame(v.frames, current, Math.random, sequence, previous);
      const steps = [...transitionPath(v.frames, current, index, sequence), v.frames[index]!.name];
      const durations = easedStepDurations(steps.length, stepMs(v, current, index, steps.length));
      const play = (k: number) => {
        // troca direta (sem intermediários) mantém o dissolve curto de antes
        show(id, steps[k]!, steps.length > 1 ? durations[k]! : 220);
        if (k < steps.length - 1) {
          timers.set(
            id,
            setTimeout(() => play(k + 1), durations[k]!),
          );
        } else if (Number.isFinite(holdMs)) {
          const plan = holdPlan(v.frames[index]!, holdMs);
          const next = () => schedule(id, v, index, plan.restMs, current !== 0 ? current : previous);
          if (!plan.steps.length) return next();
          // parado na pose, mas vivo: ciclo (ex.: goles) e depois o resto do tempo parado
          const loop = (j: number) => {
            show(id, plan.steps[j]!, plan.stepMs);
            if (j < plan.steps.length - 1) {
              timers.set(
                id,
                setTimeout(() => loop(j + 1), plan.stepMs),
              );
            } else next();
          };
          timers.set(
            id,
            setTimeout(() => loop(0), plan.leadMs),
          );
        }
      };
      play(0);
    }, delayMs),
  );
}

function stopAll() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}

function startAll() {
  stopAll();
  for (const [id, v] of Object.entries(allData)) {
    sharedActive.value = { ...sharedActive.value, [id]: v.frames[0]!.name };
    sharedPrevious.value = { ...sharedPrevious.value, [id]: '' };
    // a marionete anima sozinha (o player sorteia os gestos)
    if (v.frames.length < 2 || v.puppet) continue;
    // primeiro movimento: hold do frame A + atraso extra aleatório
    schedule(id, v, 0, pickHold(v.frames[0]!.hold) + Math.random() * 2000);
  }
}

function onVisibility() {
  if (document.hidden) stopAll();
  else startAll();
}

/**
 * Um único agendador (timer por vinheta) para todas as camadas montadas; pausa com a aba
 * oculta. Os gestos continuam com `prefers-reduced-motion` (são trocas de pose no lugar, sem
 * deslocamento — o Windows liga essa preferência só por "efeitos de animação" desligados);
 * nesse modo o CSS do GuildNpcLayer tira só o pulso de luz (os dissolves ficam).
 */
export function useHallLife(options: { layer?: HallLifeLayer } = {}) {
  const views = computed(() => buildVignetteViews(allData, options.layer ?? 'base'));

  onMounted(() => {
    users += 1;
    if (users === 1) {
      startAll();
      document.addEventListener('visibilitychange', onVisibility);
    }
  });

  onBeforeUnmount(() => {
    users -= 1;
    if (users === 0) {
      stopAll();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  });

  return { views, active: sharedActive, previous: sharedPrevious, fade: sharedFade };
}
