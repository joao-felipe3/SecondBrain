type PertResolvedLayoutMode = 'hierarchical' | 'force'

type ApplyRenderFailureStateParams = {
  setResolvedLayoutMode: (mode: PertResolvedLayoutMode) => void
  setRenderError: (message: string) => void
  message: string
}

export const usePertRenderFailureState = () => {
  const applyRenderFailureState = ({
    setResolvedLayoutMode,
    setRenderError,
    message,
  }: ApplyRenderFailureStateParams) => {
    setResolvedLayoutMode('hierarchical')
    setRenderError(message)
  }

  return {
    applyRenderFailureState,
  }
}
