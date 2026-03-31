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
      <div v-else ref="chartContainer" class="chart-container" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { PertDiagramNode, PertDiagramEdge } from '~/composables/features/usePertDiagramData'

const props = defineProps<{
  nodes: PertDiagramNode[]
  edges: PertDiagramEdge[]
  onlyCritical?: boolean
}>()

const chartContainer = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const buildOption = () => {
  const nodes = props.nodes || []
  const edges = props.edges || []

  const maxX = Math.max(1, ...nodes.map((node) => Number(node.x || 0)))
  const maxY = Math.max(1, ...nodes.map((node) => Number(node.y || 0)))

  return {
    animationDuration: 350,
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params?.dataType === 'edge') {
          const edge = params?.data as PertDiagramEdge
          return [
            '<strong>Dependencia</strong>',
            `Tipo: ${edge?.relationship || 'finish-to-start'}`,
            edge?.reason ? `Motivo: ${edge.reason}` : null,
          ].filter(Boolean).join('<br/>')
        }

        const node = params?.data as PertDiagramNode
        if (!node) return ''

        return [
          `<strong>${node.name}</strong>`,
          `Duracao: ${node.durationHours.toFixed(1)}h`,
          `Folga: ${node.slack.toFixed(2)}h`,
          `ES/EF: ${node.earlyStart.toFixed(1)} / ${node.earlyFinish.toFixed(1)}h`,
          `LS/LF: ${node.lateStart.toFixed(1)} / ${node.lateFinish.toFixed(1)}h`,
          `Progresso: ${Math.round(node.progress)}%`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      min: -0.5,
      max: maxX + 0.8,
      splitLine: {
        lineStyle: { color: 'rgba(0,0,0,0.08)', type: 'dashed' },
      },
      axisLabel: {
        formatter: (value: number) => `L${Math.round(value)}`,
      },
      name: 'Nivel de Dependencia',
      nameGap: 24,
    },
    yAxis: {
      type: 'value',
      min: -0.5,
      max: maxY + 1,
      inverse: true,
      splitLine: {
        lineStyle: { color: 'rgba(0,0,0,0.06)' },
      },
      name: 'Inicio Antecipado (h)',
      nameGap: 36,
    },
    series: [
      {
        type: 'graph',
        coordinateSystem: 'cartesian2d',
        roam: true,
        draggable: false,
        symbolSize: (value: any, params: any) => {
          const duration = Number(params?.data?.durationHours || 1)
          return Math.max(18, Math.min(44, 18 + duration * 1.6))
        },
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => params?.data?.name || '',
          fontSize: 11,
          overflow: 'truncate',
          width: 180,
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        lineStyle: {
          width: 1.2,
          color: 'rgba(33, 33, 33, 0.35)',
          curveness: 0.08,
        },
        emphasis: {
          focus: 'adjacency',
        },
        data: nodes.map((node) => ({
          ...node,
          x: Number(node.x || 0),
          y: Number(node.y || 0),
          itemStyle: {
            color: node.isCritical ? '#d32f2f' : node.isConcluded ? '#2e7d32' : '#1976d2',
            borderColor: node.isCritical ? '#8b0000' : '#0d47a1',
            borderWidth: node.isCritical ? 2 : 1,
          },
        })),
        links: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          lineStyle: {
            width: edge.isCriticalEdge ? 2.3 : 1.1,
            color: edge.isCriticalEdge ? '#d32f2f' : 'rgba(33, 33, 33, 0.35)',
            type: edge.relationship === 'finish-to-start' ? 'solid' : 'dashed',
            opacity: edge.isCriticalEdge ? 0.95 : 0.7,
          },
          value: edge.relationship,
          edge,
        })),
      },
    ],
  }
}

const initChart = () => {
  if (!chartContainer.value) return
  chart = echarts.init(chartContainer.value)
  chart.setOption(buildOption())
}

const resize = () => chart?.resize()

onMounted(() => {
  initChart()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})

watch(
  () => [props.nodes, props.edges, props.onlyCritical],
  () => {
    if (!chart) {
      initChart()
      return
    }
    chart.setOption(buildOption(), true)
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
  height: 480px;
}
</style>
