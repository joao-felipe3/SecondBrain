export type HallFrameCallback = (now: number) => void;

export function hallFrameInterval(compact: boolean, fpsDesktop = 30, fpsMobile = 24): number {
  return 1000 / (compact ? fpsMobile : fpsDesktop);
}

export function createHallFrameScheduler(options?: {
  compact?: () => boolean;
  hidden?: () => boolean;
  raf?: (callback: FrameRequestCallback) => number;
  cancelRaf?: (handle: number) => void;
}) {
  const compact =
    options?.compact ??
    (() =>
      typeof window !== 'undefined'
        ? window.matchMedia('(max-width: 960px)').matches
        : false);
  const hidden =
    options?.hidden ?? (() => (typeof document !== 'undefined' ? document.hidden : false));
  const raf =
    options?.raf ??
    ((callback: FrameRequestCallback) =>
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(callback)
        : 0);
  const cancelRaf =
    options?.cancelRaf ??
    ((handle: number) => {
      if (handle && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(handle);
    });
  const callbacks = new Map<number, HallFrameCallback>();
  let nextId = 1;
  let frameHandle = 0;
  let lastFrame = -Infinity;

  const stop = () => {
    if (frameHandle) cancelRaf(frameHandle);
    frameHandle = 0;
  };

  const tick: FrameRequestCallback = (now) => {
    frameHandle = 0;
    if (hidden() || callbacks.size === 0) {
      lastFrame = -Infinity;
      return;
    }

    const interval = hallFrameInterval(compact());
    if (now - lastFrame >= interval - 2) {
      lastFrame = now;
      for (const callback of [...callbacks.values()]) callback(now);
    }

    if (frameHandle === 0 && callbacks.size > 0) {
      frameHandle = raf(tick);
    }
  };

  const subscribe = (callback: HallFrameCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    if (!frameHandle && !hidden()) frameHandle = raf(tick);
    return () => {
      callbacks.delete(id);
      if (callbacks.size === 0) stop();
    };
  };

  const handleVisibility = () => {
    stop();
    lastFrame = -Infinity;
    if (!hidden() && callbacks.size > 0) frameHandle = raf(tick);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return {
    subscribe,
    dispose: () => {
      stop();
      callbacks.clear();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    },
  };
}

export const hallFrameScheduler = createHallFrameScheduler();
