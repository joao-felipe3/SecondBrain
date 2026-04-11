type BindPertGraphEventsParams = {
  cy: any
  selectedNode: { value: any }
  lockedNodeId: { value: string | null }
  selectedNodeInsights: { value: any }
  nodes: any[]
  edges: any[]
  setAllEdgesForceVisible: (cy: any, value: boolean) => void
  buildNodeInsights: (nodeId: string, nodes: any[], edges: any[]) => void
  applyLockedFocusById: (cy: any, nodeId: string) => void
  emitNodeClick: (node: any) => void
  applyNeighborhoodFocus: (cy: any, node: any) => void
  showTooltip: (node: any, event: any) => void
  updateTooltipPosition: (event: any) => void
  clearGhosting: (cy: any) => void
  hideTooltip: () => void
  applyZoomLod: (cy: any) => void
  updateRadialRingOverlay: () => void
}

export const usePertGraphEventBindings = () => {
  const bindPertGraphEvents = ({
    cy,
    selectedNode,
    lockedNodeId,
    selectedNodeInsights,
    nodes,
    edges,
    setAllEdgesForceVisible,
    buildNodeInsights,
    applyLockedFocusById,
    emitNodeClick,
    applyNeighborhoodFocus,
    showTooltip,
    updateTooltipPosition,
    clearGhosting,
    hideTooltip,
    applyZoomLod,
    updateRadialRingOverlay,
  }: BindPertGraphEventsParams) => {
    cy.on('tap', 'node', (event: any) => {
      const dataNode = event?.target?.data('node') || null
      selectedNode.value = dataNode
      if (dataNode) {
        setAllEdgesForceVisible(cy, true)
        lockedNodeId.value = dataNode.id
        buildNodeInsights(dataNode.id, nodes, edges)
        applyLockedFocusById(cy, dataNode.id)
        emitNodeClick(dataNode)
      }
    })

    cy.on('mouseover', 'node', (event: any) => {
      if (lockedNodeId.value) return
      const node = event?.target
      applyNeighborhoodFocus(cy, node)
      selectedNode.value = node?.data('node') || null
      showTooltip(node, event)
      if (selectedNode.value?.id) buildNodeInsights(selectedNode.value.id, nodes, edges)
    })

    cy.on('mousemove', 'node', (event: any) => {
      updateTooltipPosition(event)
    })

    cy.on('mouseout', 'node', () => {
      if (lockedNodeId.value) {
        applyLockedFocusById(cy, lockedNodeId.value)
      } else {
        clearGhosting(cy)
      }
      hideTooltip()
    })

    cy.on('tap', (event: any) => {
      if (event?.target === cy) {
        setAllEdgesForceVisible(cy, false)
        selectedNode.value = null
        selectedNodeInsights.value = null
        lockedNodeId.value = null
        clearGhosting(cy)
      }
    })

    cy.on('zoom pan', () => {
      applyZoomLod(cy)
      updateRadialRingOverlay()
    })
  }

  return {
    bindPertGraphEvents,
  }
}
