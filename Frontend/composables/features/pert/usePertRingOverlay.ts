export type PertRingOverlay = {
  cx: number
  cy: number
  radii: number[]
  width: number
  height: number
}

export const usePertRingOverlay = () => {
  const createEmptyRingOverlay = (container: HTMLElement | null): PertRingOverlay => ({
    cx: 0,
    cy: 0,
    radii: [],
    width: container?.clientWidth || 100,
    height: container?.clientHeight || 100,
  })

  const computeRingOverlay = (
    cy: any,
    container: HTMLElement | null,
    resolvedLayoutMode: 'hierarchical' | 'radial',
  ): PertRingOverlay => {
    if (!cy || !container || resolvedLayoutMode !== 'radial') {
      return createEmptyRingOverlay(container)
    }

    const nodes = cy.nodes().not('.outer-route-node')
    if (!nodes || nodes.length === 0) {
      return createEmptyRingOverlay(container)
    }

    const bounds = nodes.boundingBox()
    const centerPos = {
      x: Number(bounds?.x1 || 0) + Number(bounds?.w || 0) / 2,
      y: Number(bounds?.y1 || 0) + Number(bounds?.h || 0) / 2,
    }
    const pan = cy.pan()
    const zoom = Number(cy.zoom() || 1)
    const renderedCenter = {
      x: centerPos.x * zoom + Number(pan?.x || 0),
      y: centerPos.y * zoom + Number(pan?.y || 0),
    }

    const distancesByLayer = new Map<number, number[]>()
    const allDistances: number[] = []
    nodes.forEach((node: any) => {
      const pos = node.position()
      const dist = Math.hypot(
        Number(pos?.x || 0) - Number(centerPos?.x || 0),
        Number(pos?.y || 0) - Number(centerPos?.y || 0),
      )

      if (!Number.isFinite(dist) || dist < 1) return
      allDistances.push(dist)

      const layer = Number(node.data('layer') || 0)
      if (!Number.isFinite(layer) || layer <= 0) return

      const bucket = distancesByLayer.get(layer) || []
      bucket.push(dist)
      distancesByLayer.set(layer, bucket)
    })

    const sortedLayers = Array.from(distancesByLayer.keys()).sort((a, b) => a - b)
    const modelRadii = sortedLayers.map((layer) => {
      const values = [...(distancesByLayer.get(layer) || [])].sort((a, b) => a - b)
      if (!values.length) return 0
      const mid = Math.floor(values.length / 2)
      return values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid]
    })

    // Fallback for graphs where computed levels collapse to a single layer.
    if (modelRadii.length < 2 && allDistances.length >= 2) {
      const sortedAll = [...allDistances].sort((a, b) => a - b)
      const fallbackRingCount = Math.max(2, Math.min(8, Math.round(Math.sqrt(sortedAll.length))))
      for (let i = 1; i <= fallbackRingCount; i += 1) {
        const q = i / (fallbackRingCount + 1)
        const idx = Math.min(sortedAll.length - 1, Math.max(0, Math.floor((sortedAll.length - 1) * q)))
        modelRadii.push(sortedAll[idx])
      }
    }

    let lastRadius = 0
    const minGapPx = 16
    const maxCanvasRadius = Math.max(container.clientWidth, container.clientHeight) * 1.35
    const renderedRadii = modelRadii
      .map((radius) => radius * zoom)
      .filter((radius) => Number.isFinite(radius) && radius > 6)
      .map((radius) => {
        const normalized = Math.max(lastRadius + minGapPx, radius)
        lastRadius = normalized
        return normalized
      })
      .filter((radius) => radius <= maxCanvasRadius)

    if (renderedRadii.length < 2 && allDistances.length > 0) {
      const maxDist = Math.max(...allDistances) * zoom
      const minDist = Math.max(18, maxDist * 0.3)
      const midDist = Math.max(minDist + minGapPx, maxDist * 0.62)
      const outerDist = Math.max(midDist + minGapPx, maxDist * 0.9)
      renderedRadii.splice(0, renderedRadii.length, ...[minDist, midDist, outerDist].filter((r) => r <= maxCanvasRadius))
    }

    return {
      cx: Number(renderedCenter?.x || container.clientWidth / 2),
      cy: Number(renderedCenter?.y || container.clientHeight / 2),
      radii: renderedRadii,
      width: container.clientWidth || 100,
      height: container.clientHeight || 100,
    }
  }

  return {
    createEmptyRingOverlay,
    computeRingOverlay,
  }
}
