/** Papel ampliado: 160x200 de projeto (proporção 0.8), com altura até 92% da tela e no máximo 980 px. */
export const ZOOMED_PAPER_RATIO = 0.8;
export function zoomedPaperSize(): { w: number; h: number } {
  const maxH = Math.min(window.innerHeight * 0.92, 980);
  const maxW = window.innerWidth * 0.92;
  const h = Math.round(Math.min(maxH, maxW / ZOOMED_PAPER_RATIO));
  return { w: Math.round(h * ZOOMED_PAPER_RATIO), h };
}

export function useZoomAnimation() {
  const TRANSITION_MS = 750;

  function createClone(
    element: HTMLElement,
    rect: DOMRect,
    extraStyles: Partial<CSSStyleDeclaration> = {},
  ): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement;

    Object.assign(clone.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transition: `all ${TRANSITION_MS}ms ease`,
      // Must be above any overlays (e.g. fixed zoom container, drawers, etc.)
      zIndex: '5000',
      opacity: '1',
      pointerEvents: 'none',
      ...extraStyles,
    });

    return clone;
  }

  function animateZoomIn(element: HTMLElement, scaleOverride?: number): Promise<void> {
    const rect = element.getBoundingClientRect();
    // o clone cresce até o tamanho do papel ampliado (mesma conta do Paper.vue), para não pular ao final
    const scale = scaleOverride ?? zoomedPaperSize().h / rect.height;
    const clone = createClone(element, rect, {
      transformOrigin: 'top left',
      willChange: 'left, top, transform',
    });
    document.body.appendChild(clone);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const targetWidth = rect.width * scale;
        const targetHeight = rect.height * scale;

        const targetLeft = (window.innerWidth - targetWidth) / 2;
        const targetTop = (window.innerHeight - targetHeight) / 2;

        const dx = targetLeft - rect.left;
        const dy = targetTop - rect.top;

        Object.assign(clone.style, {
          // Keep left/top anchored at the original location and animate via a single transform.
          // This avoids px→% interpolation issues and guarantees the paper travels to center.
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        });
      });

      setTimeout(() => {
        document.body.removeChild(clone);
        resolve();
      }, TRANSITION_MS + 20);
    });
  }

  function animateZoomOut(element: HTMLElement, targetRect: DOMRect): Promise<void> {
    const rect = element.getBoundingClientRect();
    const clone = createClone(element, rect);
    document.body.appendChild(clone);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        Object.assign(clone.style, {
          left: `${targetRect.left}px`,
          top: `${targetRect.top}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          transform: 'none',
        });
      });

      setTimeout(() => {
        document.body.removeChild(clone);
        resolve();
      }, TRANSITION_MS + 20);
    });
  }

  return {
    animateZoomIn,
    animateZoomOut,
  };
}
