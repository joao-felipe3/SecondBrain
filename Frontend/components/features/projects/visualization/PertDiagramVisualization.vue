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
        <v-chip
          v-if="(resolvedLayoutMode === 'radial' || resolvedLayoutMode === 'hierarchical') && radialIntersectionCount !== null"
          size="small"
          :color="radialIntersectionCount > 0 ? 'warning' : 'success'"
          variant="tonal"
        >
          {{ radialIntersectionCount }} intersecoes estimadas
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
import { usePertDiagramState } from '~/composables/features/usePertDiagramState'
import { usePertInteractionManager } from '~/composables/features/usePertInteractionManager'
import { usePertGeometryOptimizer } from '~/composables/features/usePertGeometryOptimizer'
import { usePertRingOverlay } from '~/composables/features/usePertRingOverlay'
import { usePertIntersectionMetrics } from '~/composables/features/usePertIntersectionMetrics'
import { usePertElementsBuilder } from '~/composables/features/usePertElementsBuilder'
import { usePertLayoutEngine } from '~/composables/features/usePertLayoutEngine'
import { usePertLayoutFallbacks } from '~/composables/features/usePertLayoutFallbacks'
import { usePertRenderFinalizer } from '~/composables/features/usePertRenderFinalizer'
import { usePertRetryCoordinator } from '~/composables/features/usePertRetryCoordinator'
import { usePertLayoutPassOrchestrator } from '~/composables/features/usePertLayoutPassOrchestrator'
import { usePertRenderFailureState } from '~/composables/features/usePertRenderFailureState'
import { usePertEmptyGraphHandler } from '~/composables/features/usePertEmptyGraphHandler'
import { usePertPostProcessor } from '~/composables/features/usePertPostProcessor'
import { usePertCytoscapeBootstrap } from '~/composables/features/usePertCytoscapeBootstrap'
import { usePertGraphResizeObserver } from '~/composables/features/usePertGraphResizeObserver'
import { usePertGraphEventBindings } from '~/composables/features/usePertGraphEventBindings'
import { usePertRouteOptimization } from '~/composables/features/usePertRouteOptimization'
import { usePertGraphTopology } from '~/composables/features/usePertGraphTopology'
import { usePertTooltip } from '~/composables/features/usePertTooltip'
import { usePertGraphInitializer } from '~/composables/features/usePertGraphInitializer'

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
  createEmptyRingOverlay,
  computeRingOverlay,
} = usePertRingOverlay()

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
  runRadialRecoveryFallbacks,
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
const radialIntersectionCount = ref<number | null>(null)
const resolvedLayoutMode = ref<Exclude<PertLayoutMode, 'auto'>>('hierarchical')
const radialCenterNodeId = ref<string | null>(null)
const radialRingOverlay = ref<{ cx: number; cy: number; radii: number[]; width: number; height: number }>({
  ...createEmptyRingOverlay(chartContainer.value),
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

const RADIAL_EDGE_INTERSECTION_THRESHOLD = 2


const {
  updateRadialEdgeRouting,
  updateOuterContourRouteNodes,
  optimizeLayoutEdgeIntersections,
} = usePertRouteOptimization({
  getCy: () => cy,
  getResolvedLayoutMode: () => resolvedLayoutMode.value,
  getChartContainer: () => chartContainer.value,
  getEdges: () => props.edges,
  radialEdgeIntersectionThreshold: RADIAL_EDGE_INTERSECTION_THRESHOLD,
})

const clearRadialRingOverlay = () => {
  radialRingOverlay.value = createEmptyRingOverlay(chartContainer.value)
}

const updateRadialRingOverlay = () => {
  radialRingOverlay.value = computeRingOverlay(cy, chartContainer.value, resolvedLayoutMode.value)
}

const estimateRadialIntersections = () => {
  return estimateIntersections(cy)
}

const applyGraph = (retryAttempt = 0, token?: number) => {
  if (!cy) return

  radialIntersectionCount.value = null

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
    setRadialCenterNodeId: (nodeId) => { radialCenterNodeId.value = nodeId },
    clearRadialRingOverlay,
  })) {
    return
  }

  const roots = getRootNodeIds(props.nodes, props.edges)
  const totalNodes = props.nodes.length
  const graphDensity = props.edges.length / Math.max(totalNodes, 1)
  const isDenseGraph = graphDensity > 1.8 || totalNodes > 36
  const autoMode: Exclude<PertLayoutMode, 'auto'> = isDenseGraph && totalNodes >= 18 ? 'radial' : 'hierarchical'
  let activeMode = (layoutMode.value === 'auto' ? autoMode : layoutMode.value) as Exclude<PertLayoutMode, 'auto'>
  const graphLevels = computeGraphLevels(props.nodes, props.edges)

  const layoutPreset = buildLayoutPreset(totalNodes, isDenseGraph)

  const {
    runLayout: runLayoutEngine,
    hasInvalidGeometry,
    fitGraph,
  } = createLayoutRunner({
    cy,
    edges: props.edges,
    nodesCount: props.nodes.length,
    roots,
    dagreRegistered,
    graphLevels,
    isDenseGraph,
    layoutPreset,
  })

  const runLayout = (
    mode: Exclude<PertLayoutMode, 'auto'>,
    radialVariant: 'preset' | 'concentric' | 'circle' = 'preset',
  ) => {
    const ok = runLayoutEngine(mode, radialVariant)
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
      setRadialCenterNodeId: (nodeId) => { radialCenterNodeId.value = nodeId },
      clearRadialRingOverlay,
      setRenderError: (message) => { renderError.value = message },
      message: 'Falha ao aplicar o layout do diagrama PERT.',
    })
    return
  }

  activeMode = initialLayout.mode
  if (initialLayout.notice) {
    layoutFallbackNotice.value = initialLayout.notice
  }

  // Cytoscape can initialize while the carousel page is hidden; force resize/fit afterwards.
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
      updateOuterContourRouteNodes,
      updateRadialEdgeRouting,
      optimizeLayoutEdgeIntersections,
      fitGraph,
    })

    const recoveredLayout = runRadialRecoveryFallbacks({
      activeMode,
      hasInvalidGeometry,
      runLayout,
      onModeApplied: (mode) => {
        applyLayoutPass({
          mode,
          startIds: graphLevels.startIds,
          levelById: graphLevels.levelById,
          postProcess,
          updateOuterContourRouteNodes,
          updateRadialEdgeRouting,
          optimizeLayoutEdgeIntersections,
          fitGraph,
        })
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
        setRadialCenterNodeId: (nodeId) => { radialCenterNodeId.value = nodeId },
        clearRadialRingOverlay,
        setRenderError: (message) => { renderError.value = message },
        message: 'Falha ao renderizar o diagrama PERT neste layout.',
      })
      return
    }

    const layoutState = resolveLayoutState(activeMode, graphLevels.startIds, props.nodes[0]?.id || null)
    resolvedLayoutMode.value = layoutState.resolvedLayoutMode
    radialCenterNodeId.value = layoutState.radialCenterNodeId

    const finalViewport = applyFinalViewportAndVisuals({
      cy,
      activeMode,
      chartContainer: chartContainer.value,
      zoomBoostCap: layoutPreset.zoomBoostCap,
      isDenseGraph,
      lockedNodeId: lockedNodeId.value,
      ensureMinimumRenderedNodeSize,
      applyZoomLod,
      setAllEdgesForceVisible,
      updateRadialRingOverlay,
      estimateIntersections: estimateRadialIntersections,
    })
    radialIntersectionCount.value = finalViewport.radialIntersectionCount
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
        nodes: props.nodes,
        edges: props.edges,
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
        updateRadialRingOverlay,
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
        updateRadialRingOverlay()
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
    }
    applyZoomLod(cy)
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
