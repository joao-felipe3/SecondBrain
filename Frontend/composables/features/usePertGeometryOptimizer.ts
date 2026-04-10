export const usePertGeometryOptimizer = () => {
  const reorderRowsByBarycenter = (cy: any) => {
    if (!cy) return

    const allNodes = cy.nodes().not('.outer-route-node')
    if (!allNodes || allNodes.length === 0) return

    const byLayer = new Map<number, any[]>()
    allNodes.forEach((node: any) => {
      const layer = Number(node.data('layer') || 0)
      if (!byLayer.has(layer)) byLayer.set(layer, [])
      byLayer.get(layer)?.push(node)
    })

    const layers = Array.from(byLayer.keys()).sort((a, b) => a - b)
    if (layers.length < 2) return

    const spacing = 84

    const assignXByOrder = (layerNodes: any[], sortedNodes: any[]) => {
      const centerX = layerNodes.reduce((sum: number, node: any) => sum + Number(node.position()?.x || 0), 0) / Math.max(layerNodes.length, 1)
      sortedNodes.forEach((node, idx) => {
        const xOffset = (idx - (sortedNodes.length - 1) / 2) * spacing
        const y = Number(node.position()?.y || 0)
        node.position({ x: centerX + xOffset, y })
      })
    }

    // Top-down sweep: align each layer with predecessor barycenter.
    for (let i = 1; i < layers.length; i += 1) {
      const layer = layers[i]
      const layerNodes = byLayer.get(layer) || []
      if (layerNodes.length <= 1) continue

      const sorted = [...layerNodes].sort((a, b) => {
        const predsA = a.incomers('node')
        const predsB = b.incomers('node')
        const baryA = !predsA || predsA.length === 0
          ? Number(a.position()?.x || 0)
          : predsA.reduce((sum: number, p: any) => sum + Number(p.position()?.x || 0), 0) / predsA.length
        const baryB = !predsB || predsB.length === 0
          ? Number(b.position()?.x || 0)
          : predsB.reduce((sum: number, p: any) => sum + Number(p.position()?.x || 0), 0) / predsB.length
        return baryA - baryB
      })

      assignXByOrder(layerNodes, sorted)
    }

    // Bottom-up sweep: refine order with successor barycenter.
    for (let i = layers.length - 2; i >= 0; i -= 1) {
      const layer = layers[i]
      const layerNodes = byLayer.get(layer) || []
      if (layerNodes.length <= 1) continue

      const sorted = [...layerNodes].sort((a, b) => {
        const succA = a.outgoers('node')
        const succB = b.outgoers('node')
        const baryA = !succA || succA.length === 0
          ? Number(a.position()?.x || 0)
          : succA.reduce((sum: number, s: any) => sum + Number(s.position()?.x || 0), 0) / succA.length
        const baryB = !succB || succB.length === 0
          ? Number(b.position()?.x || 0)
          : succB.reduce((sum: number, s: any) => sum + Number(s.position()?.x || 0), 0) / succB.length
        return baryA - baryB
      })

      assignXByOrder(layerNodes, sorted)
    }
  }

  const rebalanceCrowdedRows = (
    cy: any,
    maxNodesPerRow = 8,
    subRowSpacing = 78,
    colSpacing = 76,
  ) => {
    if (!cy) return

    const allNodes = cy.nodes().not('.outer-route-node')
    if (!allNodes || allNodes.length === 0) return

    const rowTolerance = 26
    const rows: Array<{ y: number; nodes: any[] }> = []

    allNodes.forEach((node: any) => {
      const y = Number(node.position()?.y || 0)
      let row = rows.find((item) => Math.abs(item.y - y) <= rowTolerance)
      if (!row) {
        row = { y, nodes: [] }
        rows.push(row)
      }
      row.nodes.push(node)
    })

    rows.sort((a, b) => a.y - b.y)

    for (const row of rows) {
      if (row.nodes.length <= maxNodesPerRow) continue

      const sortedByX = [...row.nodes].sort((a, b) => Number(a.position()?.x || 0) - Number(b.position()?.x || 0))
      const subRowCount = Math.ceil(sortedByX.length / maxNodesPerRow)
      const rowCenterX = sortedByX.reduce((sum: number, node: any) => sum + Number(node.position()?.x || 0), 0) / sortedByX.length

      sortedByX.forEach((node, index) => {
        const subRow = Math.floor(index / maxNodesPerRow)
        const col = index % maxNodesPerRow
        const colsInThisRow = Math.min(maxNodesPerRow, sortedByX.length - subRow * maxNodesPerRow)
        const yOffset = (subRow - (subRowCount - 1) / 2) * subRowSpacing

        const xOffset = (col - (colsInThisRow - 1) / 2) * colSpacing
        node.position({
          x: rowCenterX + xOffset,
          y: row.y + yOffset,
        })
      })
    }
  }

  const separateNodeOverlaps = (
    cy: any,
    minGap = 10,
    iterations = 6,
    verticalStrength = 0.55,
  ) => {
    if (!cy) return

    const nodes = cy.nodes().not('.outer-route-node').toArray()
    if (!nodes || nodes.length < 2) return

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let moved = false

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]
          const b = nodes[j]
          const aPos = a.position()
          const bPos = b.position()

          let dx = Number(bPos?.x || 0) - Number(aPos?.x || 0)
          let dy = Number(bPos?.y || 0) - Number(aPos?.y || 0)
          let dist = Math.hypot(dx, dy)

          if (dist < 0.001) {
            dx = (Math.random() - 0.5) * 0.2
            dy = (Math.random() - 0.5) * 0.2
            dist = Math.hypot(dx, dy)
          }

          const aRadius = Number(a.data('visualSize') || 52) / 2
          const bRadius = Number(b.data('visualSize') || 52) / 2
          const minDist = aRadius + bRadius + minGap
          if (dist >= minDist) continue

          const overlap = (minDist - dist) / 2
          const ux = dx / dist
          const uy = dy / dist
          const yPush = overlap * verticalStrength

          a.position({
            x: Number(aPos?.x || 0) - ux * overlap,
            y: Number(aPos?.y || 0) - uy * yPush,
          })
          b.position({
            x: Number(bPos?.x || 0) + ux * overlap,
            y: Number(bPos?.y || 0) + uy * yPush,
          })

          moved = true
        }
      }

      if (!moved) break
    }
  }

  const normalizeWideAspect = (cy: any, maxAspectRatio = 1.9, minCompression = 0.58) => {
    if (!cy) return
    const nodes = cy.nodes().not('.outer-route-node')
    if (!nodes || nodes.length === 0) return

    const bounds = nodes.boundingBox()
    const width = Math.max(1, Number(bounds.w || 1))
    const height = Math.max(1, Number(bounds.h || 1))
    const ratio = width / height
    if (ratio <= maxAspectRatio) return

    const cx = Number(bounds.x1 || 0) + width / 2
    const cyCenter = Number(bounds.y1 || 0) + height / 2
    const compressX = Math.max(minCompression, maxAspectRatio / ratio)
    const expandY = Math.min(1.7, 1 / compressX)

    nodes.forEach((node: any) => {
      const pos = node.position()
      const nx = cx + (Number(pos?.x || 0) - cx) * compressX
      const ny = cyCenter + (Number(pos?.y || 0) - cyCenter) * expandY
      node.position({ x: nx, y: ny })
    })
  }

  const ensureMinimumRenderedNodeSize = (cy: any, minRenderedPx = 22, maxZoom = 2.8) => {
    if (!cy) return

    const nodes = cy.nodes().not('.outer-route-node')
    if (!nodes || nodes.length === 0) return

    const sizes = nodes
      .toArray()
      .map((node: any) => Number(node.data('visualSize') || 52))
      .filter((size: number) => Number.isFinite(size) && size > 0)
      .sort((a: number, b: number) => a - b)

    if (!sizes.length) return

    const pivotIdx = Math.max(0, Math.floor((sizes.length - 1) * 0.35))
    const pivotSize = Math.max(1, sizes[pivotIdx])
    const requiredZoom = minRenderedPx / pivotSize
    const currentZoom = Number(cy.zoom() || 1)

    if (!Number.isFinite(requiredZoom) || requiredZoom <= currentZoom) return

    cy.zoom(Math.min(maxZoom, requiredZoom))
  }

  return {
    reorderRowsByBarycenter,
    rebalanceCrowdedRows,
    separateNodeOverlaps,
    normalizeWideAspect,
    ensureMinimumRenderedNodeSize,
  }
}
