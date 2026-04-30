export function useZoomAnimation() {
  const TRANSITION_MS = 750;

  function createClone(element: HTMLElement, rect: DOMRect, extraStyles: Partial<CSSStyleDeclaration> = {}): HTMLElement {
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

  function animateZoomIn(element: HTMLElement, scale = 3.25): Promise<void> {
    const rect = element.getBoundingClientRect();
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

  function animateZoomOut(
    element: HTMLElement,
    targetRect: DOMRect
  ): Promise<void> {
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
