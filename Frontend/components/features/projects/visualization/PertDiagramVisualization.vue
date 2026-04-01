<template>
  <v-card elevation="1" class="pert-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1">Diagrama PERT/CPM</span>
      <span class="text-caption text-medium-emphasis">{{ nodes.length }} nos / {{ edges.length }} arestas</span>
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
        <div v-if="selectedNode" class="node-info mt-2">
          <strong>{{ selectedNode.name }}</strong>
          <span>Duracao: {{ selectedNode.durationHours.toFixed(1) }}h</span>
          <span>Folga: {{ selectedNode.slack.toFixed(2) }}h</span>
          <span>ES/EF: {{ selectedNode.earlyStart.toFixed(1) }} / {{ selectedNode.earlyFinish.toFixed(1) }}h</span>
          <span>LS/LF: {{ selectedNode.lateStart.toFixed(1) }} / {{ selectedNode.lateFinish.toFixed(1) }}h</span>
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
}>()

const chartWrapper = ref<HTMLElement | null>(null)
const chartContainer = ref<HTMLElement | null>(null)
const selectedNode = ref<PertDiagramNode | null>(null)
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

const buildElements = () => {
  const isDense = props.nodes.length > 120 || props.edges.length > 220
  const outDegreeMap = new Map<string, number>()
  let maxDuration = 1

  for (const edge of props.edges) {
    outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) || 0) + 1)
  }

  for (const node of props.nodes) {
    maxDuration = Math.max(maxDuration, Number(node.durationHours || 0))
  }

  // Identify parallel edges (same source-target pair) to draw them separated and avoid overlap.
  const pairCount = new Map<string, number>()
  const pairIndex = new Map<string, number>()
  const sourceCount = new Map<string, number>()
  const sourceIndex = new Map<string, number>()
  for (const edge of props.edges) {
    const key = `${edge.source}::${edge.target}`
    pairCount.set(key, (pairCount.get(key) || 0) + 1)
    sourceCount.set(edge.source, (sourceCount.get(edge.source) || 0) + 1)
  }

  const nodeElements = props.nodes.map((node) => {
    const outDegree = outDegreeMap.get(node.id) || 0
    const durationRatio = Math.min(1, Math.max(0, Number(node.durationHours || 0) / maxDuration))
    const riskScore = Math.min(1, (outDegree / 6) * 0.6 + durationRatio * 0.4)
    const visualSize = 46 + riskScore * 26

    return {
      data: {
        id: node.id,
        label: !isDense || node.isCritical ? node.name : '',
        shortLabel: shortLabel(node.name),
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

    const totalForPair = pairCount.get(key) || 1
    const totalFromSource = sourceCount.get(edge.source) || 1
    const centerOffset = index - (totalForPair - 1) / 2
    const fanOffset = sourcePos - (totalFromSource - 1) / 2
    const cpDistance = centerOffset * 44 + fanOffset * 18

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
  const isLarge = props.nodes.length > 28
  const graphDensity = props.edges.length / Math.max(props.nodes.length, 1)
  const isDenseGraph = graphDensity > 2.2
  const layout = dagreRegistered
    ? cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        ranker: 'network-simplex',
        acyclicer: 'greedy',
        align: 'UL',
        nodeSep: isDenseGraph ? 26 : (isLarge ? 24 : 30),
        edgeSep: isDenseGraph ? 52 : (isLarge ? 42 : 32),
        rankSep: isDenseGraph ? 96 : (isLarge ? 88 : 98),
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
    cy.resize()
    cy.fit(undefined, 28)

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
            opacity: 1,
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
          selector: '.no-label',
          style: {
            label: '',
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
          selector: 'edge',
          style: {
            width: 2.6,
            'line-color': 'rgba(66, 66, 66, 0.62)',
            'target-arrow-color': 'rgba(66, 66, 66, 0.92)',
            'target-arrow-shape': 'triangle',
            'target-arrow-scale': 1.45,
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(cpDistance)',
            'control-point-weights': 0.45,
            label: '',
            color: '#424242',
            opacity: 0.95,
          },
        },
        {
          selector: '.parallel-edge',
          style: {
            'curve-style': 'unbundled-bezier',
            'control-point-distances': 'data(cpDistance)',
            'control-point-weights': 0.42,
          },
        },
        {
          selector: '.critical-edge',
          style: {
            width: 3.8,
            'line-color': '#d32f2f',
            'target-arrow-color': '#d32f2f',
            'target-arrow-scale': 1.55,
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
      selectedNode.value = event?.target?.data('node') || null
    })

    cy.on('mouseover', 'node', (event: any) => {
      const node = event?.target
      applyNeighborhoodFocus(node)
      selectedNode.value = node?.data('node') || null
      showTooltip(node, event)
    })

    cy.on('mousemove', 'node', (event: any) => {
      updateTooltipPosition(event)
    })

    cy.on('mouseout', 'node', () => {
      clearGhosting()
      hideTooltip()
    })

    cy.on('tap', (event: any) => {
      if (event?.target === cy) selectedNode.value = null
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
  () => [props.nodes, props.edges, props.onlyCritical, props.criticalEdgesOnly],
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
  height: 500px;
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
</style>
