type PertResolvedLayoutMode = 'hierarchical' | 'force'

type ResolveLayoutStateResult = {
  resolvedLayoutMode: PertResolvedLayoutMode
}

type ApplyFinalViewportParams = {
  cy: any
  activeMode: PertResolvedLayoutMode
  chartContainer: HTMLElement | null
  zoomBoostCap: number
  isDenseGraph: boolean
  lockedNodeId: string | null
  ensureMinimumRenderedNodeSize: (cy: any, minRenderedPx?: number, maxZoom?: number) => void
  applyZoomLod: (cy: any) => void
  setAllEdgesForceVisible: (cy: any, value: boolean) => void
  estimateIntersections: () => number
}

export const usePertRenderFinalizer = () => {
  const resolveLayoutState = (
    activeMode: PertResolvedLayoutMode,
    _startIds: string[],
    _firstNodeId: string | null,
  ): ResolveLayoutStateResult => ({
    resolvedLayoutMode: activeMode,
  })

  const applyFinalViewportAndVisuals = ({
    cy,
    activeMode,
    chartContainer,
    zoomBoostCap,
    isDenseGraph,
    lockedNodeId,
    ensureMinimumRenderedNodeSize,
    applyZoomLod,
    setAllEdgesForceVisible,
    estimateIntersections,
  }: ApplyFinalViewportParams) => {
    // Use more of the canvas (height + width) when fit leaves too much empty area.
    const graphBounds = cy.elements().boundingBox()
    const safeContainerWidth = chartContainer?.clientWidth || 1
    const safeContainerHeight = chartContainer?.clientHeight || 1
    const widthUsage = graphBounds.w / Math.max(safeContainerWidth, 1)
    const heightUsage = graphBounds.h / Math.max(safeContainerHeight, 1)
    const usage = Math.min(widthUsage, heightUsage)
    const targetUsage = activeMode === 'force' ? 0.82 : 0.72
    if (usage < targetUsage) {
      const factor = Math.min(
        zoomBoostCap * (activeMode === 'force' ? 1.18 : 1),
        targetUsage / Math.max(usage, 0.08),
      )
      const boosted = Math.min(activeMode === 'force' ? 2.4 : 2.2, cy.zoom() * factor)
      cy.zoom(boosted)
    }

    ensureMinimumRenderedNodeSize(cy, isDenseGraph ? 20 : 24, 2.8)

    // Keep fitted zoom for denser diagrams to avoid re-crowding after layout.
    cy.center()

    applyZoomLod(cy)
    setAllEdgesForceVisible(cy, Boolean(lockedNodeId))

    const intersectionCount = estimateIntersections()
    return {
      intersectionCount,
    }
  }

  return {
    resolveLayoutState,
    applyFinalViewportAndVisuals,
  }
}
