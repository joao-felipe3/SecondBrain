type PertResolvedLayoutMode = 'hierarchical' | 'radial'

type ApplyLayoutPassParams = {
  mode: PertResolvedLayoutMode
  startIds: string[]
  levelById: Map<string, number>
  postProcess: (mode: PertResolvedLayoutMode) => void
  updateOuterContourRouteNodes: (force?: boolean) => void
  updateRadialEdgeRouting: (force?: boolean) => void
  optimizeLayoutEdgeIntersections: (
    mode: PertResolvedLayoutMode,
    startIds: string[],
    levelById: Map<string, number>,
  ) => void
  fitGraph: () => void
}

export const usePertLayoutPassOrchestrator = () => {
  const applyLayoutPass = ({
    mode,
    startIds,
    levelById,
    postProcess,
    updateOuterContourRouteNodes,
    updateRadialEdgeRouting,
    optimizeLayoutEdgeIntersections,
    fitGraph,
  }: ApplyLayoutPassParams) => {
    postProcess(mode)

    if (mode === 'radial') {
      updateOuterContourRouteNodes(true)
      updateRadialEdgeRouting(true)
    }

    optimizeLayoutEdgeIntersections(mode, startIds, levelById)
    fitGraph()
  }

  return {
    applyLayoutPass,
  }
}
