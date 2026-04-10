type PertResolvedLayoutMode = 'hierarchical' | 'radial'

type ApplyRenderFailureStateParams = {
  setResolvedLayoutMode: (mode: PertResolvedLayoutMode) => void
  setRadialCenterNodeId: (nodeId: string | null) => void
  clearRadialRingOverlay: () => void
  setRenderError: (message: string) => void
  message: string
}

export const usePertRenderFailureState = () => {
  const applyRenderFailureState = ({
    setResolvedLayoutMode,
    setRadialCenterNodeId,
    clearRadialRingOverlay,
    setRenderError,
    message,
  }: ApplyRenderFailureStateParams) => {
    setResolvedLayoutMode('hierarchical')
    setRadialCenterNodeId(null)
    clearRadialRingOverlay()
    setRenderError(message)
  }

  return {
    applyRenderFailureState,
  }
}
