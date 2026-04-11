type Segment = {
  x1: number
  y1: number
  x2: number
  y2: number
  sourceId: string
  targetId: string
  edgeId: string
}

export const usePertIntersectionMetrics = () => {
  const estimateIntersections = (cy: any) => {
    if (!cy) return 0

    const activeEdges = cy.edges()
      .not('.suppressed-edge')
      .filter((edge: any) => !edge.hidden() && edge.visible())

    if (!activeEdges || activeEdges.length < 2) return 0

    const segments: Segment[] = []
    activeEdges.forEach((edge: any) => {
      const source = edge.source()
      const target = edge.target()
      if (!source || !target || source.empty() || target.empty()) return

      const sourceId = String(source.id())
      const targetId = String(target.id())
      const sourcePos = source.position()
      const targetPos = target.position()

      const points: Array<{ x: number; y: number }> = [
        { x: Number(sourcePos?.x || 0), y: Number(sourcePos?.y || 0) },
      ]

      try {
        const cps = typeof edge.controlPoints === 'function' ? edge.controlPoints() : []
        if (Array.isArray(cps) && cps.length) {
          cps.forEach((cp: any) => {
            points.push({ x: Number(cp?.x || 0), y: Number(cp?.y || 0) })
          })
        }
      } catch {
        // Ignore control-point access failures and fallback to source-target chord.
      }

      points.push({ x: Number(targetPos?.x || 0), y: Number(targetPos?.y || 0) })

      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i]
        const b = points[i + 1]
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.001) continue

        segments.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          sourceId,
          targetId,
          edgeId: String(edge.id()),
        })
      }
    })

    if (segments.length < 2) return 0

    const eps = 0.0001
    const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    const onSegment = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
      cx >= Math.min(ax, bx) - eps &&
      cx <= Math.max(ax, bx) + eps &&
      cy >= Math.min(ay, by) - eps &&
      cy <= Math.max(ay, by) + eps

    const intersects = (s1: Segment, s2: Segment) => {
      const o1 = orient(s1.x1, s1.y1, s1.x2, s1.y2, s2.x1, s2.y1)
      const o2 = orient(s1.x1, s1.y1, s1.x2, s1.y2, s2.x2, s2.y2)
      const o3 = orient(s2.x1, s2.y1, s2.x2, s2.y2, s1.x1, s1.y1)
      const o4 = orient(s2.x1, s2.y1, s2.x2, s2.y2, s1.x2, s1.y2)

      if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
        return true
      }

      if (Math.abs(o1) <= eps && onSegment(s1.x1, s1.y1, s1.x2, s1.y2, s2.x1, s2.y1)) return true
      if (Math.abs(o2) <= eps && onSegment(s1.x1, s1.y1, s1.x2, s1.y2, s2.x2, s2.y2)) return true
      if (Math.abs(o3) <= eps && onSegment(s2.x1, s2.y1, s2.x2, s2.y2, s1.x1, s1.y1)) return true
      if (Math.abs(o4) <= eps && onSegment(s2.x1, s2.y1, s2.x2, s2.y2, s1.x2, s1.y2)) return true
      return false
    }

    let count = 0
    let checks = 0
    const maxChecks = 220000
    for (let i = 0; i < segments.length; i += 1) {
      const a = segments[i]
      for (let j = i + 1; j < segments.length; j += 1) {
        const b = segments[j]
        checks += 1
        if (checks > maxChecks) return count

        // Ignore pairs that share an endpoint node (adjacency, not a visual crossing issue).
        if (
          a.sourceId === b.sourceId ||
          a.sourceId === b.targetId ||
          a.targetId === b.sourceId ||
          a.targetId === b.targetId
        ) {
          continue
        }

        // Avoid counting segment overlaps from the same original edge split.
        if (a.edgeId === b.edgeId) continue

        if (intersects(a, b)) count += 1
      }
    }

    return count
  }

  return {
    estimateIntersections,
  }
}
