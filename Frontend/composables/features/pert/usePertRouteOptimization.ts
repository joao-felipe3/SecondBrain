import type { PertDiagramEdge } from '~/composables/features/pert/usePertDiagramData'

type PertResolvedLayoutMode = 'hierarchical' | 'force'

type UsePertRouteOptimizationParams = {
  getCy: () => any
  getResolvedLayoutMode: () => PertResolvedLayoutMode
  getEdges: () => PertDiagramEdge[]
  edgeIntersectionThreshold?: number
  getEdgeIntersectionThreshold?: () => number
}

type RouteOptimizationSummary = {
  mode: PertResolvedLayoutMode
  threshold: number
  totalRoutableEdges: number
  acceptedWithinThreshold: number
  hiddenByThreshold: number
  criticalFallbackKept: number
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
  getEdges,
  edgeIntersectionThreshold = 1,
  getEdgeIntersectionThreshold,
}: UsePertRouteOptimizationParams) => {
  const resolveIntersectionThreshold = () => {
    const raw = getEdgeIntersectionThreshold
      ? getEdgeIntersectionThreshold()
      : edgeIntersectionThreshold
    if (!Number.isFinite(raw)) return 0
    return Math.max(0, Math.min(20, Math.floor(raw)))
  }

  let lastOptimizationSummary: RouteOptimizationSummary = {
    mode: 'force',
    threshold: resolveIntersectionThreshold(),
    totalRoutableEdges: 0,
    acceptedWithinThreshold: 0,
    hiddenByThreshold: 0,
    criticalFallbackKept: 0,
  }

  const updateEdgeRouting = (force = false) => {
    const cy = getCy()
    if (!cy) return

    const mode = getResolvedLayoutMode()
    if (!force && mode !== 'hierarchical' && mode !== 'force') return

    const routedEdges = cy.edges('.routed-edge').not('.suppressed-edge')
    if (!routedEdges || routedEdges.length === 0) return

    routedEdges.forEach((edge: any) => {
      const source = edge.source()
      const target = edge.target()
      if (!source || !target || source.empty() || target.empty()) return

      const sourcePos = source.position()
      const targetPos = target.position()
      const sx = Number(sourcePos?.x || 0)
      const sy = Number(sourcePos?.y || 0)
      const tx = Number(targetPos?.x || 0)
      const ty = Number(targetPos?.y || 0)
      const chord = Math.hypot(tx - sx, ty - sy)
      if (!Number.isFinite(chord) || chord < 1) return

      const sideHint = Number(edge.data('sectorHint') || 0) % 2 === 0 ? 1 : -1
      const fanOffset = Number(edge.data('fanOffset') || 0)
      const sourceLayer = Number(source.data('layer') || 0)
      const targetLayer = Number(target.data('layer') || 0)
      const layerJump = Math.abs(targetLayer - sourceLayer)
      const isCriticalEdge =
        edge.hasClass('critical-edge') ||
        Boolean(edge.data('edge')?.isCriticalEdge)

      const baseMagnitude = Math.max(18, Math.min(220, chord * 0.24))
      const fanBoost = Math.min(40, Math.abs(fanOffset) * 10)
      const jumpBoost = Math.min(64, Math.max(0, layerJump - 1) * 18)
      const criticalBoost = isCriticalEdge ? 12 : 0
      const magnitude = Math.min(250, baseMagnitude + fanBoost + jumpBoost + criticalBoost)
      const signedDistance = Math.round((fanOffset >= 0 ? 1 : -1) * sideHint * magnitude)

      const secondaryDistance = Math.round((fanOffset >= 0 ? 1 : -1) * sideHint * Math.min(300, magnitude * 1.52))
      const useDoubleControl = layerJump >= 2 || Math.abs(fanOffset) >= 1.2

      const cpDistances = useDoubleControl
        ? `${signedDistance} ${secondaryDistance}`
        : `${signedDistance}`
      const cpWeights = useDoubleControl ? '0.34 0.82' : '0.74'

      edge.data('cpDistance', signedDistance)
      edge.data('cpWeight', useDoubleControl ? 0.34 : 0.74)
      edge.data('cpDistances', cpDistances)
      edge.data('cpWeights', cpWeights)
    })
  }

  const optimizeLayoutEdgeIntersections = (
    mode: PertResolvedLayoutMode,
    startIds: string[],
    levelById: Map<string, number>,
  ) => {
    const cy = getCy()
    if (!cy) return

    const effectiveThreshold = resolveIntersectionThreshold()
    const routedEdges = cy.edges('.routed-edge').not('.suppressed-edge')
    if (!routedEdges || routedEdges.length === 0) {
      lastOptimizationSummary = {
        mode,
        threshold: effectiveThreshold,
        totalRoutableEdges: 0,
        acceptedWithinThreshold: 0,
        hiddenByThreshold: 0,
        criticalFallbackKept: 0,
      }
      return
    }

    routedEdges.removeClass('routing-hidden-edge')

    const edgeByLogicalId = new Map<string, any>()
    routedEdges.forEach((edge: any) => {
      const logicalId = String(edge.data('edge')?.id || edge.id())
      if (!edgeByLogicalId.has(logicalId)) {
        edgeByLogicalId.set(logicalId, edge)
      }
    })

    if (edgeByLogicalId.size === 0) {
      lastOptimizationSummary = {
        mode,
        threshold: effectiveThreshold,
        totalRoutableEdges: 0,
        acceptedWithinThreshold: 0,
        hiddenByThreshold: 0,
        criticalFallbackKept: 0,
      }
      return
    }

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
    const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cyValue: number) =>
      (bx - ax) * (cyValue - ay) - (by - ay) * (cx - ax)
    const onSegment = (ax: number, ay: number, bx: number, by: number, cx: number, cyValue: number) =>
      cx >= Math.min(ax, bx) - eps &&
      cx <= Math.max(ax, bx) + eps &&
      cyValue >= Math.min(ay, by) - eps &&
      cyValue <= Math.max(ay, by) + eps
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
    let acceptedWithinThreshold = 0
    let hiddenByThreshold = 0
    let criticalFallbackKept = 0

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
        {
          distances: String(edge.data('cpDistances') || '').trim(),
          weights: String(edge.data('cpWeights') || '').trim() || '0.74',
        },
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
      ].filter((candidate, index, all) => {
        if (!candidate.distances) return false
        return all.findIndex((item) => item.distances === candidate.distances && item.weights === candidate.weights) === index
      })

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

        if (crossings > effectiveThreshold) continue

        edge.data('cpDistances', candidate.distances)
        edge.data('cpWeights', candidate.weights)

        const primaryDistance = Number(candidate.distances.split(/\s+/)[0] || 0)
        const primaryWeight = Number(candidate.weights.split(/\s+/)[0] || 0.74)
        edge.data('cpDistance', primaryDistance)
        edge.data('cpWeight', primaryWeight)

        acceptedSegments.push(...candidateSegments)
        edge.removeClass('routing-hidden-edge')
        chosen = true
        acceptedWithinThreshold += 1
        break
      }

      if (!chosen) {
        if (isCriticalEdge) {
          const fallback = bestFallback || {
            distances: `${Math.round(sideHint * baseDistance * 0.65)}`,
            weights: '0.5',
            segments: [] as Segment[],
            crossings: effectiveThreshold + 1,
          }

          edge.data('cpDistances', fallback.distances)
          edge.data('cpWeights', fallback.weights)

          const primaryDistance = Number(fallback.distances.split(/\s+/)[0] || 0)
          const primaryWeight = Number(fallback.weights.split(/\s+/)[0] || 0.74)
          edge.data('cpDistance', primaryDistance)
          edge.data('cpWeight', primaryWeight)

          if (fallback.segments.length > 0) {
            acceptedSegments.push(...fallback.segments)
          }

          edge.removeClass('routing-hidden-edge')
          criticalFallbackKept += 1
          continue
        }

        edge.addClass('routing-hidden-edge')
        hiddenByThreshold += 1
      }
    }

    lastOptimizationSummary = {
      mode,
      threshold: effectiveThreshold,
      totalRoutableEdges: orderedEdgeIds.length,
      acceptedWithinThreshold,
      hiddenByThreshold,
      criticalFallbackKept,
    }
  }

  const getLastOptimizationSummary = () => {
    return lastOptimizationSummary
  }

  return {
    updateEdgeRouting,
    optimizeLayoutEdgeIntersections,
    getLastOptimizationSummary,
  }
}
