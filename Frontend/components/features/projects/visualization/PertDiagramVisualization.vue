<template>
  <v-card elevation="1" class="pert-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1">Diagrama PERT/CPM</span>
      <v-chip size="small" color="success" variant="tonal">{{ readyNowTaskCount }} posso fazer agora</v-chip>
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const buildElements = () => {
  const isDense = props.nodes.length > 120 || props.edges.length > 220
  const readySet = new Set(props.readyNodeIds || [])
  const blockedSet = new Set(props.blockedNodeIds || [])
  const focusSet = new Set(props.focusNodeIds || [])
  const showAllEdges = Boolean(props.showAllEdges)
  const hasFocus = focusSet.size > 0
  const nodeById = new Map(props.nodes.map((node) => [node.id, node]))
  const outDegreeMap = new Map<string, number>()
  const inDegreeMap = new Map<string, number>()
  const childrenById = new Map<string, string[]>()
  let maxDuration = 1

  for (const edge of props.edges) {
    outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) || 0) + 1)
    inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1)
    const children = childrenById.get(edge.source) || []
    children.push(edge.target)
    childrenById.set(edge.source, children)
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

  const nodeElements = orderedNodes.map((node) => {
    const outDegree = outDegreeMap.get(node.id) || 0
    const durationRatio = Math.min(1, Math.max(0, Number(node.durationHours || 0) / maxDuration))
    const riskScore = Math.min(1, (outDegree / 6) * 0.6 + durationRatio * 0.4)
    const visualSize = 46 + riskScore * 26
    const layer = levelById.get(node.id) || 0
    const groupKey = String(node.name || '').split(/[.\-_/ ]/)[0] || 'task'
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

  const edgeElements = props.edges.map((edge) => {
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
    const cpDistance = centerOffset * 36 + fanOffset * 12 - targetFanOffset * 10
    const sourceLayer = levelById.get(edge.source) || 0
    const targetLayer = levelById.get(edge.target) || 0
    const isLongJump = Math.abs(targetLayer - sourceLayer) > 1
    const isFocusEdge = hasFocus && focusSet.has(edge.source) && focusSet.has(edge.target)
    const isDimmedEdge = hasFocus && !isFocusEdge
    const isBlockedEdge = blockedSet.has(edge.target)
    const isPriorityEdge = edge.isCriticalEdge || readySet.has(edge.source) || readySet.has(edge.target)
    const isIdleDecluttered = !hasFocus && !showAllEdges && !isPriorityEdge

    return {
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: isDense ? '' : relationLabel(edge.relationship),
        cpDistance,
        edge,
      },
      classes: [
        edge.isCriticalEdge ? 'critical-edge' : 'regular-edge',
        'fan-edge',
        isFocusEdge ? 'path-edge' : '',
        isDimmedEdge ? 'path-dim-edge' : '',
        isBlockedEdge ? 'blocked-edge' : '',
        isLongJump ? 'long-edge' : '',
        isIdleDecluttered ? 'idle-edge' : '',
        totalForPair > 1 ? 'parallel-edge' : '',
        edge.relationship === 'finish-to-start' ? 'edge-fs' : 'edge-dashed',
      ].join(' '),
    }
  })

  return [...nodeElements, ...edgeElements]
}

const getRootNodeIds = () => {
  const hasIncoming = new Set<string>()
  for (const edge of props.edges) hasIncoming.add(edge.target)
  return props.nodes
    .filter((node) => !hasIncoming.has(node.id))
    .map((node) => node.id)
}

const applyZoomLod = () => {
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

const reorderRowsByBarycenter = () => {
  if (!cy) return

  const allNodes = cy.nodes()
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
    const centerX = layerNodes.reduce((sum, node) => sum + Number(node.position()?.x || 0), 0) / Math.max(layerNodes.length, 1)
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

  const allNodes = cy.nodes()
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
    const rowCenterX = sortedByX.reduce((sum, node) => sum + Number(node.position()?.x || 0), 0) / sortedByX.length

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

const normalizeWideAspect = (maxAspectRatio = 1.9, minCompression = 0.58) => {
  if (!cy) return
  const nodes = cy.nodes()
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

const applyGraph = () => {
  if (!cy) return
  cy.elements().remove()
  cy.add(buildElements())

  if (props.edges.length === 0) {
    cy.layout({
      name: 'grid',
      fit: false,
      avoidOverlap: true,
      spacingFactor: 1.2,
      padding: 26,
      animate: false,
    }).run()

    setTimeout(() => {
      if (!cy) return
      cy.resize()
      cy.fit(undefined, 28)
    }, 60)
    return
  }

  const roots = getRootNodeIds()
  const totalNodes = props.nodes.length
  const graphDensity = props.edges.length / Math.max(totalNodes, 1)
  const isDenseGraph = graphDensity > 2.2

  const layoutPreset = totalNodes <= 20
    ? {
        nodeSep: isDenseGraph ? 52 : 56,
        edgeSep: 34,
        rankSep: 102,
        rowMax: 9,
        rowSpacing: 82,
        colSpacing: 84,
        aspect: 1.85,
        minCompression: 0.64,
        normalizeAspect: true,
        zoomBoostCap: 1.55,
      }
    : totalNodes <= 34
      ? {
          nodeSep: isDenseGraph ? 46 : 50,
          edgeSep: 40,
          rankSep: 94,
          rowMax: 9,
          rowSpacing: 78,
          colSpacing: 76,
          aspect: 1.7,
          minCompression: 0.68,
          normalizeAspect: true,
          zoomBoostCap: 1.48,
        }
      : {
          nodeSep: isDenseGraph ? 54 : 58,
          edgeSep: 38,
          rankSep: 106,
          rowMax: 11,
          rowSpacing: 90,
          colSpacing: 92,
          aspect: 2.4,
          minCompression: 0.78,
          normalizeAspect: false,
          zoomBoostCap: 1.18,
        }

  const layout = dagreRegistered
    ? cy.layout({
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
    : cy.layout({
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

  layout.run()

  // Cytoscape can initialize while the carousel page is hidden; force resize/fit afterwards.
  setTimeout(() => {
    if (!cy) return

    // Layer = horizontal row in this visualization; split crowded rows into sub-rows.
    rebalanceCrowdedRows(layoutPreset.rowMax, layoutPreset.rowSpacing, layoutPreset.colSpacing)

    // Reorder lower rows by predecessor barycenter to reduce edge crossings.
    reorderRowsByBarycenter()

    // Keep the diagram balanced; avoid ultra-wide layouts with poor height usage.
    if (layoutPreset.normalizeAspect) {
      normalizeWideAspect(layoutPreset.aspect, layoutPreset.minCompression)
    }

    cy.resize()
    cy.fit(undefined, 28)

    // Use more of the vertical canvas when fit leaves too much empty height.
    const graphBounds = cy.elements().boundingBox()
    const containerHeight = chartContainer.value?.clientHeight || 1
    const heightUsage = graphBounds.h / Math.max(containerHeight, 1)
    if (heightUsage < 0.68) {
      const factor = Math.min(layoutPreset.zoomBoostCap, 0.78 / Math.max(heightUsage, 0.08))
      const boosted = Math.min(2.2, cy.zoom() * factor)
      cy.zoom(boosted)
    }

    // Keep fitted zoom for denser diagrams to avoid re-crowding after layout.
    cy.center()

    applyZoomLod()
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
            opacity: 0.36,
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
            opacity: 0.18,
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
            opacity: 0.36,
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
            'curve-style': 'taxi',
            'taxi-direction': 'downward',
            'taxi-radius': 12,
            'taxi-turn': '52%',
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
          selector: '.idle-edge',
          style: {
            width: 2.2,
            opacity: 0.2,
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

    cy.on('zoom', () => {
      applyZoomLod()
    })

    resizeObserver = new ResizeObserver(() => {
      if (!cy) return
      cy.resize()
      cy.fit(undefined, 28)
    })
    resizeObserver.observe(chartContainer.value)

    applyGraph()
    if (lockedNodeId.value) {
      applyLockedFocusById(lockedNodeId.value)
      buildNodeInsights(lockedNodeId.value)
    }
    applyZoomLod()
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
</script>

<style scoped>
.pert-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.chart-container {
  width: 100%;
  height: min(72vh, 760px);
  min-height: 560px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
}

.chart-wrapper {
  position: relative;
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
