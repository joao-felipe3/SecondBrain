type PertLayoutMode = 'auto' | 'hierarchical' | 'force'
type PertResolvedLayoutMode = Exclude<PertLayoutMode, 'auto'>

type RunLayoutFn = (
  mode: PertResolvedLayoutMode,
) => boolean

type RunInitialLayoutFallbackParams = {
  activeMode: PertResolvedLayoutMode
  requestedLayoutMode: PertLayoutMode
  runLayout: RunLayoutFn
}

type RunRecoveryParams = {
  activeMode: PertResolvedLayoutMode
  hasInvalidGeometry: () => boolean
  runLayout: RunLayoutFn
  onModeApplied: (mode: PertResolvedLayoutMode) => void
}

export const usePertLayoutFallbacks = () => {
  const runInitialLayoutFallback = ({
    activeMode,
    requestedLayoutMode,
    runLayout,
  }: RunInitialLayoutFallbackParams) => {
    let mode = activeMode

    if (runLayout(mode)) {
      return {
        ok: true,
        mode,
        notice: null as string | null,
      }
    }

    const fallbackOrder: PertResolvedLayoutMode[] = mode === 'force'
      ? ['hierarchical']
      : ['force']

    const fallbackMode = fallbackOrder.find((candidate) => runLayout(candidate))
    if (!fallbackMode) {
      return {
        ok: false,
        mode: 'hierarchical' as PertResolvedLayoutMode,
        notice: null as string | null,
      }
    }

    mode = fallbackMode

    const notice = requestedLayoutMode === 'force' && fallbackMode !== 'force'
        ? 'Layout de forca indisponivel neste conjunto; exibindo modo alternativo automaticamente.'
        : requestedLayoutMode === 'hierarchical' && fallbackMode !== 'hierarchical'
          ? 'Hierarquico indisponivel neste conjunto; exibindo modo alternativo automaticamente.'
          : null

    return {
      ok: true,
      mode,
      notice,
    }
  }

  const runRecoveryFallbacks = ({
    activeMode,
    hasInvalidGeometry,
    runLayout,
    onModeApplied,
  }: RunRecoveryParams) => {
    let mode = activeMode
    let notice: string | null = null

    if (hasInvalidGeometry()) {
      if (mode === 'force' && runLayout('hierarchical')) {
        mode = 'hierarchical'
        notice = 'Layout de forca instavel neste conjunto; exibindo hierarquico automaticamente.'
        onModeApplied('hierarchical')
      } else if (mode === 'hierarchical' && runLayout('force')) {
        mode = 'force'
        notice = 'Layout hierarquico instavel neste conjunto; exibindo forca automaticamente.'
        onModeApplied('force')
      }
    }

    return {
      mode,
      notice,
    }
  }

  return {
    runInitialLayoutFallback,
    runRecoveryFallbacks,
  }
}
