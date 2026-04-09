<template>
  <v-card elevation="1" class="pert-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1">Diagrama PERT/CPM</span>
      <div class="d-flex align-center flex-wrap ga-2">
        <v-btn-toggle
          v-model="layoutMode"
          mandatory
          density="compact"
          variant="outlined"
          color="primary"
          divided
          class="layout-toggle"
        >
          <v-btn value="auto" size="x-small">Auto</v-btn>
          <v-btn value="hierarchical" size="x-small">Hierarquico</v-btn>
          <v-btn value="radial" size="x-small">Radial</v-btn>
        </v-btn-toggle>
        <v-chip
          v-if="layoutFallbackNotice"
          size="small"
          color="warning"
          variant="tonal"
        >
          {{ layoutFallbackNotice }}
        </v-chip>
        <v-chip size="small" color="success" variant="tonal">{{ readyNowTaskCount }} posso fazer agora</v-chip>
      </div>
    </v-card-title>

    <v-card-text class="pt-2">
      <div v-if="nodes.length === 0" class="text-caption text-medium-emphasis">
        Sem dados para exibir no diagrama.
      </div>
      <v-alert
        v-else-if="renderError"
        type="error"
        variant="tonal"
        density="compact"
      >
        {{ renderError }}
      </v-alert>
      <template v-else>
        <div ref="chartWrapper" class="chart-wrapper">
          <svg
            v-if="showRadialRings"
            class="radial-rings-bg"
            :viewBox="`0 0 ${radialRingOverlay.width} ${radialRingOverlay.height}`"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <circle
              v-for="(radius, index) in radialRingOverlay.radii"
              :key="`ring-${index}`"
              :cx="radialRingOverlay.cx"
              :cy="radialRingOverlay.cy"
              :r="radius"
              fill="none"
              stroke="rgba(24, 115, 128, 0.12)"
              stroke-width="0.9"
              stroke-dasharray="1.6 1.4"
            />
          </svg>
          <div ref="chartContainer" class="chart-container" />
          <div
            v-if="tooltip.visible && tooltip.node"
            class="graph-tooltip"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          >
            <strong>{{ tooltip.node.name }}</strong>
            <span>Duracao: {{ tooltip.node.durationHours.toFixed(1) }}h</span>
            <span>Folga: {{ tooltip.node.slack.toFixed(2) }}h</span>
            <span>ES/EF: {{ tooltip.node.earlyStart.toFixed(1) }} / {{ tooltip.node.earlyFinish.toFixed(1) }}h</span>
            <span>LS/LF: {{ tooltip.node.lateStart.toFixed(1) }} / {{ tooltip.node.lateFinish.toFixed(1) }}h</span>
          </div>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PertDiagramNode, PertDiagramEdge } from '~/composables/features/usePertDiagramData'

const props = defineProps<{
  nodes: PertDiagramNode[]
  edges: PertDiagramEdge[]
  onlyCritical?: boolean
  criticalEdgesOnly?: boolean
  showAllEdges?: boolean
  readyNodeIds?: string[]
  blockedNodeIds?: string[]
  focusNodeIds?: string[]
  readyNowTaskCount?: number
}>()

const emit = defineEmits<{
  (event: 'node-click', node: PertDiagramNode): void
}>()

const chartWrapper = ref<HTMLElement | null>(null)
const chartContainer = ref<HTMLElement | null>(null)
const selectedNode = ref<PertDiagramNode | null>(null)
const lockedNodeId = ref<string | null>(null)
const selectedNodeInsights = ref<{
  directPredecessors: number
  directSuccessors: number
  totalAncestors: number
  totalDescendants: number
  layer: number
  isLocked: boolean
} | null>(null)
const renderError = ref<string | null>(null)
const layoutFallbackNotice = ref<string | null>(null)
const resolvedLayoutMode = ref<Exclude<PertLayoutMode, 'auto'>>('hierarchical')
const radialCenterNodeId = ref<string | null>(null)
const radialRingOverlay = ref<{ cx: number; cy: number; radii: number[]; width: number; height: number }>({
  cx: 0,
  cy: 0,
  radii: [],
  width: 100,
  height: 100,
})
const tooltip = ref<{ visible: boolean; x: number; y: number; node: PertDiagramNode | null }>({
  visible: false,
  x: 0,
  y: 0,
  node: null,
})
let cy: any = null
let cytoscapeFactory: any = null
let resizeObserver: ResizeObserver | null = null
let dagreRegistered = false
let graphRenderToken = 0
let wasContainerHidden = false
type PertLayoutMode = 'auto' | 'hierarchical' | 'radial'
const layoutMode = ref<PertLayoutMode>('auto')
const showRadialRings = computed(() =>
  resolvedLayoutMode.value === 'radial' &&
  radialRingOverlay.value.radii.length >= 1 &&
  !renderError.value,
)

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

const clearRadialRingOverlay = () => {
  radialRingOverlay.value = {
    cx: 0,
    cy: 0,
    radii: [],
    width: chartContainer.value?.clientWidth || 100,
    height: chartContainer.value?.clientHeight || 100,
  }
}

const updateRadialRingOverlay = () => {
  if (!cy || !chartContainer.value || resolvedLayoutMode.value !== 'radial') {
    clearRadialRingOverlay()
    return
  }

  const nodes = cy.nodes().not('.outer-route-node')
  if (!nodes || nodes.length === 0) {
    clearRadialRingOverlay()
    return
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
  const maxCanvasRadius = Math.max(chartContainer.value.clientWidth, chartContainer.value.clientHeight) * 1.35
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

  radialRingOverlay.value = {
    cx: Number(renderedCenter?.x || chartContainer.value.clientWidth / 2),
    cy: Number(renderedCenter?.y || chartContainer.value.clientHeight / 2),
    radii: renderedRadii,
    width: chartContainer.value.clientWidth || 100,
    height: chartContainer.value.clientHeight || 100,
  }
}

const updateRadialEdgeRouting = () => {
  if (!cy || resolvedLayoutMode.value !== 'radial') return

  const nodes = cy.nodes().not('.outer-route-node')
  if (!nodes || nodes.length === 0) return

  const bounds = nodes.boundingBox()
  const centerX = Number(bounds?.x1 || 0) + Number(bounds?.w || 0) / 2
  const centerY = Number(bounds?.y1 || 0) + Number(bounds?.h || 0) / 2
  const containerRadius = chartContainer.value
    ? Math.max(40, Math.min(chartContainer.value.clientWidth, chartContainer.value.clientHeight) * 0.48)
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

    // Pick the bezier side that pushes the curve away from the graph center.
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

const updateOuterContourRouteNodes = () => {
  if (!cy || resolvedLayoutMode.value !== 'radial') return

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

    const routeAngle = normalizeAngle(sourceAngle + arc * 0.5 + routeSide * 0.16)
    const routeLane = Number(routeNode.data('routeLane') || 0)
    const laneOffset = Math.max(-4, Math.min(4, routeLane)) * 14
    const radius = outerBaseRadius + laneOffset

    routeNode.unlock()
    routeNode.position({
      x: centerX + Math.cos(routeAngle) * radius,
      y: centerY + Math.sin(routeAngle) * radius,
    })
    routeNode.lock()
  })
}

const buildElements = () => {
  const graphDensity = props.edges.length / Math.max(props.nodes.length, 1)
  const isDense = props.nodes.length > 36 || props.edges.length > 72 || graphDensity > 1.8
  const isRadialIntent = layoutMode.value === 'radial' || (layoutMode.value === 'auto' && isDense)
  const readySet = new Set(props.readyNodeIds || [])
  const blockedSet = new Set(props.blockedNodeIds || [])
  const focusSet = new Set(props.focusNodeIds || [])
  const showAllEdges = Boolean(props.showAllEdges)
  const hasFocus = focusSet.size > 0
  const nodeById = new Map(props.nodes.map((node) => [node.id, node]))
  const outDegreeMap = new Map<string, number>()
  const inDegreeMap = new Map<string, number>()
  const childrenById = new Map<string, string[]>()
  const incomingByTarget = new Map<string, PertDiagramEdge[]>()
  const outgoingBySource = new Map<string, PertDiagramEdge[]>()
  let maxDuration = 1

  for (const edge of props.edges) {
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

  for (const node of props.nodes) {
    maxDuration = Math.max(maxDuration, Number(node.durationHours || 0))
  }

  // Identify start nodes and layered distance from start to reduce long crossings.
  const startIds = props.nodes
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
  const orderedNodes = [...props.nodes].sort((a, b) => {
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
  for (const edge of props.edges) {
    const key = `${edge.source}::${edge.target}`
    pairCount.set(key, (pairCount.get(key) || 0) + 1)
    sourceCount.set(edge.source, (sourceCount.get(edge.source) || 0) + 1)
    targetCount.set(edge.target, (targetCount.get(edge.target) || 0) + 1)
  }

  const nodeGroupKeyById = new Map<string, string>()
  const groupSize = new Map<string, number>()
  for (const node of props.nodes) {
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
  if (isDense && !showAllEdges && !hasFocus) {
    // Keep all high-signal edges first.
    for (const edge of props.edges) {
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
  if (isDense && isRadialIntent && !showAllEdges && !hasFocus) {
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
          jump <= 1 &&
          keptSecondary < 1 &&
          targetCount < 1 &&
          sectorDelta <= 1 &&
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

  for (const edge of props.edges) {
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
    const isIdleDecluttered = !hasFocus && !showAllEdges && !isPriorityEdge
    const shouldSuppressEdge =
      isDense &&
      !showAllEdges &&
      !hasFocus &&
      !isPriorityEdge &&
      !isBackboneDenseEdge
    const shouldSuppressByRadialRule =
      isDense &&
      isRadialIntent &&
      !showAllEdges &&
      !hasFocus &&
      !radialAllowedEdgeIds.has(edge.id) &&
      radialPrimaryIncomingByTarget.get(edge.target) !== edge.id
    const shouldSuppressLongRadialJump =
      isDense &&
      isRadialIntent &&
      !showAllEdges &&
      !hasFocus &&
      isLongJump &&
      !edge.isCriticalEdge &&
      !isBackboneDenseEdge
    const shouldSuppressCenterChord =
      isDense &&
      isRadialIntent &&
      !showAllEdges &&
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
      !showAllEdges &&
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
      !showAllEdges &&
      !hasFocus &&
      isInterSector &&
      touchesInnerLayer &&
      !isPriorityEdge &&
      !isBackboneDenseEdge &&
      !isPrimaryIncoming
    const shouldFanEdge = totalForPair > 1 || isFocusEdge || edge.isCriticalEdge || (isDense && sourceOutDegree >= 6)
    const preferredSign = cpDistance === 0
      ? (targetSector >= sourceSector ? 1 : -1)
      : Math.sign(cpDistance)
    const radialCurveStrength = isInterSector
      ? Math.min(176, 84 + sectorDelta * 28 + Math.abs(centerOffset) * 10)
      : Math.max(18, Math.abs(cpDistance * 0.95) + 18)
    const radialCpDistance = preferredSign * radialCurveStrength

    const shouldSuppressCombined =
      shouldSuppressEdge ||
      shouldSuppressByRadialRule ||
      shouldSuppressLongRadialJump ||
      shouldSuppressCenterChord ||
      shouldSuppressInterSectorNoise ||
      shouldSuppressInnerHubCross

    const shouldUseOuterContourRoute =
      isRadialIntent &&
      !showAllEdges &&
      !hasFocus &&
      isInterSector &&
      sectorDelta >= 2 &&
      !edge.isCriticalEdge &&
      !shouldSuppressCombined

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
      const routeNodeId = `route-${edge.id}`
      const routeSide = preferredSign === 0
        ? (targetSector >= sourceSector ? 1 : -1)
        : preferredSign
      const routeLane = centerOffset + fanOffset * 0.4

      if (!outerRouteNodeIds.has(routeNodeId)) {
        outerRouteNodeIds.add(routeNodeId)
        outerRouteNodeElements.push({
          data: {
            id: routeNodeId,
            layer: Math.max(sourceLayer, targetLayer) + 1,
            groupKey: 'route',
            isRouteNode: true,
            routeSource: edge.source,
            routeTarget: edge.target,
            routeSide,
            routeLane,
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
          target: routeNodeId,
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
          source: routeNodeId,
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
      classes: [...baseClasses, isRadialIntent ? 'radial-route-edge' : ''].filter(Boolean).join(' '),
    })
  }

  return [...nodeElements, ...outerRouteNodeElements, ...edgeElements]
}

const getRootNodeIds = () => {
  const hasIncoming = new Set<string>()
  for (const edge of props.edges) hasIncoming.add(edge.target)
  return props.nodes
    .filter((node) => !hasIncoming.has(node.id))
    .map((node) => node.id)
}

const computeGraphLevels = () => {
  const inDegree = new Map<string, number>()
  const childrenById = new Map<string, string[]>()

  for (const node of props.nodes) {
    inDegree.set(node.id, 0)
    childrenById.set(node.id, [])
  }

  for (const edge of props.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    const children = childrenById.get(edge.source) || []
    children.push(edge.target)
    childrenById.set(edge.source, children)
  }

  const startIds = props.nodes
    .filter((node) => (inDegree.get(node.id) || 0) === 0)
    .map((node) => node.id)

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

  let maxLayer = 0
  for (const node of props.nodes) {
    maxLayer = Math.max(maxLayer, levelById.get(node.id) || 0)
  }

  return { levelById, maxLayer, startIds }
}

const applyZoomLod = () => {
  if (!cy) return
  const zoom = cy.zoom()
  const allNodes = cy.nodes().not('.outer-route-node')
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

const reorderRowsByBarycenter = () => {
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

const clearGhosting = () => {
  if (!cy) return
  cy.elements().removeClass('is-dimmed')
  cy.elements().removeClass('is-highlighted')
}

const applyNeighborhoodFocus = (node: any) => {
  if (!cy || !node) return
  const focus = node.closedNeighborhood().union(node.predecessors()).union(node.successors())
  cy.elements().addClass('is-dimmed')
  focus.removeClass('is-dimmed')
  focus.addClass('is-highlighted')
}

const buildNodeInsights = (nodeId: string) => {
  const predecessorMap = new Map<string, string[]>()
  const successorMap = new Map<string, string[]>()

  for (const node of props.nodes) {
    predecessorMap.set(node.id, [])
    successorMap.set(node.id, [])
  }

  for (const edge of props.edges) {
    predecessorMap.set(edge.target, [...(predecessorMap.get(edge.target) || []), edge.source])
    successorMap.set(edge.source, [...(successorMap.get(edge.source) || []), edge.target])
  }

  const walk = (start: string, map: Map<string, string[]>) => {
    const visited = new Set<string>()
    const queue = [...(map.get(start) || [])]
    while (queue.length > 0) {
      const current = queue.shift() as string
      if (visited.has(current)) continue
      visited.add(current)
      const next = map.get(current) || []
      for (const id of next) {
        if (!visited.has(id)) queue.push(id)
      }
    }
    return visited.size
  }

  const node = props.nodes.find((item) => item.id === nodeId)
  selectedNodeInsights.value = {
    directPredecessors: (predecessorMap.get(nodeId) || []).length,
    directSuccessors: (successorMap.get(nodeId) || []).length,
    totalAncestors: walk(nodeId, predecessorMap),
    totalDescendants: walk(nodeId, successorMap),
    layer: Math.max(0, Number(node?.earlyStart || 0)),
    isLocked: lockedNodeId.value === nodeId,
  }
}

const applyLockedFocusById = (nodeId: string) => {
  if (!cy) return
  const node = cy.$id(nodeId)
  if (!node || node.empty()) return
  applyNeighborhoodFocus(node)
}

const rebalanceCrowdedRows = (
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

const normalizeWideAspect = (maxAspectRatio = 1.9, minCompression = 0.58) => {
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

const hideTooltip = () => {
  tooltip.value.visible = false
  tooltip.value.node = null
}

const updateTooltipPosition = (event: any) => {
  if (!chartWrapper.value || !tooltip.value.visible) return
  const rendered = event?.renderedPosition
  if (!rendered) return

  const wrapperWidth = chartWrapper.value.clientWidth
  const wrapperHeight = chartWrapper.value.clientHeight
  const tooltipWidth = 250
  const tooltipHeight = 108

  let x = Number(rendered.x ?? 0) + 14
  let y = Number(rendered.y ?? 0) + 14

  x = Math.max(8, Math.min(x, wrapperWidth - tooltipWidth - 8))
  y = Math.max(8, Math.min(y, wrapperHeight - tooltipHeight - 8))

  tooltip.value.x = x
  tooltip.value.y = y
}

const showTooltip = (node: any, event: any) => {
  const dataNode = node.data('node') as PertDiagramNode | undefined
  if (!dataNode) return

  tooltip.value.node = dataNode
  tooltip.value.visible = true
  updateTooltipPosition(event)
}

const applyGraph = (retryAttempt = 0, token?: number) => {
  if (!cy) return

  const activeToken = token ?? ++graphRenderToken
  if (activeToken !== graphRenderToken) return

  renderError.value = null
  layoutFallbackNotice.value = null
  cy.elements().remove()
  cy.add(buildElements())

  if (props.edges.length === 0) {
    resolvedLayoutMode.value = 'hierarchical'
    radialCenterNodeId.value = null
    clearRadialRingOverlay()
    cy.layout({
      name: 'grid',
      fit: false,
      avoidOverlap: true,
      spacingFactor: 1.2,
      padding: 26,
      animate: false,
    }).run()

    setTimeout(() => {
      if (!cy || activeToken !== graphRenderToken) return
      cy.resize()
      cy.fit(undefined, 28)
    }, 60)
    return
  }

  const roots = getRootNodeIds()
  const totalNodes = props.nodes.length
  const graphDensity = props.edges.length / Math.max(totalNodes, 1)
  const isDenseGraph = graphDensity > 1.8 || totalNodes > 36
  const autoMode: Exclude<PertLayoutMode, 'auto'> = isDenseGraph && totalNodes >= 18 ? 'radial' : 'hierarchical'
  let activeMode = (layoutMode.value === 'auto' ? autoMode : layoutMode.value) as Exclude<PertLayoutMode, 'auto'>
  const graphLevels = computeGraphLevels()

  const layoutPreset = totalNodes <= 20
    ? {
        nodeSep: isDenseGraph ? 58 : 62,
        edgeSep: 34,
        rankSep: 112,
        rowMax: 8,
        rowSpacing: 88,
        colSpacing: 88,
        aspect: 1.85,
        minCompression: 0.64,
        normalizeAspect: true,
        zoomBoostCap: 1.55,
      }
    : totalNodes <= 34
      ? {
          nodeSep: isDenseGraph ? 54 : 58,
          edgeSep: 40,
          rankSep: 104,
          rowMax: 7,
          rowSpacing: 84,
          colSpacing: 82,
          aspect: 1.7,
          minCompression: 0.68,
          normalizeAspect: true,
          zoomBoostCap: 1.48,
        }
      : {
          nodeSep: isDenseGraph ? 62 : 66,
          edgeSep: 38,
          rankSep: 118,
          rowMax: 8,
          rowSpacing: 98,
          colSpacing: 98,
          aspect: 2.4,
          minCompression: 0.78,
          normalizeAspect: false,
          zoomBoostCap: 1.18,
        }

  const createLayout = (
    mode: Exclude<PertLayoutMode, 'auto'>,
    radialVariant: 'preset' | 'concentric' | 'circle' = 'preset',
  ) => {
    if (mode === 'radial') {
      const buildRadialPresetPositions = () => {
        if (!cy) return {}

        const positions: Record<string, { x: number; y: number }> = {}
        const layerMap = new Map<number, any[]>()
        const predecessorByNodeId = new Map<string, string[]>()

        for (const edge of props.edges) {
          const predecessors = predecessorByNodeId.get(edge.target) || []
          predecessors.push(edge.source)
          predecessorByNodeId.set(edge.target, predecessors)
        }

        const normalizeAngle = (angle: number) => {
          let value = angle
          while (value < 0) value += Math.PI * 2
          while (value >= Math.PI * 2) value -= Math.PI * 2
          return value
        }

        const averageCircularAngle = (angles: number[]) => {
          if (!angles.length) return null
          const x = angles.reduce((sum: number, angle: number) => sum + Math.cos(angle), 0)
          const y = angles.reduce((sum: number, angle: number) => sum + Math.sin(angle), 0)
          if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return null
          return normalizeAngle(Math.atan2(y, x))
        }

        const projectAngleToSector = (angle: number, sectorStart: number, sectorEnd: number) => {
          const start = normalizeAngle(sectorStart)
          const end = normalizeAngle(sectorEnd)
          const normalized = normalizeAngle(angle)

          if (start <= end) {
            if (normalized < start) return start
            if (normalized > end) return end
            return normalized
          }

          const inWrappedSector = normalized >= start || normalized <= end
          if (inWrappedSector) return normalized

          const toStart = Math.min(Math.abs(normalized - start), Math.abs(normalized - start + Math.PI * 2))
          const toEnd = Math.min(Math.abs(normalized - end), Math.abs(normalized - end + Math.PI * 2))
          return toStart <= toEnd ? start : end
        }

        const angleByNodeId = new Map<string, number>()
        const groupSize = new Map<string, number>()
        const groupKeyByNodeId = new Map<string, string>()

        cy.nodes().not('.outer-route-node').forEach((node: any) => {
          const groupKey = String(node.data('groupKey') || 'task')
          groupKeyByNodeId.set(String(node.id()), groupKey)
          groupSize.set(groupKey, (groupSize.get(groupKey) || 0) + 1)
        })

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

        const sectorCount = Math.max(1, groups.length)
        const groupKeyToSector = (nodeId: string) => {
          const groupKey = groupKeyByNodeId.get(nodeId) || 'task'
          if (groupSectorIndex.has(groupKey)) return groupSectorIndex.get(groupKey) as number
          return groupSectorIndex.get('Other') ?? 0
        }

        cy.nodes().not('.outer-route-node').forEach((node: any) => {
          const layer = Number(node.data('layer') || 0)
          if (!layerMap.has(layer)) layerMap.set(layer, [])
          layerMap.get(layer)?.push(node)
        })

        const layers = Array.from(layerMap.keys()).sort((a, b) => a - b)
        if (layers.length === 0) return positions

        const maxNodesPerLayer = layers.reduce((max: number, layer: number) => {
          const size = (layerMap.get(layer) || []).length
          return Math.max(max, size)
        }, 1)

        const centerX = 0
        const centerY = 0
        const minArcSpacing = isDenseGraph
          ? (maxNodesPerLayer > 14 ? 138 : maxNodesPerLayer > 10 ? 124 : 110)
          : 82
        const baseRingGap = isDenseGraph
          ? (maxNodesPerLayer > 14 ? 168 : maxNodesPerLayer > 10 ? 154 : 142)
          : 104
        let currentRadius = Math.max(baseRingGap * 1.18, 112)

        for (const layer of layers) {
          const nodesInLayer = layerMap.get(layer) || []
          if (nodesInLayer.length === 0) continue

          const annotated = [...nodesInLayer].map((node) => {
            const nodeId = String(node.id())
            const predecessorIds = predecessorByNodeId.get(nodeId) || []
            const predecessorAngles = predecessorIds
              .map((id) => angleByNodeId.get(id))
              .filter((angle): angle is number => Number.isFinite(angle as number))
            const anchorAngle = averageCircularAngle(predecessorAngles)
            const sectorIndex = groupKeyToSector(nodeId)
            const groupKey = groupKeyByNodeId.get(nodeId) || 'task'

            return {
              node,
              anchorAngle,
              groupKey,
              sectorIndex,
            }
          })

          const sectorSweep = (Math.PI * 2) / sectorCount
          const sectorPadding = Math.min(sectorSweep * 0.18, 0.22)
          const annotatedBySector = new Map<number, typeof annotated>()
          for (let sector = 0; sector < sectorCount; sector += 1) {
            annotatedBySector.set(sector, [])
          }
          for (const item of annotated) {
            const bucket = annotatedBySector.get(item.sectorIndex) || []
            bucket.push(item)
            annotatedBySector.set(item.sectorIndex, bucket)
          }

          const orderedBySector: Array<{ node: any; angle: number }> = []
          for (let sector = 0; sector < sectorCount; sector += 1) {
            const items = annotatedBySector.get(sector) || []
            if (!items.length) continue

            const sectorStart = -Math.PI / 2 + sector * sectorSweep + sectorPadding
            const sectorEnd = -Math.PI / 2 + (sector + 1) * sectorSweep - sectorPadding
            const span = Math.max(0.05, sectorEnd - sectorStart)

            const sortedSector = items.sort((a, b) => {
              const projectedA = a.anchorAngle === null
                ? null
                : projectAngleToSector(a.anchorAngle, sectorStart, sectorEnd)
              const projectedB = b.anchorAngle === null
                ? null
                : projectAngleToSector(b.anchorAngle, sectorStart, sectorEnd)

              if (projectedA !== null && projectedB !== null) {
                return projectedA - projectedB
              }
              if (projectedA !== null) return -1
              if (projectedB !== null) return 1

              const outA = Number(a.node.data('outDegree') || 0)
              const outB = Number(b.node.data('outDegree') || 0)
              if (outA !== outB) return outB - outA
              return String(a.node.id()).localeCompare(String(b.node.id()))
            })

            const count = sortedSector.length
            const step = count <= 1 ? 0 : span / (count - 1)
            sortedSector.forEach((item, index) => {
              const angle = count <= 1 ? sectorStart + span / 2 : sectorStart + step * index
              orderedBySector.push({ node: item.node, angle: normalizeAngle(angle) })
            })
          }

          const orderedNodes = orderedBySector.map((item) => item.node)

          const requiredRadius = Math.max(
            currentRadius,
            (orderedNodes.length * minArcSpacing) / (2 * Math.PI),
            baseRingGap,
          )
          currentRadius = requiredRadius

          orderedBySector.forEach((item) => {
            const nodeId = String(item.node.id())
            const angle = item.angle
            positions[nodeId] = {
              x: centerX + Math.cos(angle) * currentRadius,
              y: centerY + Math.sin(angle) * currentRadius,
            }
            angleByNodeId.set(nodeId, angle)
          })

          currentRadius += baseRingGap
        }

        return positions
      }

      if (radialVariant === 'preset') {
        const positions = buildRadialPresetPositions()
        return cy.layout({
          name: 'preset',
          fit: false,
          animate: false,
          padding: 34,
          positions,
        })
      }

      if (radialVariant === 'circle') {
        return cy.layout({
          name: 'circle',
          fit: false,
          animate: false,
          avoidOverlap: true,
          padding: 34,
          spacingFactor: isDenseGraph ? 1.34 : 1.22,
          sort: (a: any, b: any) => {
            const nodeAId = String(a.id())
            const nodeBId = String(b.id())
            const layerA = graphLevels.levelById.get(nodeAId) || 0
            const layerB = graphLevels.levelById.get(nodeBId) || 0
            if (layerA !== layerB) return layerA - layerB

            const outA = Number(a.data('outDegree') || 0)
            const outB = Number(b.data('outDegree') || 0)
            return outB - outA
          },
        })
      }

      return cy.layout({
        name: 'concentric',
        fit: false,
        animate: false,
        avoidOverlap: true,
        minNodeSpacing: isDenseGraph ? 34 : 24,
        padding: 30,
        startAngle: -Math.PI / 2,
        sweep: Math.PI * 2,
        clockwise: true,
        equidistant: true,
        concentric: (node: any) => {
          const nodeId = String(node.id())
          const layer = graphLevels.levelById.get(nodeId) || 0
          const outDegree = Number(node.data('outDegree') || 0)
          const criticalBoost = node.hasClass('critical-node') ? 8 : 0
          const readyBoost = node.hasClass('ready-node') ? 4 : 0
          return (graphLevels.maxLayer - layer + 1) * 100 + outDegree * 3 + criticalBoost + readyBoost
        },
        levelWidth: () => (isDenseGraph ? 140 : 110),
      })
    }

    if (dagreRegistered) {
      return cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        ranker: 'network-simplex',
        acyclicer: 'greedy',
        align: 'UL',
        nodeSep: layoutPreset.nodeSep,
        edgeSep: layoutPreset.edgeSep,
        rankSep: layoutPreset.rankSep,
        animate: false,
        fit: false,
        padding: 28,
      })
    }

    return cy.layout({
      name: 'breadthfirst',
      directed: true,
      circle: false,
      roots,
      spacingFactor: props.nodes.length > 80 ? 1.7 : 2.1,
      nodeDimensionsIncludeLabels: true,
      avoidOverlap: true,
      padding: 26,
      animate: false,
    })
  }

  const runLayout = (
    mode: Exclude<PertLayoutMode, 'auto'>,
    radialVariant: 'preset' | 'concentric' | 'circle' = 'preset',
  ) => {
    try {
      createLayout(mode, radialVariant).run()
      activeMode = mode
      return true
    } catch {
      return false
    }
  }

  const isInvalidBounds = (bounds: any) => {
    const width = Number(bounds?.w || 0)
    const height = Number(bounds?.h || 0)
    return !Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2
  }

  const hasInvalidNodePositions = () => {
    if (!cy) return true
    return cy.nodes().toArray().some((node: any) => {
      const pos = node.position()
      const x = Number(pos?.x)
      const y = Number(pos?.y)
      return !Number.isFinite(x) || !Number.isFinite(y)
    })
  }

  const hasInvalidGeometry = () => {
    if (!cy) return true
    const nodes = cy.nodes().not('.outer-route-node')
    if (!nodes || nodes.length === 0) return true
    const bounds = nodes.boundingBox()
    return isInvalidBounds(bounds) || hasInvalidNodePositions()
  }

  const postProcess = (mode: Exclude<PertLayoutMode, 'auto'>) => {
    if (!cy) return

    if (mode === 'radial') {
      separateNodeOverlaps(isDenseGraph ? 28 : 18, isDenseGraph ? 18 : 11, 0.44)
      return
    }

    rebalanceCrowdedRows(layoutPreset.rowMax, layoutPreset.rowSpacing, layoutPreset.colSpacing)
    reorderRowsByBarycenter()
    separateNodeOverlaps(isDenseGraph ? 12 : 9, isDenseGraph ? 8 : 5, isDenseGraph ? 0.7 : 0.55)

    if (layoutPreset.normalizeAspect) {
      normalizeWideAspect(layoutPreset.aspect, layoutPreset.minCompression)
    }
  }

  const fitGraph = () => {
    if (!cy) return
    cy.resize()
    cy.fit(undefined, 28)
  }

  if (!runLayout(activeMode)) {
    if (activeMode === 'radial' && runLayout('radial', 'concentric')) {
      layoutFallbackNotice.value = 'Radial alternativo ativo para manter estabilidade.'
    } else if (activeMode === 'radial' && runLayout('radial', 'circle')) {
      layoutFallbackNotice.value = 'Radial simplificado ativo para manter estabilidade.'
    } else {
      const fallbackMode: Exclude<PertLayoutMode, 'auto'> = activeMode === 'radial' ? 'hierarchical' : 'radial'
      if (!runLayout(fallbackMode)) {
        resolvedLayoutMode.value = 'hierarchical'
        radialCenterNodeId.value = null
        clearRadialRingOverlay()
        renderError.value = 'Falha ao aplicar o layout do diagrama PERT.'
        return
      }
      if (fallbackMode === 'hierarchical' && layoutMode.value === 'radial') {
        layoutFallbackNotice.value = 'Radial indisponivel neste conjunto; exibindo hierarquico automaticamente.'
      }
    }
  }

  // Cytoscape can initialize while the carousel page is hidden; force resize/fit afterwards.
  setTimeout(() => {
    if (!cy || activeToken !== graphRenderToken) return

    const containerWidth = chartContainer.value?.clientWidth || 0
    const containerHeight = chartContainer.value?.clientHeight || 0
    if (containerWidth < 40 || containerHeight < 40) {
      wasContainerHidden = true
      if (retryAttempt < 6) {
        setTimeout(() => {
          if (activeToken !== graphRenderToken) return
          applyGraph(retryAttempt + 1, activeToken)
        }, 160)
      }
      return
    }
    wasContainerHidden = false

    postProcess(activeMode)
    if (activeMode === 'radial') {
      updateOuterContourRouteNodes()
      updateRadialEdgeRouting()
    }
    fitGraph()

    if (activeMode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('radial', 'concentric')) {
        layoutFallbackNotice.value = 'Radial alternativo ativo para manter estabilidade.'
        postProcess('radial')
        updateOuterContourRouteNodes()
        updateRadialEdgeRouting()
        fitGraph()
      }
    }

    if (activeMode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('radial', 'circle')) {
        layoutFallbackNotice.value = 'Radial simplificado ativo para manter estabilidade.'
        postProcess('radial')
        updateOuterContourRouteNodes()
        updateRadialEdgeRouting()
        fitGraph()
      }
    }

    if (activeMode === 'radial' && hasInvalidGeometry()) {
      if (runLayout('hierarchical')) {
        layoutFallbackNotice.value = 'Radial instavel neste conjunto; exibindo hierarquico automaticamente.'
        postProcess('hierarchical')
        fitGraph()
      }
    }

    if (hasInvalidGeometry() && retryAttempt < 2) {
      setTimeout(() => {
        if (activeToken !== graphRenderToken) return
        applyGraph(retryAttempt + 1, activeToken)
      }, 120)
      return
    }

    if (hasInvalidGeometry()) {
      resolvedLayoutMode.value = 'hierarchical'
      radialCenterNodeId.value = null
      clearRadialRingOverlay()
      renderError.value = 'Falha ao renderizar o diagrama PERT neste layout.'
      return
    }

    resolvedLayoutMode.value = activeMode
    radialCenterNodeId.value = activeMode === 'radial'
      ? (graphLevels.startIds[0] || props.nodes[0]?.id || null)
      : null

    // Use more of the canvas (height + width) when fit leaves too much empty area.
    const graphBounds = activeMode === 'radial'
      ? cy.nodes().not('.outer-route-node').boundingBox()
      : cy.elements().boundingBox()
    const safeContainerWidth = chartContainer.value?.clientWidth || 1
    const safeContainerHeight = chartContainer.value?.clientHeight || 1
    const widthUsage = graphBounds.w / Math.max(safeContainerWidth, 1)
    const heightUsage = graphBounds.h / Math.max(safeContainerHeight, 1)
    const usage = Math.min(widthUsage, heightUsage)
    const targetUsage = activeMode === 'radial' ? 0.9 : 0.72
    if (usage < targetUsage) {
      const factor = Math.min(layoutPreset.zoomBoostCap * (activeMode === 'radial' ? 1.36 : 1), targetUsage / Math.max(usage, 0.08))
      const boosted = Math.min(activeMode === 'radial' ? 2.7 : 2.2, cy.zoom() * factor)
      cy.zoom(boosted)
    }

    // Keep fitted zoom for denser diagrams to avoid re-crowding after layout.
    cy.center()

    applyZoomLod()
    updateRadialRingOverlay()
  }, 60)
}

const initGraph = async () => {
  if (!chartContainer.value) return
  renderError.value = null

  try {
    if (!cytoscapeFactory) {
      const module = await import('cytoscape')
      cytoscapeFactory = module.default
    }

    if (!dagreRegistered) {
      try {
        const dagreModuleName = 'cytoscape-dagre'
        const dagreModule = await import(/* @vite-ignore */ dagreModuleName)
        cytoscapeFactory.use(dagreModule.default)
        dagreRegistered = true
      } catch {
        dagreRegistered = false
      }
    }

    cy = cytoscapeFactory({
      container: chartContainer.value,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-wrap': 'wrap',
            'text-max-width': '160px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 34,
            color: '#ffffff',
            'font-size': 10,
            shape: 'ellipse',
            width: 'data(visualSize)',
            height: 'data(visualSize)',
            'border-width': 1.2,
            'border-color': '#0d47a1',
            'z-index-compare': 'manual',
            'z-index': 30,
            opacity: 1,
          },
        },
        {
          selector: '.start-node',
          style: {
            'background-color': '#fbc02d',
            'border-color': '#f57f17',
            'border-width': 3,
            color: '#212121',
          },
        },
        {
          selector: '.ready-node',
          style: {
            'background-color': '#00acc1',
            'border-color': '#006064',
            'border-width': 3,
          },
        },
        {
          selector: '.unavailable-node',
          style: {
            'background-color': '#b0bec5',
            'border-color': '#78909c',
            color: '#37474f',
            opacity: 0.45,
          },
        },
        {
          selector: '.path-focus',
          style: {
            opacity: 1,
          },
        },
        {
          selector: '.path-dim',
          style: {
            opacity: 0.24,
          },
        },
        {
          selector: '.short-label',
          style: {
            label: 'data(shortLabel)',
            'text-max-width': '120px',
          },
        },
        {
          selector: '.show-slack',
          style: {
            label: 'data(labelWithSlack)',
            'line-height': 1.18,
            'text-margin-y': 38,
          },
        },
        {
          selector: '.no-label',
          style: {
            label: '',
          },
        },
        {
          selector: '.slack-critical-node',
          style: {
            'border-color': '#c62828',
            'border-width': 2.4,
          },
        },
        {
          selector: '.slack-near-node',
          style: {
            'border-color': '#ef6c00',
            'border-width': 2,
          },
        },
        {
          selector: '.slack-safe-node',
          style: {
            'border-color': '#2e7d32',
            'border-width': 1.6,
          },
        },
        {
          selector: '.critical-node',
          style: {
            'background-color': '#d32f2f',
            'border-color': '#8b0000',
            'border-width': 2,
          },
        },
        {
          selector: '.regular-node',
          style: {
            'background-color': '#1976d2',
          },
        },
        {
          selector: '.done-node',
          style: {
            'background-color': '#2e7d32',
            'border-color': '#1b5e20',
          },
        },
        {
          selector: 'node.unavailable-node',
          style: {
            'background-color': '#b0bec5',
            'border-color': '#78909c',
            color: '#37474f',
            opacity: 0.45,
          },
        },
        {
          selector: 'node.slack-critical-node',
          style: {
            'border-color': '#c62828',
            'border-width': 2.4,
          },
        },
        {
          selector: 'node.slack-near-node',
          style: {
            'border-color': '#ef6c00',
            'border-width': 2,
          },
        },
        {
          selector: 'node.slack-safe-node',
          style: {
            'border-color': '#2e7d32',
            'border-width': 1.6,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 3.8,
            'line-color': 'rgba(66, 66, 66, 0.62)',
            'target-arrow-color': 'rgba(66, 66, 66, 0.92)',
            'target-arrow-shape': 'triangle',
            'target-arrow-scale': 3.7,
            'curve-style': 'bezier',
            'z-index-compare': 'manual',
            'z-index': 10,
            label: '',
            color: '#424242',
            opacity: 0.95,
          },
        },
        {
          selector: '.fan-edge',
          style: {
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(cpDistance)',
            'control-point-weights': 0.34,
          },
        },
        {
          selector: '.parallel-edge',
          style: {
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(cpDistance)',
            'control-point-weights': 0.38,
          },
        },
        {
          selector: '.radial-route-edge',
          style: {
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(radialCpDistances)',
            'control-point-weights': 'data(radialCpWeights)',
            'control-point-step-size': 62,
          },
        },
        {
          selector: '.outer-route-node',
          style: {
            label: '',
            width: 1,
            height: 1,
            opacity: 0,
            'background-opacity': 0,
            'border-width': 0,
            events: 'no',
            'z-index': 1,
          },
        },
        {
          selector: '.outer-route-edge',
          style: {
            'curve-style': 'segments',
            'segment-distances': '0',
            'segment-weights': '0.5',
            width: 2.4,
            opacity: 0.62,
            'line-color': 'rgba(21, 118, 133, 0.62)',
            'target-arrow-color': 'rgba(21, 118, 133, 0.76)',
            'target-arrow-scale': 1.75,
          },
        },
        {
          selector: '.outer-route-pre-edge',
          style: {
            'target-arrow-shape': 'none',
          },
        },
        {
          selector: '.outer-route-post-edge',
          style: {
            'target-arrow-shape': 'triangle',
          },
        },
        {
          selector: '.dense-edge',
          style: {
            width: 1.8,
            opacity: 0.4,
            'target-arrow-scale': 1.8,
          },
        },
        {
          selector: '.radial-edge',
          style: {
            width: 1.2,
            opacity: 0.58,
            'target-arrow-shape': 'none',
            'line-color': 'rgba(70, 70, 70, 0.36)',
          },
        },
        {
          selector: '.primary-incoming-edge',
          style: {
            width: 2.8,
            opacity: 0.7,
            'line-color': 'rgba(24, 115, 128, 0.72)',
            'target-arrow-color': 'rgba(24, 115, 128, 0.8)',
            'target-arrow-shape': 'triangle',
            'target-arrow-scale': 1.7,
          },
        },
        {
          selector: '.backbone-edge',
          style: {
            width: 3,
            opacity: 0.52,
            'line-color': 'rgba(32, 120, 132, 0.75)',
            'target-arrow-color': 'rgba(32, 120, 132, 0.9)',
            'target-arrow-scale': 2.2,
          },
        },
        {
          selector: '.idle-edge',
          style: {
            width: 2.2,
            opacity: 0.4,
            'target-arrow-scale': 1.75,
            'line-color': 'rgba(90, 90, 90, 0.34)',
            'target-arrow-color': 'rgba(90, 90, 90, 0.5)',
          },
        },
        {
          selector: '.long-edge',
          style: {
            'line-style': 'dashed',
            opacity: 0.24,
          },
        },
        {
          selector: '.path-edge',
          style: {
            width: 5.2,
            'line-color': '#00838f',
            'target-arrow-color': '#00838f',
            opacity: 1,
          },
        },
        {
          selector: '.path-dim-edge',
          style: {
            opacity: 0.14,
          },
        },
        {
          selector: '.blocked-edge',
          style: {
            opacity: 0.16,
          },
        },
        {
          selector: '.suppressed-edge',
          style: {
            display: 'none',
          },
        },
        {
          selector: '.critical-edge',
          style: {
            width: 5.2,
            'line-color': '#d32f2f',
            'target-arrow-color': '#d32f2f',
            'target-arrow-scale': 3.7,
            opacity: 0.95,
          },
        },
        {
          selector: '.edge-dashed',
          style: {
            'line-style': 'dashed',
          },
        },
        {
          selector: '.is-dimmed',
          style: {
            opacity: 0.14,
          },
        },
        {
          selector: '.is-highlighted',
          style: {
            opacity: 1,
          },
        },
      ],
    })

    cy.on('tap', 'node', (event: any) => {
      const dataNode = event?.target?.data('node') || null
      selectedNode.value = dataNode
      if (dataNode) {
        lockedNodeId.value = dataNode.id
        buildNodeInsights(dataNode.id)
        applyLockedFocusById(dataNode.id)
        emit('node-click', dataNode)
      }
    })

    cy.on('mouseover', 'node', (event: any) => {
      if (lockedNodeId.value) return
      const node = event?.target
      applyNeighborhoodFocus(node)
      selectedNode.value = node?.data('node') || null
      showTooltip(node, event)
      if (selectedNode.value?.id) buildNodeInsights(selectedNode.value.id)
    })

    cy.on('mousemove', 'node', (event: any) => {
      updateTooltipPosition(event)
    })

    cy.on('mouseout', 'node', () => {
      if (lockedNodeId.value) {
        applyLockedFocusById(lockedNodeId.value)
      } else {
        clearGhosting()
      }
      hideTooltip()
    })

    cy.on('tap', (event: any) => {
      if (event?.target === cy) {
        selectedNode.value = null
        selectedNodeInsights.value = null
        lockedNodeId.value = null
        clearGhosting()
      }
    })

    cy.on('zoom pan', () => {
      applyZoomLod()
      updateRadialRingOverlay()
    })

    resizeObserver = new ResizeObserver(() => {
      if (!cy) return

      const containerWidth = chartContainer.value?.clientWidth || 0
      const containerHeight = chartContainer.value?.clientHeight || 0

      if (containerWidth < 40 || containerHeight < 40) {
        wasContainerHidden = true
        return
      }

      if (wasContainerHidden) {
        wasContainerHidden = false
        applyGraph()
        return
      }

      cy.resize()
      cy.fit(undefined, 28)
      updateRadialRingOverlay()
    })
    resizeObserver.observe(chartContainer.value)

    applyGraph()
    if (lockedNodeId.value) {
      applyLockedFocusById(lockedNodeId.value)
      buildNodeInsights(lockedNodeId.value)
    }
    applyZoomLod()
    updateRadialRingOverlay()
  } catch (err: any) {
    renderError.value = err?.message || 'Falha ao inicializar o diagrama PERT.'
  }
}

onMounted(() => {
  initGraph()
})

onBeforeUnmount(() => {
  hideTooltip()
  lockedNodeId.value = null
  selectedNodeInsights.value = null
  resolvedLayoutMode.value = 'hierarchical'
  radialCenterNodeId.value = null
  clearRadialRingOverlay()

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (cy) {
    cy.destroy()
    cy = null
  }
})

watch(
  () => [
    props.nodes,
    props.edges,
    props.onlyCritical,
    props.criticalEdgesOnly,
    props.showAllEdges,
    props.readyNodeIds,
    props.blockedNodeIds,
    props.focusNodeIds,
  ],
  () => {
    if (!cy) {
      initGraph()
      return
    }
    applyGraph()
  },
  { deep: true },
)

watch(
  layoutMode,
  () => {
    if (!cy) {
      initGraph()
      return
    }
    applyGraph()
  },
)
</script>

<style scoped>
.pert-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.layout-toggle :deep(.v-btn) {
  text-transform: none;
}

.chart-container {
  position: relative;
  z-index: 1;
  width: 100%;
  height: min(74vh, 820px);
  min-height: 620px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
}

.chart-wrapper {
  position: relative;
}

.radial-rings-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 6;
  pointer-events: none;
  mix-blend-mode: multiply;
}

.graph-tooltip {
  position: absolute;
  z-index: 15;
  pointer-events: none;
  display: grid;
  gap: 0.1rem;
  min-width: 220px;
  max-width: 250px;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  color: rgba(0, 0, 0, 0.85);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.16);
  font-size: 0.72rem;
  line-height: 1.25;
}

.node-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, auto));
  gap: 0.3rem 0.8rem;
  font-size: 0.77rem;
  color: rgba(0, 0, 0, 0.78);
}

.insight-span {
  color: rgba(0, 0, 0, 0.68);
}
</style>
