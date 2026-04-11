type InitializePertGraphParams = {
  chartContainer: HTMLElement | null
  currentFactory: any
  dagreRegistered: boolean
  ensureFactory: (currentFactory: any) => Promise<any>
  ensureDagreRegistration: (factory: any, dagreAlreadyRegistered: boolean) => Promise<boolean>
  createInstance: (factory: any, container: HTMLElement) => any
  bindPertGraphEvents: (params: any) => void
  bindEventsParams: any
  createPertResizeObserver: (params: {
    getCy: () => any
    getContainer: () => HTMLElement | null
    getWasContainerHidden: () => boolean
    setWasContainerHidden: (value: boolean) => void
    onContainerRevealed: () => void
    onRegularResize: (cy: any) => void
  }) => ResizeObserver
  getWasContainerHidden: () => boolean
  setWasContainerHidden: (value: boolean) => void
  onContainerRevealed: () => void
  onRegularResize: (cy: any) => void
}

type InitializePertGraphResult = {
  cy: any
  cytoscapeFactory: any
  dagreRegistered: boolean
  resizeObserver: ResizeObserver
} | null

export const usePertGraphInitializer = () => {
  const initializePertGraph = async ({
    chartContainer,
    currentFactory,
    dagreRegistered,
    ensureFactory,
    ensureDagreRegistration,
    createInstance,
    bindPertGraphEvents,
    bindEventsParams,
    createPertResizeObserver,
    getWasContainerHidden,
    setWasContainerHidden,
    onContainerRevealed,
    onRegularResize,
  }: InitializePertGraphParams): Promise<InitializePertGraphResult> => {
    if (!chartContainer) return null

    const cytoscapeFactory = await ensureFactory(currentFactory)
    const nextDagreRegistered = await ensureDagreRegistration(cytoscapeFactory, dagreRegistered)
    const cy = createInstance(cytoscapeFactory, chartContainer)

    bindPertGraphEvents({
      cy,
      ...bindEventsParams,
    })

    const resizeObserver = createPertResizeObserver({
      getCy: () => cy,
      getContainer: () => chartContainer,
      getWasContainerHidden,
      setWasContainerHidden,
      onContainerRevealed,
      onRegularResize,
    })
    resizeObserver.observe(chartContainer)

    return {
      cy,
      cytoscapeFactory,
      dagreRegistered: nextDagreRegistered,
      resizeObserver,
    }
  }

  return {
    initializePertGraph,
  }
}
