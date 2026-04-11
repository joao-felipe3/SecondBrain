import type { PertDiagramEdge, PertDiagramNode } from './usePertDiagramData'

type PertLayoutMode = 'auto' | 'hierarchical' | 'force'

type BuildPertElementsParams = {
  nodes: PertDiagramNode[]
  edges: PertDiagramEdge[]
  layoutMode: PertLayoutMode
  showAllEdges?: boolean
  readyNodeIds?: string[]
  blockedNodeIds?: string[]
  focusNodeIds?: string[]
}

export const usePertElementsBuilder = () => {
  const relationLabel = (value: PertDiagramEdge['relationship']) => {
    if (value === 'start-to-start') return 'SS'
    if (value === 'finish-to-finish') return 'FF'
    return 'FS'
  }

  const shortLabel = (value: string) => {
    const text = String(value || '').trim()
    if (text.length <= 22) return text
    return `${text.slice(0, 19)}...`
  }

  const slackLabel = (value: number) => `S:${Number(value || 0).toFixed(1)}h`

  const blendHexColor = (startHex: string, endHex: string, ratio: number) => {
    const safeRatio = Math.max(0, Math.min(1, ratio))
    const start = startHex.replace('#', '')
    const end = endHex.replace('#', '')
    const sr = Number.parseInt(start.slice(0, 2), 16)
    const sg = Number.parseInt(start.slice(2, 4), 16)
    const sb = Number.parseInt(start.slice(4, 6), 16)
    const er = Number.parseInt(end.slice(0, 2), 16)
    const eg = Number.parseInt(end.slice(2, 4), 16)
    const eb = Number.parseInt(end.slice(4, 6), 16)

    const rr = Math.round(sr + (er - sr) * safeRatio)
    const rg = Math.round(sg + (eg - sg) * safeRatio)
    const rb = Math.round(sb + (eb - sb) * safeRatio)

    return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rb.toString(16).padStart(2, '0')}`
  }

  const semanticSlackColor = (slackHours: number, maxSlackHours: number) => {
    const normalized = Math.max(0, Math.min(1, Number(slackHours || 0) / Math.max(0.01, maxSlackHours)))
    if (normalized <= 0.5) {
      return blendHexColor('#d32f2f', '#fdd835', normalized / 0.5)
    }
    return blendHexColor('#fdd835', '#1e88e5', (normalized - 0.5) / 0.5)
  }

  const getNodeGroupKey = (node: PertDiagramNode) => {
    const pathGroup = String(node.wbsPath || '')
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean)[0]
    if (pathGroup) return pathGroup

    const parentGroup = String(node.parentWbsNodeId || '').trim()
    if (parentGroup) return parentGroup

    const nameGroup = String(node.name || '')
      .split(/[.\-_/ ]/)
      .map((part) => part.trim())
      .filter(Boolean)[0]
    return nameGroup || 'task'
  }

  const buildElements = ({
    nodes,
    edges,
    layoutMode,
    showAllEdges,
    readyNodeIds,
    blockedNodeIds,
    focusNodeIds,
  }: BuildPertElementsParams) => {
    const graphDensity = edges.length / Math.max(nodes.length, 1)
    const isDense = nodes.length > 36 || edges.length > 72 || graphDensity > 1.8
    const prefersForce = layoutMode === 'force' || (layoutMode === 'auto' && isDense)
    const readySet = new Set(readyNodeIds || [])
    const blockedSet = new Set(blockedNodeIds || [])
    const focusSet = new Set(focusNodeIds || [])
    const allEdgesVisible = Boolean(showAllEdges)
    const hasFocus = focusSet.size > 0
    const outDegreeMap = new Map<string, number>()
    const inDegreeMap = new Map<string, number>()
    const childrenById = new Map<string, string[]>()
    const incomingByTarget = new Map<string, PertDiagramEdge[]>()
    const outgoingBySource = new Map<string, PertDiagramEdge[]>()
    const criticalIncidentById = new Map<string, number>()
    const nodeById = new Map<string, PertDiagramNode>()
    let maxDuration = 1
    let maxSlack = 0.01

    for (const edge of edges) {
      outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) || 0) + 1)
      inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1)
      const children = childrenById.get(edge.source) || []
      children.push(edge.target)
      childrenById.set(edge.source, children)

      const incoming = incomingByTarget.get(edge.target) || []
      incoming.push(edge)
      incomingByTarget.set(edge.target, incoming)

      const outgoing = outgoingBySource.get(edge.source) || []
      outgoing.push(edge)
      outgoingBySource.set(edge.source, outgoing)

      if (edge.isCriticalEdge) {
        criticalIncidentById.set(edge.source, (criticalIncidentById.get(edge.source) || 0) + 1)
        criticalIncidentById.set(edge.target, (criticalIncidentById.get(edge.target) || 0) + 1)
      }
    }

    for (const node of nodes) {
      nodeById.set(node.id, node)
      maxDuration = Math.max(maxDuration, Number(node.durationHours || 0))
      maxSlack = Math.max(maxSlack, Number(node.slack || 0))
    }

    const maxDependencyCount = Math.max(1, ...nodes.map((node) => {
      const incoming = inDegreeMap.get(node.id) || 0
      const outgoing = outDegreeMap.get(node.id) || 0
      return incoming + outgoing
    }))
    const maxCriticalIncidents = Math.max(1, ...nodes.map((node) => criticalIncidentById.get(node.id) || 0))

    const startIds = nodes
      .filter((node) => (inDegreeMap.get(node.id) || 0) === 0)
      .map((node) => node.id)
    const startSet = new Set(startIds)

    const levelById = new Map<string, number>()
    const queue: string[] = [...startIds]
    for (const id of startIds) levelById.set(id, 0)

    while (queue.length > 0) {
      const current = queue.shift() as string
      const currentLevel = levelById.get(current) || 0
      const children = childrenById.get(current) || []
      for (const child of children) {
        const nextLevel = currentLevel + 1
        const existing = levelById.get(child)
        if (existing === undefined || nextLevel > existing) {
          levelById.set(child, nextLevel)
          queue.push(child)
        }
      }
    }

    const orderedNodes = [...nodes].sort((a, b) => {
      const la = levelById.get(a.id) || 0
      const lb = levelById.get(b.id) || 0
      if (la !== lb) return la - lb

      const ga = String(a.name || '').split(/[.\-_/ ]/)[0]
      const gb = String(b.name || '').split(/[.\-_/ ]/)[0]
      if (ga !== gb) return ga.localeCompare(gb)

      const da = outDegreeMap.get(a.id) || 0
      const db = outDegreeMap.get(b.id) || 0
      if (da !== db) return db - da
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    const pairCount = new Map<string, number>()
    const pairIndex = new Map<string, number>()
    const sourceCount = new Map<string, number>()
    const sourceIndex = new Map<string, number>()
    const targetCount = new Map<string, number>()
    const targetIndex = new Map<string, number>()
    for (const edge of edges) {
      const key = `${edge.source}::${edge.target}`
      pairCount.set(key, (pairCount.get(key) || 0) + 1)
      sourceCount.set(edge.source, (sourceCount.get(edge.source) || 0) + 1)
      targetCount.set(edge.target, (targetCount.get(edge.target) || 0) + 1)
    }

    const nodeGroupKeyById = new Map<string, string>()
    const groupSize = new Map<string, number>()
    for (const node of nodes) {
      const groupKey = getNodeGroupKey(node)
      nodeGroupKeyById.set(node.id, groupKey)
      groupSize.set(groupKey, (groupSize.get(groupKey) || 0) + 1)
    }

    const groupEntries = Array.from(groupSize.entries())
      .map(([key, size]) => ({ key, size }))
      .sort((a, b) => b.size - a.size || a.key.localeCompare(b.key))

    const maxGroupSectors = 10
    const groups = groupEntries.length > maxGroupSectors
      ? [
          ...groupEntries.slice(0, maxGroupSectors - 1),
          {
            key: 'Other',
            size: groupEntries
              .slice(maxGroupSectors - 1)
              .reduce((sum: number, entry: { key: string; size: number }) => sum + entry.size, 0),
          },
        ]
      : groupEntries

    const groupSectorIndex = new Map<string, number>()
    groups.forEach((group, index) => {
      groupSectorIndex.set(group.key, index)
    })

    const denseBackboneEdgeIds = new Set<string>()
    if (isDense && !allEdgesVisible && !hasFocus) {
      for (const edge of edges) {
        const isPriority = edge.isCriticalEdge || readySet.has(edge.source) || readySet.has(edge.target)
        if (isPriority) denseBackboneEdgeIds.add(edge.id)
      }

      for (const incomingEdges of incomingByTarget.values()) {
        if (!incomingEdges.length) continue

        const sortedIncoming = [...incomingEdges].sort((a, b) => {
          const criticalScore = Number(Boolean(b.isCriticalEdge)) - Number(Boolean(a.isCriticalEdge))
          if (criticalScore !== 0) return criticalScore

          const aJump = Math.abs((levelById.get(a.target) || 0) - (levelById.get(a.source) || 0))
          const bJump = Math.abs((levelById.get(b.target) || 0) - (levelById.get(b.source) || 0))
          if (aJump !== bJump) return aJump - bJump

          const aSourceOut = outDegreeMap.get(a.source) || 0
          const bSourceOut = outDegreeMap.get(b.source) || 0
          if (aSourceOut !== bSourceOut) return aSourceOut - bSourceOut

          return a.id.localeCompare(b.id)
        })

        for (const edge of sortedIncoming.slice(0, 1)) {
          denseBackboneEdgeIds.add(edge.id)
        }
      }

      for (const outgoingEdges of outgoingBySource.values()) {
        if (outgoingEdges.length < 6) continue

        const sortedOutgoing = [...outgoingEdges].sort((a, b) => {
          const criticalScore = Number(Boolean(b.isCriticalEdge)) - Number(Boolean(a.isCriticalEdge))
          if (criticalScore !== 0) return criticalScore

          const aJump = Math.abs((levelById.get(a.target) || 0) - (levelById.get(a.source) || 0))
          const bJump = Math.abs((levelById.get(b.target) || 0) - (levelById.get(b.source) || 0))
          if (aJump !== bJump) return aJump - bJump

          return a.id.localeCompare(b.id)
        })

        const keepCount = outgoingEdges.length >= 10 ? 1 : 2
        for (const edge of sortedOutgoing.slice(0, keepCount)) {
          denseBackboneEdgeIds.add(edge.id)
        }
      }
    }

    const nodeElements = orderedNodes.map((node) => {
      const outDegree = outDegreeMap.get(node.id) || 0
      const inDegree = inDegreeMap.get(node.id) || 0
      const dependencyCount = inDegree + outDegree
      const durationRatio = Math.min(1, Math.max(0, Number(node.durationHours || 0) / maxDuration))
      const dependencyRatio = Math.min(1, dependencyCount / Math.max(1, maxDependencyCount))
      const criticalIncidentRatio = Math.min(1, (criticalIncidentById.get(node.id) || 0) / maxCriticalIncidents)
      const slackRiskRatio = node.isCritical
        ? 1
        : Math.max(0, 1 - Math.min(1, Number(node.slack || 0) / Math.max(2, maxSlack)))
      const importanceScore = Math.min(
        1,
        dependencyRatio * 0.38 +
        durationRatio * 0.24 +
        criticalIncidentRatio * 0.26 +
        slackRiskRatio * 0.12,
      )
      const emphasizedImportance = Math.pow(importanceScore, 1.55)
      const criticalSizeBoost = node.isCritical ? 0.08 : 0
      const sizeRatio = Math.min(1, emphasizedImportance + criticalSizeBoost)
      const visualSize = 22 + sizeRatio * 126
      const layer = levelById.get(node.id) || 0
      const groupKey = getNodeGroupKey(node)
      const isStartNode = startSet.has(node.id)
      const slackColor = semanticSlackColor(Number(node.slack || 0), maxSlack)
      const slackBorderWidth = 2.8 + slackRiskRatio * 2.2

      return {
        data: {
          id: node.id,
          label: !isDense || node.isCritical ? node.name : '',
          labelWithSlack: !isDense || node.isCritical ? `${node.name}\n${slackLabel(node.slack)}` : '',
          shortLabel: shortLabel(node.name),
          layer,
          groupKey,
          isStartNode,
          durationHours: node.durationHours,
          dependencyCount,
          outDegree,
          inDegree,
          importanceScore,
          visualSize,
          slackBorderWidth,
          slack: node.slack,
          slackSemanticColor: slackColor,
          earlyStart: node.earlyStart,
          earlyFinish: node.earlyFinish,
          lateStart: node.lateStart,
          lateFinish: node.lateFinish,
          isCritical: node.isCritical,
          isConcluded: node.isConcluded,
          node,
        },
        classes: [
          isStartNode ? 'start-node' : '',
          readySet.has(node.id) ? 'ready-node' : '',
          blockedSet.has(node.id) ? 'unavailable-node' : '',
          node.slack <= 0.1 ? 'slack-critical-node' : (node.slack < 2 ? 'slack-near-node' : 'slack-safe-node'),
          hasFocus && !focusSet.has(node.id) ? 'path-dim' : '',
          hasFocus && focusSet.has(node.id) ? 'path-focus' : '',
          node.isCritical ? 'critical-node' : 'regular-node',
          node.isConcluded ? 'done-node' : '',
        ].filter(Boolean).join(' '),
      }
    })

    const edgeElements = edges.map((edge) => {
      const key = `${edge.source}::${edge.target}`
      const index = pairIndex.get(key) || 0
      pairIndex.set(key, index + 1)

      const sourcePos = sourceIndex.get(edge.source) || 0
      sourceIndex.set(edge.source, sourcePos + 1)

      const targetPos = targetIndex.get(edge.target) || 0
      targetIndex.set(edge.target, targetPos + 1)

      const totalForPair = pairCount.get(key) || 1
      const totalFromSource = sourceCount.get(edge.source) || 1
      const totalToTarget = targetCount.get(edge.target) || 1
      const centerOffset = index - (totalForPair - 1) / 2
      const fanOffset = sourcePos - (totalFromSource - 1) / 2
      const targetFanOffset = targetPos - (totalToTarget - 1) / 2
      const cpDistanceBase = centerOffset * 38 + fanOffset * 16 - targetFanOffset * 12
      const cpDistance = isDense ? cpDistanceBase * 1.25 : cpDistanceBase
      const sourceLayer = levelById.get(edge.source) || 0
      const targetLayer = levelById.get(edge.target) || 0
      const isLongJump = Math.abs(targetLayer - sourceLayer) > 1
      const sourceOutDegree = outDegreeMap.get(edge.source) || 0
      const isFocusEdge = hasFocus && focusSet.has(edge.source) && focusSet.has(edge.target)
      const isDimmedEdge = hasFocus && !isFocusEdge
      const isBlockedEdge = blockedSet.has(edge.target)
      const isPriorityEdge = edge.isCriticalEdge || readySet.has(edge.source) || readySet.has(edge.target)
      const isBackboneDenseEdge = denseBackboneEdgeIds.has(edge.id)
      const isIdleDecluttered = !hasFocus && !allEdgesVisible && !isPriorityEdge
      const sourceDuration = Number(nodeById.get(edge.source)?.durationHours || 0)
      const durationRatio = Math.min(1, sourceDuration / maxDuration)
      const criticalImpact = edge.isCriticalEdge ? 1 : 0
      const degreeImpact = Math.min(1, ((outDegreeMap.get(edge.source) || 0) + (inDegreeMap.get(edge.target) || 0)) / 10)
      const edgeImpactScore = Math.min(1, durationRatio * 0.46 + criticalImpact * 0.36 + degreeImpact * 0.18)
      const edgeWidth = 2.1 + edgeImpactScore * 4.5
      const edgeArrowScale = 2.1 + edgeImpactScore * 2.4
      const shouldSuppressEdge =
        isDense &&
        !allEdgesVisible &&
        !hasFocus &&
        !isPriorityEdge &&
        !isBackboneDenseEdge
      const shouldFanEdge = totalForPair > 1 || isFocusEdge || edge.isCriticalEdge || (isDense && sourceOutDegree >= 6)

      const sourceGroup = nodeGroupKeyById.get(edge.source) || 'task'
      const targetGroup = nodeGroupKeyById.get(edge.target) || 'task'
      const sourceSector = groupSectorIndex.get(sourceGroup) ?? 0
      const targetSector = groupSectorIndex.get(targetGroup) ?? 0

      const directionSign = cpDistance === 0 ? (targetSector >= sourceSector ? 1 : -1) : Math.sign(cpDistance)
      const strength = Math.min(220, Math.max(16, Math.abs(cpDistance) + (prefersForce ? 26 : 14)))
      const cpRouteDistance = Math.round(directionSign * strength)

      const classes = [
        edge.isCriticalEdge ? 'critical-edge' : 'regular-edge',
        shouldFanEdge ? 'fan-edge' : '',
        isDense && !edge.isCriticalEdge ? 'dense-edge' : '',
        isFocusEdge ? 'path-edge' : '',
        isDimmedEdge ? 'path-dim-edge' : '',
        isBlockedEdge ? 'blocked-edge' : '',
        isLongJump ? 'long-edge' : '',
        isIdleDecluttered && !shouldSuppressEdge ? 'idle-edge' : '',
        isBackboneDenseEdge && !isPriorityEdge ? 'backbone-edge' : '',
        shouldSuppressEdge && !edge.isCriticalEdge ? 'suppressed-edge' : '',
        totalForPair > 1 ? 'parallel-edge' : '',
        edge.relationship === 'finish-to-start' ? 'edge-fs' : 'edge-dashed',
        'routed-edge',
      ].filter(Boolean).join(' ')

      return {
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: isDense ? '' : relationLabel(edge.relationship),
          edgeWidth,
          edgeArrowScale,
          edgeImpactScore,
          sourceDuration,
          cpDistance,
          cpWeight: 0.74,
          cpDistances: String(cpRouteDistance),
          cpWeights: '0.74',
          sectorHint: targetSector,
          fanOffset: centerOffset,
          edge,
        },
        classes,
      }
    })

    return [...nodeElements, ...edgeElements]
  }

  return {
    buildElements,
  }
}
