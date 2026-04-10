type CreatePertResizeObserverParams = {
  getCy: () => any
  getContainer: () => HTMLElement | null
  getWasContainerHidden: () => boolean
  setWasContainerHidden: (value: boolean) => void
  onContainerRevealed: () => void
  onRegularResize: (cy: any) => void
  minContainerSize?: number
}

export const usePertGraphResizeObserver = () => {
  const createPertResizeObserver = ({
    getCy,
    getContainer,
    getWasContainerHidden,
    setWasContainerHidden,
    onContainerRevealed,
    onRegularResize,
    minContainerSize = 40,
  }: CreatePertResizeObserverParams) => {
    return new ResizeObserver(() => {
      const cy = getCy()
      if (!cy) return

      const container = getContainer()
      const containerWidth = container?.clientWidth || 0
      const containerHeight = container?.clientHeight || 0

      if (containerWidth < minContainerSize || containerHeight < minContainerSize) {
        setWasContainerHidden(true)
        return
      }

      if (getWasContainerHidden()) {
        setWasContainerHidden(false)
        onContainerRevealed()
        return
      }

      onRegularResize(cy)
    })
  }

  return {
    createPertResizeObserver,
  }
}
