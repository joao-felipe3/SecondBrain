type PertLayoutMode = 'auto' | 'hierarchical' | 'radial'
type PertResolvedLayoutMode = Exclude<PertLayoutMode, 'auto'>
type PertRadialVariant = 'preset' | 'concentric' | 'circle'

type RunLayoutFn = (
  mode: PertResolvedLayoutMode,
  radialVariant?: PertRadialVariant,
) => boolean

type RunInitialLayoutFallbackParams = {
  activeMode: PertResolvedLayoutMode
  requestedLayoutMode: PertLayoutMode
  runLayout: RunLayoutFn
}

type RunRadialRecoveryParams = {
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

    if (mode === 'radial' && runLayout('radial', 'concentric')) {
      mode = 'radial'
      return {
        ok: true,
        mode,
        notice: 'Radial alternativo ativo para manter estabilidade.' as string | null,
      }
    }

    if (mode === 'radial' && runLayout('radial', 'circle')) {
      mode = 'radial'
      return {
        ok: true,
        mode,
        notice: 'Radial simplificado ativo para manter estabilidade.' as string | null,
      }
    }

    const fallbackMode: PertResolvedLayoutMode = mode === 'radial' ? 'hierarchical' : 'radial'
    if (!runLayout(fallbackMode)) {
      return {
        ok: false,
        mode: 'hierarchical' as PertResolvedLayoutMode,
        notice: null as string | null,
      }
    }

    mode = fallbackMode

    const notice = fallbackMode === 'hierarchical' && requestedLayoutMode === 'radial'
      ? 'Radial indisponivel neste conjunto; exibindo hierarquico automaticamente.'
      : null

    return {
      ok: true,
      mode,
      notice,
    }
  }

  const runRadialRecoveryFallbacks = ({
    activeMode,
    hasInvalidGeometry,
    runLayout,
    onModeApplied,
  }: RunRadialRecoveryParams) => {
    let mode = activeMode
    let notice: string | null = null

    if (mode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('radial', 'concentric')) {
        mode = 'radial'
        notice = 'Radial alternativo ativo para manter estabilidade.'
        onModeApplied('radial')
      }
    }

    if (mode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('radial', 'circle')) {
        mode = 'radial'
        notice = 'Radial simplificado ativo para manter estabilidade.'
        onModeApplied('radial')
      }
    }

    if (mode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('hierarchical')) {
        mode = 'hierarchical'
        notice = 'Radial instavel neste conjunto; exibindo hierarquico automaticamente.'
        onModeApplied('hierarchical')
      }
    }

    return {
      mode,
      notice,
    }
  }

  return {
    runInitialLayoutFallback,
    runRadialRecoveryFallbacks,
  }
}
