export function useZoomAnimation() {
  function createClone(element: HTMLElement, rect: DOMRect, extraStyles: Partial<CSSStyleDeclaration> = {}): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement;

    Object.assign(clone.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transition: 'all 0.75s ease',
      zIndex: '1000',
      pointerEvents: 'none',
      ...extraStyles,
    });

    return clone;
  }

  function animateZoomIn(element: HTMLElement, scale = 3.25): Promise<void> {
    const rect = element.getBoundingClientRect();
    const clone = createClone(element, rect);
    document.body.appendChild(clone);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        Object.assign(clone.style, {
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
        });
      });

      setTimeout(() => {
        document.body.removeChild(clone);
        resolve();
      }, 700);
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
      }, 700);
    });
  }

  return {
    animateZoomIn,
    animateZoomOut,
  };
}
