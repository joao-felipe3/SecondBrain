<template>
  <v-card elevation="1" class="pert-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1">Diagrama PERT/CPM</span>
      <div class="d-flex align-center flex-wrap ga-1">
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
          <v-btn value="force" size="x-small">Forca</v-btn>
        </v-btn-toggle>
        <v-text-field
          v-model.number="intersectionThresholdModel"
          label="Limite de cruzamentos"
          type="number"
          min="0"
          max="20"
          step="1"
          density="compact"
          variant="outlined"
          color="primary"
          hide-details
          class="threshold-field"
        />
        <v-text-field
          v-model.number="impactDelayDaysModel"
          label="Atraso simulado (dias)"
          type="number"
          min="1"
          max="30"
          step="1"
          density="compact"
          variant="outlined"
          color="deep-orange"
          hide-details
          class="impact-delay-field"
        />
        <v-chip
          v-if="layoutFallbackNotice"
          size="small"
          color="warning"
          variant="tonal"
        >
          {{ layoutFallbackNotice }}
        </v-chip>
        <v-chip
          v-if="resolvedLayoutMode === 'hierarchical' || resolvedLayoutMode === 'force'"
          size="x-small"
          :color="routingHiddenEdgeCount > 0 ? 'warning' : 'success'"
          variant="tonal"
        >
          {{ routingHiddenEdgeCount }} arestas ocultas
        </v-chip>
        <v-chip size="x-small" color="success" variant="tonal">{{ readyNowTaskCount }} posso fazer agora</v-chip>
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
          <div ref="chartContainer" class="chart-container" />
          <div
            v-if="tooltip.visible && tooltip.node"
            class="graph-tooltip"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          >
            <strong>{{ tooltip.node.name }}</strong>
            <span>Duracao: {{ tooltip.node.durationHours.toFixed(1) }}h</span>
            <span>Folga: {{ tooltip.node.slack.toFixed(2) }}h</span>
            <span class="tooltip-impact">{{ getImpactMessageForNode(tooltip.node.id) }}</span>
            <span class="tooltip-impact-meta">
              Nos afetados: {{ getImpactSummaryForNode(tooltip.node.id)?.impactedNodeCount ?? 0 }} | Arestas impactadas: {{ getImpactSummaryForNode(tooltip.node.id)?.impactedEdgeCount ?? 0 }}
            </span>
            <span class="tooltip-impact-meta">
              Caminho ate o no: {{ getImpactSummaryForNode(tooltip.node.id)?.traceNodeCount ?? 0 }} nos | {{ getImpactSummaryForNode(tooltip.node.id)?.traceEdgeCount ?? 0 }} arestas
            </span>
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
import type { PertDiagramNode, PertDiagramEdge } from '~/composables/features/pert/usePertDiagramData'
import { usePertDiagramState } from '~/composables/features/pert/usePertDiagramState'
import { usePertInteractionManager } from '~/composables/features/pert/usePertInteractionManager'
import { usePertGeometryOptimizer } from '~/composables/features/pert/usePertGeometryOptimizer'
import { usePertIntersectionMetrics } from '~/composables/features/pert/usePertIntersectionMetrics'
import { usePertElementsBuilder } from '~/composables/features/pert/usePertElementsBuilder'
import { usePertLayoutEngine } from '~/composables/features/pert/usePertLayoutEngine'
import { usePertLayoutFallbacks } from '~/composables/features/pert/usePertLayoutFallbacks'
import { usePertRenderFinalizer } from '~/composables/features/pert/usePertRenderFinalizer'
import { usePertRetryCoordinator } from '~/composables/features/pert/usePertRetryCoordinator'
import { usePertLayoutPassOrchestrator } from '~/composables/features/pert/usePertLayoutPassOrchestrator'
import { usePertRenderFailureState } from '~/composables/features/pert/usePertRenderFailureState'
import { usePertEmptyGraphHandler } from '~/composables/features/pert/usePertEmptyGraphHandler'
import { usePertPostProcessor } from '~/composables/features/pert/usePertPostProcessor'
import { usePertCytoscapeBootstrap } from '~/composables/features/pert/usePertCytoscapeBootstrap'
import { usePertGraphResizeObserver } from '~/composables/features/pert/usePertGraphResizeObserver'
import { usePertGraphEventBindings } from '~/composables/features/pert/usePertGraphEventBindings'
import { usePertRouteOptimization } from '~/composables/features/pert/usePertRouteOptimization'
import { usePertGraphTopology } from '~/composables/features/pert/usePertGraphTopology'
import { usePertTooltip } from '~/composables/features/pert/usePertTooltip'
import { usePertGraphInitializer } from '~/composables/features/pert/usePertGraphInitializer'

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

const {
  selectedNode,
  lockedNodeId,
  selectedNodeInsights,
  tooltip,
  hideTooltip,
  buildNodeInsights,
} = usePertDiagramState()

const {
  clearGhosting,
  setAllEdgesForceVisible,
  applyNeighborhoodFocus,
  applyLockedFocusById,
  applyZoomLod,
} = usePertInteractionManager()

const {
  reorderRowsByBarycenter,
  rebalanceCrowdedRows,
  separateNodeOverlaps,
  normalizeWideAspect,
  ensureMinimumRenderedNodeSize,
} = usePertGeometryOptimizer()

const {
  estimateIntersections,
} = usePertIntersectionMetrics()

const {
  buildElements,
} = usePertElementsBuilder()

const {
  buildLayoutPreset,
  createLayoutRunner,
} = usePertLayoutEngine()

const {
  runInitialLayoutFallback,
  runRecoveryFallbacks,
} = usePertLayoutFallbacks()

const {
  resolveLayoutState,
  applyFinalViewportAndVisuals,
} = usePertRenderFinalizer()

const {
  handleHiddenContainerRetry,
  handleInvalidGeometryRetry,
} = usePertRetryCoordinator()

const {
  applyLayoutPass,
} = usePertLayoutPassOrchestrator()

const {
  applyRenderFailureState,
} = usePertRenderFailureState()

const {
  handleEmptyGraph,
} = usePertEmptyGraphHandler()

const {
  createPostProcess,
} = usePertPostProcessor()

const {
  ensureFactory,
  ensureDagreRegistration,
  createInstance,
} = usePertCytoscapeBootstrap()

const {
  createPertResizeObserver,
} = usePertGraphResizeObserver()

const {
  bindPertGraphEvents,
} = usePertGraphEventBindings()

const {
  initializePertGraph,
} = usePertGraphInitializer()

const {
  getRootNodeIds,
  computeGraphLevels,
} = usePertGraphTopology()

const chartWrapper = ref<HTMLElement | null>(null)
const chartContainer = ref<HTMLElement | null>(null)

const {
  updateTooltipPosition,
  showTooltip,
} = usePertTooltip({
  chartWrapper,
  tooltip,
})

const renderError = ref<string | null>(null)
const layoutFallbackNotice = ref<string | null>(null)
const routingHiddenEdgeCount = ref<number>(0)
const edgeIntersectionThreshold = ref<number>(2)
const resolvedLayoutMode = ref<Exclude<PertLayoutMode, 'auto'>>('hierarchical')
let cy: any = null
let cytoscapeFactory: any = null
let resizeObserver: ResizeObserver | null = null
let dagreRegistered = false
let graphRenderToken = 0
let wasContainerHidden = false
let thresholdApplyTimer: ReturnType<typeof setTimeout> | null = null

type PertLayoutMode = 'auto' | 'hierarchical' | 'force'

type PertImpactSummary = {
  nodeId: string
  impactedNodeIds: Set<string>
  impactedEdgeIds: Set<string>
  traceNodeIds: Set<string>
  traceEdgeIds: Set<string>
  impactedNodeCount: number
  impactedEdgeCount: number
  traceNodeCount: number
  traceEdgeCount: number
  delayDays: number
  slackDays: number
  projectDelayDays: number
  message: string
}

const layoutMode = ref<PertLayoutMode>('auto')

const normalizeIntersectionThreshold = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 2
  return Math.max(0, Math.min(20, Math.floor(parsed)))
}

const normalizeImpactDelayDays = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 2
  return Math.max(1, Math.min(30, Math.floor(parsed)))
}

const intersectionThresholdModel = computed({
  get: () => edgeIntersectionThreshold.value,
  set: (value: unknown) => {
    edgeIntersectionThreshold.value = normalizeIntersectionThreshold(value)
  },
})

const impactDelayDays = ref<number>(2)
const activeImpactNodeId = ref<string | null>(null)
const selectedImpactSummary = ref<PertImpactSummary | null>(null)
let impactPulseTimer: ReturnType<typeof setInterval> | null = null
let impactPulseFlip = false

const impactDelayDaysModel = computed({
  get: () => impactDelayDays.value,
  set: (value: unknown) => {
    impactDelayDays.value = normalizeImpactDelayDays(value)
  },
})

const {
  updateEdgeRouting,
  optimizeLayoutEdgeIntersections,
  getLastOptimizationSummary,
} = usePertRouteOptimization({
  getCy: () => cy,
  getResolvedLayoutMode: () => resolvedLayoutMode.value,
  getEdges: () => props.edges,
  getEdgeIntersectionThreshold: () => edgeIntersectionThreshold.value,
})

const HOURS_PER_DAY = 8

const buildGraphMaps = () => {
  const nodeById = new Map<string, PertDiagramNode>()
  const outgoingBySource = new Map<string, PertDiagramEdge[]>()
  const incomingByTarget = new Map<string, PertDiagramEdge[]>()

  for (const node of props.nodes) {
    nodeById.set(node.id, node)
  }

  for (const edge of props.edges) {
    const outgoing = outgoingBySource.get(edge.source) || []
    outgoing.push(edge)
    outgoingBySource.set(edge.source, outgoing)

    const incoming = incomingByTarget.get(edge.target) || []
    incoming.push(edge)
    incomingByTarget.set(edge.target, incoming)
  }

  return {
    nodeById,
    outgoingBySource,
    incomingByTarget,
  }
}

const computeImpactSummary = (nodeId: string): PertImpactSummary | null => {
  const { nodeById, outgoingBySource, incomingByTarget } = buildGraphMaps()
  const node = nodeById.get(nodeId)
  if (!node) return null

  const delayHours = impactDelayDays.value * HOURS_PER_DAY
  const slackHours = Math.max(0, Number(node.slack || 0))
  const projectDelayHours = Math.max(0, delayHours - slackHours)

  const traceNodeIds = new Set<string>([nodeId])
  const traceEdgeIds = new Set<string>()
  const traceQueue: string[] = [nodeId]

  while (traceQueue.length > 0) {
    const current = traceQueue.shift() as string
    const incomingEdges = incomingByTarget.get(current) || []

    for (const edge of incomingEdges) {
      traceEdgeIds.add(edge.id)
      if (!traceNodeIds.has(edge.source)) {
        traceNodeIds.add(edge.source)
        traceQueue.push(edge.source)
      }
    }
  }

  const impactedNodeIds = new Set<string>([nodeId])
  const impactedEdgeIds = new Set<string>()

  if (projectDelayHours > 0) {
    const queue: string[] = [nodeId]
    while (queue.length > 0) {
      const current = queue.shift() as string
      const outgoing = outgoingBySource.get(current) || []
      for (const edge of outgoing) {
        impactedEdgeIds.add(edge.id)
        if (!impactedNodeIds.has(edge.target)) {
          impactedNodeIds.add(edge.target)
          queue.push(edge.target)
        }
      }
    }
  }

  const delayDays = Number((delayHours / HOURS_PER_DAY).toFixed(1))
  const slackDays = Number((slackHours / HOURS_PER_DAY).toFixed(1))
  const projectDelayDays = Number((projectDelayHours / HOURS_PER_DAY).toFixed(1))
  const message = projectDelayHours > 0
    ? `Se atrasar ${delayDays.toFixed(1)} dias -> projeto atrasa ${projectDelayDays.toFixed(1)} dias.`
    : `Folga absorve ate ${slackDays.toFixed(1)} dias sem atrasar o projeto.`

  return {
    nodeId,
    impactedNodeIds,
    impactedEdgeIds,
    traceNodeIds,
    traceEdgeIds,
    impactedNodeCount: impactedNodeIds.size,
    impactedEdgeCount: impactedEdgeIds.size,
    traceNodeCount: traceNodeIds.size,
    traceEdgeCount: traceEdgeIds.size,
    delayDays,
    slackDays,
    projectDelayDays,
    message,
  }
}


const stopImpactPulseAnimation = () => {
  if (impactPulseTimer) {
    clearInterval(impactPulseTimer)
    impactPulseTimer = null
  }
}

const clearImpactHighlightClasses = () => {
  if (!cy) return
  cy.nodes('.impact-node').removeClass('impact-node')
  cy.nodes('.impact-trace-node').removeClass('impact-trace-node')
  cy.edges('.impact-edge').removeClass('impact-edge impact-edge-pulse-a impact-edge-pulse-b')
  cy.edges('.impact-trace-edge').removeClass('impact-trace-edge impact-trace-pulse-a impact-trace-pulse-b')
}

const startImpactPulseAnimation = () => {
  if (!cy) return
  stopImpactPulseAnimation()
  impactPulseFlip = false
  impactPulseTimer = setInterval(() => {
    if (!cy) return
    const impactedEdges = cy.edges('.impact-edge')
    const traceEdges = cy.edges('.impact-trace-edge')
    if ((!impactedEdges || impactedEdges.length === 0) && (!traceEdges || traceEdges.length === 0)) return

    if (impactedEdges && impactedEdges.length > 0) {
      impactedEdges.toggleClass('impact-edge-pulse-a', impactPulseFlip)
      impactedEdges.toggleClass('impact-edge-pulse-b', !impactPulseFlip)
    }

    if (traceEdges && traceEdges.length > 0) {
      traceEdges.toggleClass('impact-trace-pulse-a', impactPulseFlip)
      traceEdges.toggleClass('impact-trace-pulse-b', !impactPulseFlip)
    }

    impactPulseFlip = !impactPulseFlip
  }, 680)
}

const applyImpactSummaryToGraph = (summary: PertImpactSummary | null) => {
  if (!cy) return
  clearImpactHighlightClasses()
  stopImpactPulseAnimation()

  if (!summary) return

  summary.traceNodeIds.forEach((id) => {
    const node = cy.$id(id)
    if (node && !node.empty()) {
      node.addClass('impact-trace-node')
    }
  })

  summary.traceEdgeIds.forEach((id) => {
    const edge = cy.$id(id)
    if (edge && !edge.empty()) {
      edge.addClass('impact-trace-edge')
    }
  })

  summary.impactedNodeIds.forEach((id) => {
    const node = cy.$id(id)
    if (node && !node.empty()) {
      node.addClass('impact-node')
    }
  })

  summary.impactedEdgeIds.forEach((id) => {
    const edge = cy.$id(id)
    if (edge && !edge.empty()) {
      edge.addClass('impact-edge')
    }
  })

  if (summary.impactedEdgeIds.size > 0 || summary.traceEdgeIds.size > 0) {
    startImpactPulseAnimation()
  }
}

const applyImpactSimulationForNode = (nodeId: string | null) => {
  activeImpactNodeId.value = nodeId
  if (!nodeId) {
    selectedImpactSummary.value = null
    applyImpactSummaryToGraph(null)
    return
  }

  const summary = computeImpactSummary(nodeId)
  selectedImpactSummary.value = summary
  applyImpactSummaryToGraph(summary)
}

const getImpactSummaryForNode = (nodeId: string) => {
  if (!nodeId) return null
  if (selectedImpactSummary.value?.nodeId === nodeId) {
    return selectedImpactSummary.value
  }
  return computeImpactSummary(nodeId)
}

const getImpactMessageForNode = (nodeId: string) => {
  if (!nodeId) return ''
  return getImpactSummaryForNode(nodeId)?.message || ''
}

const syncLockedNodeImpact = () => {
  if (lockedNodeId.value) {
    applyImpactSimulationForNode(lockedNodeId.value)
    return
  }
  applyImpactSimulationForNode(null)
}

const estimateGraphIntersections = () => {
  return estimateIntersections(cy)
}

const syncRouteOptimizationSummary = () => {
  const summary = getLastOptimizationSummary()
  routingHiddenEdgeCount.value = summary.hiddenByThreshold
}

const applyGraph = (retryAttempt = 0, token?: number) => {
  if (!cy) return

  routingHiddenEdgeCount.value = 0

  const activeToken = token ?? ++graphRenderToken
  if (activeToken !== graphRenderToken) return
  const isTokenCurrent = () => activeToken === graphRenderToken

  renderError.value = null
  layoutFallbackNotice.value = null
  cy.elements().remove()
  cy.add(buildElements({
    nodes: props.nodes,
    edges: props.edges,
    layoutMode: layoutMode.value,
    showAllEdges: props.showAllEdges,
    readyNodeIds: props.readyNodeIds,
    blockedNodeIds: props.blockedNodeIds,
    focusNodeIds: props.focusNodeIds,
  }))

  if (handleEmptyGraph({
    cy,
    hasEdges: props.edges.length > 0,
    isTokenCurrent,
    setResolvedLayoutMode: (mode) => { resolvedLayoutMode.value = mode },
  })) {
    return
  }

  const roots = getRootNodeIds(props.nodes, props.edges)
  const totalNodes = props.nodes.length
  const graphDensity = props.edges.length / Math.max(totalNodes, 1)
  const isDenseGraph = graphDensity > 1.8 || totalNodes > 36
  const autoMode: Exclude<PertLayoutMode, 'auto'> = isDenseGraph && totalNodes >= 54
    ? 'force'
    : 'hierarchical'
  let activeMode = (layoutMode.value === 'auto' ? autoMode : layoutMode.value) as Exclude<PertLayoutMode, 'auto'>
  const graphLevels = computeGraphLevels(props.nodes, props.edges)

  const layoutPreset = buildLayoutPreset(totalNodes, isDenseGraph)

  const {
    runLayout: runLayoutEngine,
    hasInvalidGeometry,
    fitGraph,
  } = createLayoutRunner({
    cy,
    nodesCount: props.nodes.length,
    roots,
    dagreRegistered,
    graphLevels,
    isDenseGraph,
    layoutPreset,
  })

  const runLayout = (mode: Exclude<PertLayoutMode, 'auto'>) => {
    const ok = runLayoutEngine(mode)
    if (ok) activeMode = mode
    return ok
  }

  const postProcess = createPostProcess({
    cy,
    isDenseGraph,
    layoutPreset,
    reorderRowsByBarycenter,
    rebalanceCrowdedRows,
    separateNodeOverlaps,
    normalizeWideAspect,
  })

  const initialLayout = runInitialLayoutFallback({
    activeMode,
    requestedLayoutMode: layoutMode.value,
    runLayout,
  })
  if (!initialLayout.ok) {
    applyRenderFailureState({
      setResolvedLayoutMode: (mode) => { resolvedLayoutMode.value = mode },
      setRenderError: (message) => { renderError.value = message },
      message: 'Falha ao aplicar o layout do diagrama PERT.',
    })
    return
  }

  activeMode = initialLayout.mode
  if (initialLayout.notice) {
    layoutFallbackNotice.value = initialLayout.notice
  }

  setTimeout(() => {
    if (!cy || !isTokenCurrent()) return
    const onRetry = (nextRetryAttempt: number) => {
      applyGraph(nextRetryAttempt, activeToken)
    }

    const containerWidth = chartContainer.value?.clientWidth || 0
    const containerHeight = chartContainer.value?.clientHeight || 0
    const hiddenContainerRetry = handleHiddenContainerRetry({
      containerWidth,
      containerHeight,
      retryAttempt,
      isTokenCurrent,
      onRetry,
    })
    if (!hiddenContainerRetry.containerReady) {
      wasContainerHidden = true
      return
    }
    wasContainerHidden = false

    applyLayoutPass({
      mode: activeMode,
      startIds: graphLevels.startIds,
      levelById: graphLevels.levelById,
      postProcess,
      updateEdgeRouting,
      optimizeLayoutEdgeIntersections,
      fitGraph,
    })
    syncRouteOptimizationSummary()

    const recoveredLayout = runRecoveryFallbacks({
      activeMode,
      hasInvalidGeometry,
      runLayout,
      onModeApplied: (mode) => {
        applyLayoutPass({
          mode,
          startIds: graphLevels.startIds,
          levelById: graphLevels.levelById,
          postProcess,
          updateEdgeRouting,
          optimizeLayoutEdgeIntersections,
          fitGraph,
        })
        syncRouteOptimizationSummary()
      },
    })

    activeMode = recoveredLayout.mode
    if (recoveredLayout.notice) {
      layoutFallbackNotice.value = recoveredLayout.notice
    }

    const invalidGeometry = hasInvalidGeometry()
    const invalidGeometryRetry = handleInvalidGeometryRetry({
      invalidGeometry,
      retryAttempt,
      isTokenCurrent,
      onRetry,
    })
    if (invalidGeometryRetry.shouldReturn) {
      return
    }

    if (invalidGeometry) {
      applyRenderFailureState({
        setResolvedLayoutMode: (mode) => { resolvedLayoutMode.value = mode },
        setRenderError: (message) => { renderError.value = message },
        message: 'Falha ao renderizar o diagrama PERT neste layout.',
      })
      return
    }

    const layoutState = resolveLayoutState(activeMode, graphLevels.startIds, props.nodes[0]?.id || null)
    resolvedLayoutMode.value = layoutState.resolvedLayoutMode

    applyFinalViewportAndVisuals({
      cy,
      activeMode,
      chartContainer: chartContainer.value,
      zoomBoostCap: layoutPreset.zoomBoostCap,
      isDenseGraph,
      lockedNodeId: lockedNodeId.value,
      ensureMinimumRenderedNodeSize,
      applyZoomLod,
      setAllEdgesForceVisible,
      estimateIntersections: estimateGraphIntersections,
    })

    if (lockedNodeId.value) {
      applyLockedFocusById(cy, lockedNodeId.value)
    }
    syncLockedNodeImpact()
  }, 60)
}

const initGraph = async () => {
  if (!chartContainer.value) return
  renderError.value = null

  try {
    const initialized = await initializePertGraph({
      chartContainer: chartContainer.value,
      currentFactory: cytoscapeFactory,
      dagreRegistered,
      ensureFactory,
      ensureDagreRegistration,
      createInstance,
      bindPertGraphEvents,
      bindEventsParams: {
        selectedNode,
        lockedNodeId,
        selectedNodeInsights,
        getNodes: () => props.nodes,
        getEdges: () => props.edges,
        setAllEdgesForceVisible,
        buildNodeInsights,
        applyLockedFocusById,
        emitNodeClick: (node: PertDiagramNode) => {
          emit('node-click', node)
        },
        applyNeighborhoodFocus,
        showTooltip,
        updateTooltipPosition,
        clearGhosting,
        hideTooltip,
        applyZoomLod,
        onNodeHover: (node: PertDiagramNode) => {
          if (!lockedNodeId.value && node?.id) {
            applyImpactSimulationForNode(node.id)
          }
        },
        onNodeTap: (node: PertDiagramNode) => {
          if (node?.id) {
            applyImpactSimulationForNode(node.id)
          }
        },
        onNodeOut: () => {
          if (lockedNodeId.value) {
            applyImpactSimulationForNode(lockedNodeId.value)
            return
          }
          applyImpactSimulationForNode(null)
        },
        onCanvasTap: () => {
          applyImpactSimulationForNode(null)
        },
      },
      createPertResizeObserver,
      getWasContainerHidden: () => wasContainerHidden,
      setWasContainerHidden: (value) => {
        wasContainerHidden = value
      },
      onContainerRevealed: () => {
        applyGraph()
      },
      onRegularResize: (currentCy) => {
        currentCy.resize()
        currentCy.fit(undefined, 28)
      },
    })

    if (!initialized) return

    cy = initialized.cy
    cytoscapeFactory = initialized.cytoscapeFactory
    dagreRegistered = initialized.dagreRegistered
    resizeObserver = initialized.resizeObserver

    applyGraph()
    if (lockedNodeId.value) {
      applyLockedFocusById(cy, lockedNodeId.value)
      buildNodeInsights(lockedNodeId.value, props.nodes, props.edges)
      applyImpactSimulationForNode(lockedNodeId.value)
    }
    applyZoomLod(cy)
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
  selectedImpactSummary.value = null
  activeImpactNodeId.value = null
  resolvedLayoutMode.value = 'hierarchical'

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (thresholdApplyTimer) {
    clearTimeout(thresholdApplyTimer)
    thresholdApplyTimer = null
  }

  stopImpactPulseAnimation()

  if (cy) {
    clearImpactHighlightClasses()
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

watch(
  edgeIntersectionThreshold,
  () => {
    if (!cy) {
      initGraph()
      return
    }

    if (thresholdApplyTimer) {
      clearTimeout(thresholdApplyTimer)
      thresholdApplyTimer = null
    }

    thresholdApplyTimer = setTimeout(() => {
      thresholdApplyTimer = null
      applyGraph()
    }, 140)
  },
)

watch(
  impactDelayDays,
  () => {
    const targetNodeId = lockedNodeId.value || activeImpactNodeId.value
    if (!targetNodeId) return
    applyImpactSimulationForNode(targetNodeId)
  },
)

watch(
  () => [props.nodes, props.edges],
  () => {
    const targetNodeId = lockedNodeId.value || activeImpactNodeId.value
    if (!targetNodeId) return
    applyImpactSimulationForNode(targetNodeId)
  },
  { deep: true },
)
</script>

<style scoped>
.pert-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.layout-toggle :deep(.v-btn) {
  text-transform: none;
}

.threshold-field {
  max-width: 190px;
}

.impact-delay-field {
  max-width: 185px;
}

.threshold-field :deep(input) {
  text-align: right;
}

.impact-delay-field :deep(input) {
  text-align: right;
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
  min-width: 0;
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

.tooltip-impact {
  color: rgba(191, 54, 12, 0.95);
  font-weight: 600;
}

.tooltip-impact-meta {
  margin-top: 0.05rem;
  color: rgba(0, 0, 0, 0.72);
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
