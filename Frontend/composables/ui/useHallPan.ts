import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Câmera arrastável do Saguão no mobile: o "mundo" (a imagem inteira, com o palco do desktop
 * dentro) desliza na horizontal com o dedo, com inércia e elástico nas bordas.
 *
 * Toque curto (< DRAG_THRESHOLD px) continua sendo clique nos portais, NPCs e na folha; um
 * arraste de verdade cancela o clique que o navegador dispararia ao soltar.
 */

export const DRAG_THRESHOLD = 8;
/** fração do excesso que o elástico deixa passar além da borda */
const RUBBER = 0.35;
/** atrito da inércia por ms (velocidade *= FRICTION ** dt) */
const FRICTION = 0.9965;
/** velocidade (px/ms) abaixo da qual a inércia para */
const MIN_SPEED = 0.02;
/** força da mola que traz de volta quem passou da borda (por ms) */
const SPRING = 0.012;

export const clampPan = (p: number, min: number, max: number) => Math.min(max, Math.max(min, p));

/** posição sob o dedo além das bordas: só uma fração do excesso passa (sensação de elástico) */
export function rubberBand(p: number, min: number, max: number): number {
  if (p < min) return min - (min - p) * RUBBER;
  if (p > max) return max + (p - max) * RUBBER;
  return p;
}

export interface PanState {
  pan: number;
  /** px/ms, no sentido do pan */
  v: number;
}

/** um passo da inércia: atrito, e mola de volta se estiver fora dos limites. `done` = parou. */
export function stepInertia(
  s: PanState,
  dt: number,
  min: number,
  max: number,
): PanState & { done: boolean } {
  let { pan, v } = s;
  v *= FRICTION ** dt;
  pan += v * dt;
  const target = clampPan(pan, min, max);
  if (target !== pan) {
    // fora da borda: mata a velocidade para fora e puxa de volta
    if ((pan < min && v < 0) || (pan > max && v > 0)) v *= 0.5;
    pan += (target - pan) * Math.min(1, SPRING * dt);
    if (Math.abs(target - pan) < 0.5 && Math.abs(v) < MIN_SPEED)
      return { pan: target, v: 0, done: true };
    return { pan, v, done: false };
  }
  return { pan, v, done: Math.abs(v) < MIN_SPEED };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface HallPanBounds {
  min: number;
  max: number;
  start: number;
}

export function useHallPan(opts: {
  /** elemento que recebe o arraste (a tela inteira) */
  surface: Ref<HTMLElement | null>;
  /** elemento transladado (o mundo) */
  camera: Ref<HTMLElement | null>;
  /** limites atuais; null = câmera desligada (desktop) */
  bounds: Ref<HallPanBounds | null>;
  /** chamado no primeiro arraste (esconder a dica) */
  onFirstDrag?: () => void;
}) {
  let pan = 0;
  let raf = 0;
  let pointerId: number | null = null;
  let startX = 0;
  let startPan = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let v = 0;
  let firstDragDone = false;

  const apply = () => {
    const el = opts.camera.value;
    if (el) el.style.transform = opts.bounds.value ? `translate3d(${-pan}px, 0, 0)` : '';
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  function runInertia() {
    stop();
    let prev = performance.now();
    const tick = (now: number) => {
      const b = opts.bounds.value;
      if (!b) return;
      const s = stepInertia({ pan, v }, Math.min(48, now - prev), b.min, b.max);
      prev = now;
      pan = s.pan;
      v = s.v;
      apply();
      raf = s.done ? 0 : requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /** leva a câmera até `target` (px de pan) com ease; resolve ao chegar */
  function panTo(target: number, ms = 380): Promise<void> {
    const b = opts.bounds.value;
    if (!b) return Promise.resolve();
    stop();
    const from = pan;
    const to = clampPan(target, b.min, b.max);
    if (Math.abs(to - from) < 1) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        pan = from + (to - from) * easeInOut(t);
        apply();
        if (t < 1) raf = requestAnimationFrame(tick);
        else {
          raf = 0;
          resolve();
        }
      };
      raf = requestAnimationFrame(tick);
    });
  }

  /** px de pan que centraliza um ponto do mundo (px) na tela */
  const centerOn = (worldX: number) => worldX - (opts.surface.value?.clientWidth ?? 0) / 2;

  function onDown(e: PointerEvent) {
    if (!opts.bounds.value || pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0))
      return;
    stop();
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startPan = pan;
    lastT = e.timeStamp;
    v = 0;
    dragging = false;
  }

  function onMove(e: PointerEvent) {
    const b = opts.bounds.value;
    if (!b || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      dragging = true;
      // só agora captura: um toque curto continua chegando no botão/portal embaixo do dedo
      opts.surface.value?.setPointerCapture?.(e.pointerId);
      if (!firstDragDone) {
        firstDragDone = true;
        opts.onFirstDrag?.();
      }
    }
    const dt = Math.max(1, e.timeStamp - lastT);
    // velocidade suavizada (o dedo anda para a direita = pan diminui)
    v = 0.8 * (-(e.clientX - lastX) / dt) + 0.2 * v;
    lastX = e.clientX;
    lastT = e.timeStamp;
    pan = rubberBand(startPan - dx, b.min, b.max);
    apply();
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    // o navegador ainda dispara um click ao soltar: um arraste não é toque
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    // dedo parado antes de soltar: sem inércia
    if (e.timeStamp - lastT > 80) v = 0;
    runInertia();
  }

  const listeners: [string, (e: PointerEvent) => void][] = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onUp],
  ];

  watch(
    opts.surface,
    (el, old) => {
      for (const [n, fn] of listeners) {
        old?.removeEventListener(n, fn as EventListener);
        el?.addEventListener(n, fn as EventListener, { passive: true });
      }
    },
    { immediate: true },
  );

  // limites novos (montagem, giro da tela, resize): volta ao ponto inicial se mudou de modo,
  // senão só mantém a câmera dentro dos limites
  watch(
    opts.bounds,
    (b, old) => {
      stop();
      if (b) pan = old ? clampPan(pan, b.min, b.max) : b.start;
      apply();
    },
    { immediate: true },
  );
  watch(opts.camera, apply);

  onBeforeUnmount(() => {
    stop();
    for (const [n, fn] of listeners) opts.surface.value?.removeEventListener(n, fn as EventListener);
  });

  return { panTo, centerOn };
}
