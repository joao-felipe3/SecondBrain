type PertResolvedLayoutMode = 'hierarchical' | 'radial'

type ResolveLayoutStateResult = {
  resolvedLayoutMode: PertResolvedLayoutMode
  radialCenterNodeId: string | null
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
  updateRadialRingOverlay: () => void
  estimateIntersections: () => number
}

export const usePertRenderFinalizer = () => {
  const resolveLayoutState = (
    activeMode: PertResolvedLayoutMode,
    startIds: string[],
    firstNodeId: string | null,
  ): ResolveLayoutStateResult => ({
    resolvedLayoutMode: activeMode,
    radialCenterNodeId: activeMode === 'radial'
      ? (startIds[0] || firstNodeId || null)
      : null,
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
    updateRadialRingOverlay,
    estimateIntersections,
  }: ApplyFinalViewportParams) => {
    // Use more of the canvas (height + width) when fit leaves too much empty area.
    const graphBounds = activeMode === 'radial'
      ? cy.nodes().not('.outer-route-node').boundingBox()
      : cy.elements().boundingBox()
    const safeContainerWidth = chartContainer?.clientWidth || 1
    const safeContainerHeight = chartContainer?.clientHeight || 1
    const widthUsage = graphBounds.w / Math.max(safeContainerWidth, 1)
    const heightUsage = graphBounds.h / Math.max(safeContainerHeight, 1)
    const usage = Math.min(widthUsage, heightUsage)
    const targetUsage = activeMode === 'radial' ? 0.9 : 0.72
    if (usage < targetUsage) {
      const factor = Math.min(zoomBoostCap * (activeMode === 'radial' ? 1.36 : 1), targetUsage / Math.max(usage, 0.08))
      const boosted = Math.min(activeMode === 'radial' ? 2.7 : 2.2, cy.zoom() * factor)
      cy.zoom(boosted)
    }

    if (activeMode === 'radial') {
      ensureMinimumRenderedNodeSize(cy, isDenseGraph ? 20 : 24, 2.8)
    }

    // Keep fitted zoom for denser diagrams to avoid re-crowding after layout.
    cy.center()

    applyZoomLod(cy)
    setAllEdgesForceVisible(cy, Boolean(lockedNodeId))
    updateRadialRingOverlay()

    const radialIntersectionCount = estimateIntersections()
    return {
      radialIntersectionCount,
    }
  }

  return {
    resolveLayoutState,
    applyFinalViewportAndVisuals,
  }
}
