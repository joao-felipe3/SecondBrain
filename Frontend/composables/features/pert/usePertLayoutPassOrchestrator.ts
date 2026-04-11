type PertResolvedLayoutMode = 'hierarchical' | 'force'

type ApplyLayoutPassParams = {
  mode: PertResolvedLayoutMode
  startIds: string[]
  levelById: Map<string, number>
  postProcess: (mode: PertResolvedLayoutMode) => void
  updateEdgeRouting: (force?: boolean) => void
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
    updateEdgeRouting,
    optimizeLayoutEdgeIntersections,
    fitGraph,
  }: ApplyLayoutPassParams) => {
    postProcess(mode)

    updateEdgeRouting(true)

    optimizeLayoutEdgeIntersections(mode, startIds, levelById)
    fitGraph()
  }

  return {
    applyLayoutPass,
  }
}
