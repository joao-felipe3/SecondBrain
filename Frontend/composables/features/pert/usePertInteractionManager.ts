export const usePertInteractionManager = () => {
  const clearGhosting = (cy: any) => {
    if (!cy) return
    cy.elements().removeClass('is-dimmed')
    cy.elements().removeClass('is-highlighted')
  }

  const setAllEdgesForceVisible = (cy: any, value: boolean) => {
    if (!cy) return

    const edges = cy.edges()
    if (!edges || edges.length === 0) return

    if (value) {
      edges.addClass('force-visible-edge')
      return
    }

    edges.removeClass('force-visible-edge')
  }

  const applyNeighborhoodFocus = (cy: any, node: any) => {
    if (!cy || !node) return
    const focus = node.closedNeighborhood().union(node.predecessors()).union(node.successors())
    cy.elements().addClass('is-dimmed')
    focus.removeClass('is-dimmed')
    focus.addClass('is-highlighted')
  }

  const applyLockedFocusById = (cy: any, nodeId: string) => {
    if (!cy) return
    const node = cy.$id(nodeId)
    if (!node || node.empty()) return
    applyNeighborhoodFocus(cy, node)
  }

  const applyZoomLod = (cy: any) => {
    if (!cy) return
    const zoom = cy.zoom()
    const allNodes = cy.nodes()
    allNodes.removeClass('no-label')
    allNodes.removeClass('short-label')

    if (zoom < 0.55) {
      allNodes.addClass('no-label')
      return
    }

    if (zoom < 0.9) {
      allNodes.addClass('no-label')
      const criticalNodes = cy.nodes('.critical-node')
      criticalNodes.removeClass('no-label')
      criticalNodes.addClass('short-label')
      allNodes.removeClass('show-slack')
      return
    }

    if (zoom >= 1.12) {
      allNodes.addClass('show-slack')
    } else {
      allNodes.removeClass('show-slack')
    }
  }

  return {
    clearGhosting,
    setAllEdgesForceVisible,
    applyNeighborhoodFocus,
    applyLockedFocusById,
    applyZoomLod,
  }
}
