import type { PertDiagramEdge } from '~/composables/features/usePertDiagramData'

type PertResolvedLayoutMode = 'hierarchical' | 'radial'

type UsePertRouteOptimizationParams = {
  getCy: () => any
  getResolvedLayoutMode: () => PertResolvedLayoutMode
  getChartContainer: () => HTMLElement | null
  getEdges: () => PertDiagramEdge[]
  radialEdgeIntersectionThreshold?: number
}

type Segment = {
  x1: number
  y1: number
  x2: number
  y2: number
  sourceId: string
  targetId: string
  edgeId: string
}

export const usePertRouteOptimization = ({
  getCy,
  getResolvedLayoutMode,
  getChartContainer,
  getEdges,
  radialEdgeIntersectionThreshold = 1,
}: UsePertRouteOptimizationParams) => {
  const updateRadialEdgeRouting = (force = false) => {
    const cy = getCy()
    if (!cy || (!force && getResolvedLayoutMode() !== 'radial')) return

    const nodes = cy.nodes().not('.outer-route-node')
    if (!nodes || nodes.length === 0) return

    const bounds = nodes.boundingBox()
    const centerX = Number(bounds?.x1 || 0) + Number(bounds?.w || 0) / 2
    const centerY = Number(bounds?.y1 || 0) + Number(bounds?.h || 0) / 2
    const container = getChartContainer()
    const containerRadius = container
      ? Math.max(40, Math.min(container.clientWidth, container.clientHeight) * 0.48)
      : Math.max(40, Math.min(Number(bounds?.w || 0), Number(bounds?.h || 0)) * 0.5)

    cy.edges('.radial-route-edge').forEach((edge: any) => {
      const source = edge.source()
      const target = edge.target()
      if (!source || !target || source.empty() || target.empty()) return

      const sourcePos = source.position()
      const targetPos = target.position()
      const sx = Number(sourcePos?.x || 0)
      const sy = Number(sourcePos?.y || 0)
      const tx = Number(targetPos?.x || 0)
      const ty = Number(targetPos?.y || 0)

      const dx = tx - sx
      const dy = ty - sy
      const chord = Math.hypot(dx, dy)
      if (!Number.isFinite(chord) || chord < 1) return

      const nx = -dy / chord
      const ny = dx / chord
      const midpointX = (sx + tx) / 2
      const midpointY = (sy + ty) / 2
      const sourceRadius = Math.hypot(sx - centerX, sy - centerY)
      const targetRadius = Math.hypot(tx - centerX, ty - centerY)
      const midRadius = Math.hypot(midpointX - centerX, midpointY - centerY)
      const toCenterX = midpointX - centerX
      const toCenterY = midpointY - centerY
      const outwardScore = nx * toCenterX + ny * toCenterY

      const sectorDelta = Number(edge.data('sectorDelta') || 1)
      const fanOffset = Number(edge.data('fanOffset') || 0)
      const fanAbs = Math.max(0, Math.min(4, Math.abs(fanOffset)))
      const sectorHint = Number(edge.data('sectorHint') || 0)
      const midCenterRatio = Math.max(0, Math.min(1, midRadius / Math.max(containerRadius, 1)))
      const centerPull = 1 - midCenterRatio
      const isHubEdge = sourceRadius < containerRadius * 0.34 || targetRadius < containerRadius * 0.34
      const isInterSector = sectorDelta >= 1
      const sideHint = sectorHint % 2 === 0 ? 1 : -1
      const sign = Math.abs(outwardScore) < 0.16 ? sideHint : (outwardScore >= 0 ? 1 : -1)
      const interSectorBoost = Math.max(0, sectorDelta - 1) * 38
      const outerBoost = centerPull * containerRadius * 1.4 + (isHubEdge ? containerRadius * 0.62 : 0) + (isInterSector ? containerRadius * 0.24 : 0)

      const curveMagnitude = Math.min(containerRadius * 1.95, 92 + interSectorBoost + fanAbs * 22 + outerBoost)
      const radialCpDistance = sign * curveMagnitude

      const outerEndpointBias = targetRadius >= sourceRadius ? 0.08 : -0.08
      const weightBase = sectorDelta >= 3
        ? 0.9
        : sectorDelta >= 2
          ? 0.84
          : 0.74
      const weightShift = outerEndpointBias + centerPull * 0.22 + (isHubEdge ? 0.12 : 0) + Math.max(-0.08, Math.min(0.08, fanOffset * 0.03))
      const radialCpWeight = Math.max(0.6, Math.min(0.98, weightBase + weightShift))

      let radialCpDistances = `${Math.round(radialCpDistance)}`
      let radialCpWeights = `${radialCpWeight.toFixed(2)}`
      if (isInterSector || isHubEdge || centerPull > 0.55) {
        const secondMagnitude = Math.min(containerRadius * 2.25, curveMagnitude * (1.42 + Math.min(0.28, centerPull * 0.36)))
        const firstMagnitude = Math.max(24, Math.min(secondMagnitude - 14, curveMagnitude * 0.82))
        const firstWeight = Math.max(0.12, Math.min(0.36, 0.22 + centerPull * 0.1))
        const secondWeight = Math.max(0.72, Math.min(0.96, 0.84 + (isHubEdge ? 0.06 : 0) + outerEndpointBias * 0.35))
        radialCpDistances = `${Math.round(sign * firstMagnitude)} ${Math.round(sign * secondMagnitude)}`
        radialCpWeights = `${firstWeight.toFixed(2)} ${secondWeight.toFixed(2)}`
      }

      edge.data('radialCpDistance', radialCpDistance)
      edge.data('radialCpWeight', radialCpWeight)
      edge.data('radialCpDistances', radialCpDistances)
      edge.data('radialCpWeights', radialCpWeights)
    })
  }

  const updateOuterContourRouteNodes = (force = false) => {
    const cy = getCy()
    if (!cy || (!force && getResolvedLayoutMode() !== 'radial')) return

    const routeNodes = cy.nodes('.outer-route-node')
    if (!routeNodes || routeNodes.length === 0) return

    const realNodes = cy.nodes().not('.outer-route-node')
    if (!realNodes || realNodes.length === 0) return

    const normalizeAngle = (angle: number) => {
      let value = angle
      while (value < 0) value += Math.PI * 2
      while (value >= Math.PI * 2) value -= Math.PI * 2
      return value
    }

    const bounds = realNodes.boundingBox()
    const centerX = Number(bounds?.x1 || 0) + Number(bounds?.w || 0) / 2
    const centerY = Number(bounds?.y1 || 0) + Number(bounds?.h || 0) / 2

    let maxRadius = 1
    realNodes.forEach((node: any) => {
      const pos = node.position()
      const radius = Math.hypot(Number(pos?.x || 0) - centerX, Number(pos?.y || 0) - centerY)
      if (Number.isFinite(radius)) maxRadius = Math.max(maxRadius, radius)
    })

    const outerBaseRadius = Math.max(maxRadius + 56, maxRadius * 1.24)

    routeNodes.forEach((routeNode: any) => {
      const sourceId = String(routeNode.data('routeSource') || '')
      const targetId = String(routeNode.data('routeTarget') || '')
      if (!sourceId || !targetId) return

      const sourceNode = cy.$id(sourceId)
      const targetNode = cy.$id(targetId)
      if (!sourceNode || !targetNode || sourceNode.empty() || targetNode.empty()) return

      const sourcePos = sourceNode.position()
      const targetPos = targetNode.position()
      const sourceAngle = normalizeAngle(Math.atan2(Number(sourcePos?.y || 0) - centerY, Number(sourcePos?.x || 0) - centerX))
      const targetAngle = normalizeAngle(Math.atan2(Number(targetPos?.y || 0) - centerY, Number(targetPos?.x || 0) - centerX))

      const routeSide = Number(routeNode.data('routeSide') || 1) >= 0 ? 1 : -1
      let arc = targetAngle - sourceAngle
      while (arc <= -Math.PI) arc += Math.PI * 2
      while (arc > Math.PI) arc -= Math.PI * 2
      if (routeSide > 0 && arc < 0) arc += Math.PI * 2
      if (routeSide < 0 && arc > 0) arc -= Math.PI * 2

      if (Math.abs(arc) < 0.58) arc += routeSide * 0.74

      const routeRole = String(routeNode.data('routeRole') || 'mid')
      const routeLane = Number(routeNode.data('routeLane') || 0)
      const laneBias = Math.max(-6, Math.min(6, routeLane)) * 0.03
      const sourceAnchorAngle = normalizeAngle(sourceAngle + routeSide * (0.22 + laneBias))
      const targetAnchorAngle = normalizeAngle(targetAngle - routeSide * (0.22 + laneBias))
      const routeAngle = routeRole === 'source'
        ? sourceAnchorAngle
        : routeRole === 'target'
          ? targetAnchorAngle
          : normalizeAngle(sourceAngle + arc * 0.5 + routeSide * 0.16)
      const laneOffset = Math.max(-4, Math.min(4, routeLane)) * 14
      const roleRadiusBoost = routeRole === 'mid' ? 34 : 12
      const radius = outerBaseRadius + laneOffset + roleRadiusBoost

      routeNode.unlock()
      routeNode.position({
        x: centerX + Math.cos(routeAngle) * radius,
        y: centerY + Math.sin(routeAngle) * radius,
      })
      routeNode.lock()
    })
  }

  const optimizeLayoutEdgeIntersections = (
    mode: PertResolvedLayoutMode,
    startIds: string[],
    levelById: Map<string, number>,
  ) => {
    const cy = getCy()
    if (!cy) return

    const edgeSelector = mode === 'radial' ? '.radial-route-edge' : '.hierarchical-route-edge'
    const routedEdges = cy.edges(edgeSelector)
      .not('.suppressed-edge')
      .not('.outer-route-edge')
    if (!routedEdges || routedEdges.length === 0) return

    routedEdges.removeClass('routing-hidden-edge')

    const edgeByLogicalId = new Map<string, any>()
    routedEdges.forEach((edge: any) => {
      const logicalId = String(edge.data('edge')?.id || edge.id())
      if (!edgeByLogicalId.has(logicalId)) {
        edgeByLogicalId.set(logicalId, edge)
      }
    })

    if (edgeByLogicalId.size === 0) return

    const outgoingBySource = new Map<string, PertDiagramEdge[]>()
    for (const edge of getEdges()) {
      const bucket = outgoingBySource.get(edge.source) || []
      bucket.push(edge)
      outgoingBySource.set(edge.source, bucket)
    }

    const orderedEdgeIds: string[] = []
    const addedEdgeIds = new Set<string>()
    const visitedNodes = new Set<string>()
    const queue: string[] = []

    for (const id of startIds) {
      if (!visitedNodes.has(id)) {
        visitedNodes.add(id)
        queue.push(id)
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift() as string
      const outgoing = [...(outgoingBySource.get(nodeId) || [])]
        .sort((a, b) => {
          const la = levelById.get(a.target) || 0
          const lb = levelById.get(b.target) || 0
          if (la !== lb) return la - lb
          return a.id.localeCompare(b.id)
        })

      for (const edge of outgoing) {
        if (edgeByLogicalId.has(edge.id) && !addedEdgeIds.has(edge.id)) {
          orderedEdgeIds.push(edge.id)
          addedEdgeIds.add(edge.id)
        }

        if (!visitedNodes.has(edge.target)) {
          visitedNodes.add(edge.target)
          queue.push(edge.target)
        }
      }
    }

    const remainingIds = Array.from(edgeByLogicalId.keys())
      .filter((id) => !addedEdgeIds.has(id))
      .sort((a, b) => {
        const edgeA = edgeByLogicalId.get(a)
        const edgeB = edgeByLogicalId.get(b)
        const sourceA = String(edgeA?.data('source') || '')
        const sourceB = String(edgeB?.data('source') || '')
        const targetA = String(edgeA?.data('target') || '')
        const targetB = String(edgeB?.data('target') || '')
        const levelA = levelById.get(targetA) || levelById.get(sourceA) || 0
        const levelB = levelById.get(targetB) || levelById.get(sourceB) || 0
        if (levelA !== levelB) return levelA - levelB
        return a.localeCompare(b)
      })

    orderedEdgeIds.push(...remainingIds)

    const eps = 0.0001
    const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const onSegment = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      cx >= Math.min(ax, bx) - eps &&
      cx <= Math.max(ax, bx) + eps &&
      cy >= Math.min(ay, by) - eps &&
      cy <= Math.max(ay, by) + eps
    const segmentsIntersect = (a: Segment, b: Segment) => {
      const o1 = orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1)
      const o2 = orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2)
      const o3 = orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1)
      const o4 = orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2)

      if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
        return true
      }

      if (Math.abs(o1) <= eps && onSegment(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1)) return true
      if (Math.abs(o2) <= eps && onSegment(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2)) return true
      if (Math.abs(o3) <= eps && onSegment(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1)) return true
      if (Math.abs(o4) <= eps && onSegment(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2)) return true
      return false
    }

    const toSegments = (
      edge: any,
      logicalId: string,
      distancesText: string,
      weightsText: string,
    ): Segment[] => {
      const source = edge.source()
      const target = edge.target()
      if (!source || !target || source.empty() || target.empty()) return []

      const sourceId = String(source.id())
      const targetId = String(target.id())
      const sourcePos = source.position()
      const targetPos = target.position()
      const sx = Number(sourcePos?.x || 0)
      const sy = Number(sourcePos?.y || 0)
      const tx = Number(targetPos?.x || 0)
      const ty = Number(targetPos?.y || 0)

      const dx = tx - sx
      const dy = ty - sy
      const chord = Math.hypot(dx, dy)
      const nx = chord > 0 ? -dy / chord : 0
      const ny = chord > 0 ? dx / chord : 0

      const distances = String(distancesText || '0')
        .trim()
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
      const weights = String(weightsText || '0.5')
        .trim()
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))

      const points: Array<{ x: number; y: number }> = [{ x: sx, y: sy }]
      for (let i = 0; i < distances.length; i += 1) {
        const distance = distances[i]
        const weight = Math.max(0, Math.min(1, weights[i] ?? weights[weights.length - 1] ?? 0.5))
        const baseX = sx + dx * weight
        const baseY = sy + dy * weight
        points.push({
          x: baseX + nx * distance,
          y: baseY + ny * distance,
        })
      }
      points.push({ x: tx, y: ty })

      const segments: Segment[] = []
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i]
        const b = points[i + 1]
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.001) continue
        segments.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          sourceId,
          targetId,
          edgeId: logicalId,
        })
      }

      return segments
    }

    const countCrossings = (candidateSegments: Segment[], acceptedSegments: Segment[]) => {
      let count = 0
      for (const candidate of candidateSegments) {
        for (const accepted of acceptedSegments) {
          if (
            candidate.sourceId === accepted.sourceId ||
            candidate.sourceId === accepted.targetId ||
            candidate.targetId === accepted.sourceId ||
            candidate.targetId === accepted.targetId
          ) {
            continue
          }
          if (segmentsIntersect(candidate, accepted)) count += 1
        }
      }
      return count
    }

    const acceptedSegments: Segment[] = []

    for (const logicalId of orderedEdgeIds) {
      const edge = edgeByLogicalId.get(logicalId)
      if (!edge) continue

      const source = edge.source()
      const target = edge.target()
      if (!source || !target || source.empty() || target.empty()) continue

      const sourcePos = source.position()
      const targetPos = target.position()
      const chord = Math.hypot(
        Number(targetPos?.x || 0) - Number(sourcePos?.x || 0),
        Number(targetPos?.y || 0) - Number(sourcePos?.y || 0),
      )
      const baseDistance = Math.max(18, Math.min(220, chord * 0.24))
      const sideHint = Number(edge.data('sectorHint') || 0) % 2 === 0 ? 1 : -1
      const isCriticalEdge =
        edge.hasClass('critical-edge') ||
        Boolean(edge.data('edge')?.isCriticalEdge)

      const candidates = [
        { distances: `${Math.round(sideHint * baseDistance * 0.65)}`, weights: '0.5' },
        { distances: `${Math.round(-sideHint * baseDistance * 0.65)}`, weights: '0.5' },
        { distances: `${Math.round(sideHint * baseDistance * 0.95)}`, weights: '0.5' },
        { distances: `${Math.round(-sideHint * baseDistance * 0.95)}`, weights: '0.5' },
        { distances: `${Math.round(sideHint * baseDistance * 1.25)}`, weights: '0.5' },
        { distances: `${Math.round(-sideHint * baseDistance * 1.25)}`, weights: '0.5' },
        {
          distances: `${Math.round(sideHint * baseDistance * 0.7)} ${Math.round(sideHint * baseDistance * 1.8)}`,
          weights: '0.34 0.82',
        },
        {
          distances: `${Math.round(-sideHint * baseDistance * 0.7)} ${Math.round(-sideHint * baseDistance * 1.8)}`,
          weights: '0.34 0.82',
        },
        {
          distances: `${Math.round(sideHint * baseDistance * 1.05)} ${Math.round(-sideHint * baseDistance * 1.05)}`,
          weights: '0.34 0.76',
        },
        { distances: `${Math.round(sideHint * baseDistance * 0.35)}`, weights: '0.5' },
      ]

      let chosen = false
      let bestFallback: {
        distances: string
        weights: string
        segments: Segment[]
        crossings: number
      } | null = null

      for (let attempt = 0; attempt < Math.min(10, candidates.length); attempt += 1) {
        const candidate = candidates[attempt]
        const candidateSegments = toSegments(edge, logicalId, candidate.distances, candidate.weights)
        const crossings = countCrossings(candidateSegments, acceptedSegments)

        if (!bestFallback || crossings < bestFallback.crossings) {
          bestFallback = {
            distances: candidate.distances,
            weights: candidate.weights,
            segments: candidateSegments,
            crossings,
          }
        }

        if (crossings > radialEdgeIntersectionThreshold) continue

        edge.data('radialCpDistances', candidate.distances)
        edge.data('radialCpWeights', candidate.weights)

        const primaryDistance = Number(candidate.distances.split(/\s+/)[0] || 0)
        const primaryWeight = Number(candidate.weights.split(/\s+/)[0] || 0.5)
        edge.data('radialCpDistance', primaryDistance)
        edge.data('radialCpWeight', primaryWeight)

        acceptedSegments.push(...candidateSegments)
        edge.removeClass('routing-hidden-edge')
        chosen = true
        break
      }

      if (!chosen) {
        if (isCriticalEdge) {
          const fallback = bestFallback || {
            distances: `${Math.round(sideHint * baseDistance * 0.65)}`,
            weights: '0.5',
            segments: [] as Segment[],
            crossings: radialEdgeIntersectionThreshold + 1,
          }

          edge.data('radialCpDistances', fallback.distances)
          edge.data('radialCpWeights', fallback.weights)

          const primaryDistance = Number(fallback.distances.split(/\s+/)[0] || 0)
          const primaryWeight = Number(fallback.weights.split(/\s+/)[0] || 0.5)
          edge.data('radialCpDistance', primaryDistance)
          edge.data('radialCpWeight', primaryWeight)

          if (fallback.segments.length > 0) {
            acceptedSegments.push(...fallback.segments)
          }

          edge.removeClass('routing-hidden-edge')
          continue
        }

        edge.addClass('routing-hidden-edge')
      }
    }
  }

  return {
    updateRadialEdgeRouting,
    updateOuterContourRouteNodes,
    optimizeLayoutEdgeIntersections,
  }
}
