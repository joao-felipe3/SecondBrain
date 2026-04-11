type PertResolvedLayoutMode = 'hierarchical' | 'force'

type HandleEmptyGraphParams = {
  cy: any
  hasEdges: boolean
  isTokenCurrent: () => boolean
  setResolvedLayoutMode: (mode: PertResolvedLayoutMode) => void
}

export const usePertEmptyGraphHandler = () => {
  const handleEmptyGraph = ({
    cy,
    hasEdges,
    isTokenCurrent,
    setResolvedLayoutMode,
  }: HandleEmptyGraphParams) => {
    if (hasEdges) return false

    setResolvedLayoutMode('hierarchical')

    cy.layout({
      name: 'grid',
      fit: false,
      avoidOverlap: true,
      spacingFactor: 1.2,
      padding: 26,
      animate: false,
    }).run()

    setTimeout(() => {
      if (!cy || !isTokenCurrent()) return
      cy.resize()
      cy.fit(undefined, 28)
    }, 60)

    return true
  }

  return {
    handleEmptyGraph,
  }
}
