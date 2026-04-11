import type { PertDiagramEdge, PertDiagramNode } from './usePertDiagramData'

type PertLayoutMode = 'auto' | 'hierarchical' | 'radial'

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
    const isRadialIntent = layoutMode === 'radial' || (layoutMode === 'auto' && isDense)
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
    let maxDuration = 1

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
    }

    for (const node of nodes) {
      maxDuration = Math.max(maxDuration, Number(node.durationHours || 0))
    }

    // Identify start nodes and layered distance from start to reduce long crossings.
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

    // Keep insertion order aligned with layered graph to improve crossing minimization.
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

    // Identify parallel edges (same source-target pair) to draw them separated and avoid overlap.
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

    const groupSectorCount = Math.max(1, groups.length)
    const getSectorDistance = (a: number, b: number) => {
      const raw = Math.abs(a - b)
      return Math.min(raw, groupSectorCount - raw)
    }
    const getNodeSector = (nodeId: string) => {
      const groupKey = nodeGroupKeyById.get(nodeId) || 'task'
      return groupSectorIndex.get(groupKey) ?? (groupSectorIndex.get('Other') ?? 0)
    }

    const denseBackboneEdgeIds = new Set<string>()
    if (isDense && !allEdgesVisible && !hasFocus) {
      // Keep all high-signal edges first.
      for (const edge of edges) {
        const isPriority = edge.isCriticalEdge || readySet.has(edge.source) || readySet.has(edge.target)
        if (isPriority) denseBackboneEdgeIds.add(edge.id)
      }

      // Keep at least one predecessor (or two for medium fan-in) per target to preserve graph readability.
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

        const keepCount = 1
        for (const edge of sortedIncoming.slice(0, keepCount)) {
          denseBackboneEdgeIds.add(edge.id)
        }
      }

      // Keep a small subset from high fan-out sources to avoid complete loss of branch context.
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

    const radialAllowedEdgeIds = new Set<string>()
    const radialPrimaryIncomingByTarget = new Map<string, string>()
    if (isDense && isRadialIntent && !allEdgesVisible && !hasFocus) {
      for (const [targetId, incomingEdges] of incomingByTarget.entries()) {
        if (!incomingEdges.length) continue

        const sortedIncoming = [...incomingEdges].sort((a, b) => {
          const criticalScore = Number(Boolean(b.isCriticalEdge)) - Number(Boolean(a.isCriticalEdge))
          if (criticalScore !== 0) return criticalScore

          const priorityA = Number(Boolean(readySet.has(a.source) || readySet.has(a.target)))
          const priorityB = Number(Boolean(readySet.has(b.source) || readySet.has(b.target)))
          if (priorityA !== priorityB) return priorityB - priorityA

          const aJump = Math.abs((levelById.get(a.target) || 0) - (levelById.get(a.source) || 0))
          const bJump = Math.abs((levelById.get(b.target) || 0) - (levelById.get(b.source) || 0))
          if (aJump !== bJump) return aJump - bJump

          const aSourceOut = outDegreeMap.get(a.source) || 0
          const bSourceOut = outDegreeMap.get(b.source) || 0
          if (aSourceOut !== bSourceOut) return aSourceOut - bSourceOut

          return a.id.localeCompare(b.id)
        })

        radialPrimaryIncomingByTarget.set(targetId, sortedIncoming[0].id)
      }

      const targetSecondaryCount = new Map<string, number>()

      for (const outgoingEdges of outgoingBySource.values()) {
        const keptTargetSectors = new Set<number>()
        const sortedOutgoing = [...outgoingEdges].sort((a, b) => {
          const aSourceLayer = levelById.get(a.source) || 0
          const bSourceLayer = levelById.get(b.source) || 0
          const aTargetLayer = levelById.get(a.target) || 0
          const bTargetLayer = levelById.get(b.target) || 0
          const aJump = Math.abs(aTargetLayer - aSourceLayer)
          const bJump = Math.abs(bTargetLayer - bSourceLayer)
          const aSectorDelta = getSectorDistance(getNodeSector(a.source), getNodeSector(a.target))
          const bSectorDelta = getSectorDistance(getNodeSector(b.source), getNodeSector(b.target))

          const criticalScore = Number(Boolean(b.isCriticalEdge)) - Number(Boolean(a.isCriticalEdge))
          if (criticalScore !== 0) return criticalScore
          if (aSectorDelta !== bSectorDelta) return aSectorDelta - bSectorDelta
          if (aJump !== bJump) return aJump - bJump
          return a.id.localeCompare(b.id)
        })

        let keptSecondary = 0
        for (const edge of sortedOutgoing) {
          const sourceLayer = levelById.get(edge.source) || 0
          const targetLayer = levelById.get(edge.target) || 0
          const jump = Math.abs(targetLayer - sourceLayer)
          const targetSector = getNodeSector(edge.target)
          const sectorDelta = getSectorDistance(getNodeSector(edge.source), targetSector)
          const isPriority = edge.isCriticalEdge || readySet.has(edge.source) || readySet.has(edge.target)
          const isBackbone = denseBackboneEdgeIds.has(edge.id)

          if (isPriority || isBackbone) {
            radialAllowedEdgeIds.add(edge.id)
            keptTargetSectors.add(targetSector)
            continue
          }

          const targetCount = targetSecondaryCount.get(edge.target) || 0
          const touchesInnerLayer = sourceLayer <= 1 || targetLayer <= 1
          if (
            jump <= 0 &&
            keptSecondary < 1 &&
            targetCount < 1 &&
            sectorDelta === 0 &&
            !touchesInnerLayer &&
            !keptTargetSectors.has(targetSector)
          ) {
            radialAllowedEdgeIds.add(edge.id)
            keptSecondary += 1
            keptTargetSectors.add(targetSector)
            targetSecondaryCount.set(edge.target, targetCount + 1)
          }
        }
      }
    }

    const nodeElements = orderedNodes.map((node) => {
      const outDegree = outDegreeMap.get(node.id) || 0
      const durationRatio = Math.min(1, Math.max(0, Number(node.durationHours || 0) / maxDuration))
      const riskScore = Math.min(1, (outDegree / 6) * 0.6 + durationRatio * 0.4)
      const visualSize = 46 + riskScore * 26
      const layer = levelById.get(node.id) || 0
      const groupKey = getNodeGroupKey(node)
      const isStartNode = startSet.has(node.id)

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
          outDegree: outDegree,
          riskScore: riskScore,
          visualSize: visualSize,
          slack: node.slack,
          earlyStart: node.earlyStart,
          earlyFinish: node.earlyFinish,
          lateStart: node.lateStart,
          lateFinish: node.lateFinish,
          isCritical: node.isCritical,
          isConcluded: node.isConcluded,
          node: node,
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

    const edgeElements: any[] = []
    const outerRouteNodeElements: any[] = []
    const outerRouteNodeIds = new Set<string>()

    for (const edge of edges) {
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
      const sourceGroup = nodeGroupKeyById.get(edge.source) || 'task'
      const targetGroup = nodeGroupKeyById.get(edge.target) || 'task'
      const sourceSector = groupSectorIndex.get(sourceGroup) ?? 0
      const targetSector = groupSectorIndex.get(targetGroup) ?? 0
      const sectorDelta = getSectorDistance(sourceSector, targetSector)
      const isInterSector = sourceSector !== targetSector
      const isIdleDecluttered = !hasFocus && !allEdgesVisible && !isPriorityEdge
      const shouldSuppressEdge =
        isDense &&
        !allEdgesVisible &&
        !hasFocus &&
        !isPriorityEdge &&
        !isBackboneDenseEdge
      const shouldSuppressByRadialRule =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        !radialAllowedEdgeIds.has(edge.id) &&
        radialPrimaryIncomingByTarget.get(edge.target) !== edge.id
      const shouldSuppressLongRadialJump =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        isLongJump &&
        !edge.isCriticalEdge &&
        !isBackboneDenseEdge
      const shouldSuppressCenterChord =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        isInterSector &&
        sectorDelta >= Math.max(2, Math.floor(groupSectorCount / 2) - 1) &&
        !edge.isCriticalEdge &&
        !isBackboneDenseEdge &&
        !readySet.has(edge.source) &&
        !readySet.has(edge.target)
      const isPrimaryIncoming = radialPrimaryIncomingByTarget.get(edge.target) === edge.id
      const shouldSuppressInterSectorNoise =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        isInterSector &&
        sectorDelta >= 2 &&
        !isPriorityEdge &&
        !isBackboneDenseEdge &&
        !isPrimaryIncoming
      const touchesInnerLayer = sourceLayer <= 1 || targetLayer <= 1
      const shouldSuppressInnerHubCross =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        isInterSector &&
        touchesInnerLayer &&
        !isPriorityEdge &&
        !isBackboneDenseEdge &&
        !isPrimaryIncoming
      const shouldSuppressAggressiveRadial =
        isDense &&
        isRadialIntent &&
        !allEdgesVisible &&
        !hasFocus &&
        !isPriorityEdge &&
        !isBackboneDenseEdge &&
        (isInterSector || isLongJump || touchesInnerLayer)
      const shouldFanEdge = totalForPair > 1 || isFocusEdge || edge.isCriticalEdge || (isDense && sourceOutDegree >= 6)
      const preferredSign = cpDistance === 0
        ? (targetSector >= sourceSector ? 1 : -1)
        : Math.sign(cpDistance)
      const radialCurveStrength = isInterSector
        ? Math.min(176, 84 + sectorDelta * 28 + Math.abs(centerOffset) * 10)
        : Math.max(18, Math.abs(cpDistance * 0.95) + 18)
      const radialCpDistance = preferredSign * radialCurveStrength

      const shouldSuppressCombinedRaw =
        shouldSuppressEdge ||
        shouldSuppressByRadialRule ||
        shouldSuppressLongRadialJump ||
        shouldSuppressCenterChord ||
        shouldSuppressInterSectorNoise ||
        shouldSuppressInnerHubCross ||
        shouldSuppressAggressiveRadial

      // In radial mode keep edges visible; reduce crossings by rerouting instead of hiding.
      const shouldSuppressCombined = edge.isCriticalEdge
        ? false
        : (isRadialIntent ? false : shouldSuppressCombinedRaw)

      const shouldUseOuterContourRoute =
        false

      const baseClasses = [
        edge.isCriticalEdge ? 'critical-edge' : 'regular-edge',
        shouldFanEdge ? 'fan-edge' : '',
        isDense && !edge.isCriticalEdge ? 'dense-edge' : '',
        isDense && !edge.isCriticalEdge && !isBackboneDenseEdge ? 'radial-edge' : '',
        isFocusEdge ? 'path-edge' : '',
        isDimmedEdge ? 'path-dim-edge' : '',
        isBlockedEdge ? 'blocked-edge' : '',
        isLongJump ? 'long-edge' : '',
        isIdleDecluttered && !shouldSuppressEdge ? 'idle-edge' : '',
        isBackboneDenseEdge && !isPriorityEdge ? 'backbone-edge' : '',
        isPrimaryIncoming && isRadialIntent && !edge.isCriticalEdge ? 'primary-incoming-edge' : '',
        shouldSuppressCombined ? 'suppressed-edge' : '',
        totalForPair > 1 ? 'parallel-edge' : '',
        edge.relationship === 'finish-to-start' ? 'edge-fs' : 'edge-dashed',
      ]

      if (shouldUseOuterContourRoute) {
        const routeNodeAId = `route-${edge.id}-a`
        const routeNodeMId = `route-${edge.id}-m`
        const routeNodeBId = `route-${edge.id}-b`
        const halfSector = Math.floor(groupSectorCount / 2)
        const wrappedForward = (targetSector - sourceSector + groupSectorCount) % groupSectorCount
        const signedSectorStep = wrappedForward === 0
          ? 0
          : wrappedForward > halfSector
            ? wrappedForward - groupSectorCount
            : wrappedForward
        const routeSide = signedSectorStep === 0
          ? (preferredSign === 0 ? 1 : preferredSign)
          : (signedSectorStep > 0 ? 1 : -1)
        const routeLane = centerOffset + fanOffset * 0.7 + targetFanOffset * 0.45 + (sectorDelta - 1) * 0.9

        if (!outerRouteNodeIds.has(routeNodeAId)) {
          outerRouteNodeIds.add(routeNodeAId)
          outerRouteNodeElements.push({
            data: {
              id: routeNodeAId,
              layer: Math.max(sourceLayer, targetLayer) + 1,
              groupKey: 'route',
              isRouteNode: true,
              routeSource: edge.source,
              routeTarget: edge.target,
              routeSide,
              routeLane,
              routeRole: 'source',
            },
            position: { x: 0, y: 0 },
            locked: true,
            grabbable: false,
            selectable: false,
            classes: 'outer-route-node',
          })
        }

        if (!outerRouteNodeIds.has(routeNodeBId)) {
          outerRouteNodeIds.add(routeNodeBId)
          outerRouteNodeElements.push({
            data: {
              id: routeNodeBId,
              layer: Math.max(sourceLayer, targetLayer) + 1,
              groupKey: 'route',
              isRouteNode: true,
              routeSource: edge.source,
              routeTarget: edge.target,
              routeSide,
              routeLane,
              routeRole: 'target',
            },
            position: { x: 0, y: 0 },
            locked: true,
            grabbable: false,
            selectable: false,
            classes: 'outer-route-node',
          })
        }

        if (!outerRouteNodeIds.has(routeNodeMId)) {
          outerRouteNodeIds.add(routeNodeMId)
          outerRouteNodeElements.push({
            data: {
              id: routeNodeMId,
              layer: Math.max(sourceLayer, targetLayer) + 1,
              groupKey: 'route',
              isRouteNode: true,
              routeSource: edge.source,
              routeTarget: edge.target,
              routeSide,
              routeLane,
              routeRole: 'mid',
            },
            position: { x: 0, y: 0 },
            locked: true,
            grabbable: false,
            selectable: false,
            classes: 'outer-route-node',
          })
        }

        edgeElements.push({
          data: {
            id: `${edge.id}__outer_a`,
            source: edge.source,
            target: routeNodeAId,
            relation: '',
            cpDistance,
            radialCpDistance,
            radialCpWeight: 0.74,
            radialCpDistances: String(Math.round(radialCpDistance)),
            radialCpWeights: '0.74',
            sectorDelta,
            sectorHint: targetSector,
            fanOffset: centerOffset,
            edge,
          },
          classes: [...baseClasses, 'outer-route-edge', 'outer-route-pre-edge'].filter(Boolean).join(' '),
        })

        edgeElements.push({
          data: {
            id: `${edge.id}__outer_b`,
            source: routeNodeAId,
            target: routeNodeMId,
            relation: '',
            cpDistance,
            radialCpDistance,
            radialCpWeight: 0.74,
            radialCpDistances: String(Math.round(radialCpDistance)),
            radialCpWeights: '0.74',
            sectorDelta,
            sectorHint: targetSector,
            fanOffset: centerOffset,
            edge,
          },
          classes: [...baseClasses, 'outer-route-edge', 'outer-route-mid-edge'].filter(Boolean).join(' '),
        })

        edgeElements.push({
          data: {
            id: `${edge.id}__outer_c`,
            source: routeNodeMId,
            target: routeNodeBId,
            relation: '',
            cpDistance,
            radialCpDistance,
            radialCpWeight: 0.74,
            radialCpDistances: String(Math.round(radialCpDistance)),
            radialCpWeights: '0.74',
            sectorDelta,
            sectorHint: targetSector,
            fanOffset: centerOffset,
            edge,
          },
          classes: [...baseClasses, 'outer-route-edge', 'outer-route-mid-edge'].filter(Boolean).join(' '),
        })

        edgeElements.push({
          data: {
            id: `${edge.id}__outer_d`,
            source: routeNodeBId,
            target: edge.target,
            relation: isDense ? '' : relationLabel(edge.relationship),
            cpDistance,
            radialCpDistance,
            radialCpWeight: 0.74,
            radialCpDistances: String(Math.round(radialCpDistance)),
            radialCpWeights: '0.74',
            sectorDelta,
            sectorHint: targetSector,
            fanOffset: centerOffset,
            edge,
          },
          classes: [...baseClasses, 'outer-route-edge', 'outer-route-post-edge'].filter(Boolean).join(' '),
        })

        continue
      }

      edgeElements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: isDense ? '' : relationLabel(edge.relationship),
          cpDistance,
          radialCpDistance,
          radialCpWeight: 0.74,
          radialCpDistances: String(Math.round(radialCpDistance)),
          radialCpWeights: '0.74',
          sectorDelta,
          sectorHint: targetSector,
          fanOffset: centerOffset,
          edge,
        },
        classes: [...baseClasses, isRadialIntent ? 'radial-route-edge' : 'hierarchical-route-edge'].filter(Boolean).join(' '),
      })
    }

    return [...nodeElements, ...outerRouteNodeElements, ...edgeElements]
  }

  return {
    buildElements,
  }
}
