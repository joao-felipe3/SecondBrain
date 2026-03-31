<template>
  <v-card elevation="1" class="gantt-card">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1">Timeline Gantt</span>
      <div class="d-flex align-center ga-3">
        <span class="text-caption text-medium-emphasis">{{ tasks.length }} tarefas</span>
        <v-switch
          v-model="showDependencies"
          label="Dependencias"
          density="compact"
          hide-details
          color="primary"
        />
        <v-switch
          v-model="showLabels"
          label="Rotulos"
          density="compact"
          hide-details
          color="primary"
        />
      </div>
    </v-card-title>

    <v-card-text class="pt-2">
      <div class="legend-row mb-2">
        <span><i class="dot critical" /> Critica</span>
        <span><i class="dot regular" /> Em andamento</span>
        <span><i class="dot done" /> Concluida</span>
        <span><i class="today-line" /> Hoje</span>
      </div>

      <div v-if="tasks.length === 0" class="text-caption text-medium-emphasis">
        Sem tarefas para exibir no Gantt.
      </div>
      <div v-else ref="chartContainer" class="chart-container" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { GanttTaskItem, GanttDependencyItem } from '~/composables/features/useGanttData'

const props = defineProps<{
  tasks: GanttTaskItem[]
  dependencies: GanttDependencyItem[]
  criticalPath: string[]
}>()

const chartContainer = ref<HTMLElement | null>(null)
const showDependencies = ref(true)
const showLabels = ref(true)
let chart: echarts.ECharts | null = null

const buildOption = () => {
  const sorted = [...props.tasks].sort((a, b) => a.earlyStart - b.earlyStart)
  const labels = sorted.map((task) => task.name)
  const taskById = new Map(sorted.map((task, index) => [task.id, { task, index }]))
  const criticalSet = new Set(props.criticalPath)
  const labelFontSize = sorted.length > 60 ? 10 : 11

  const now = new Date()
  const nowMs = now.getTime()

  const data = sorted.map((task, index) => {
    const start = new Date(task.startDate).getTime()
    const end = new Date(task.endDate).getTime()
    const progress = Math.max(0, Math.min(100, Number(task.progress || 0)))
    const baseColor = task.isCritical ? '#d32f2f' : task.isConcluded ? '#2e7d32' : '#1976d2'
    const progressColor = task.isCritical ? '#ef5350' : task.isConcluded ? '#66bb6a' : '#64b5f6'

    return {
      value: [index, start, end, task.durationHours, progress, task.isCritical ? 1 : 0],
      itemStyle: {
        color: baseColor,
      },
      progressStyle: {
        color: progressColor,
      },
      task,
      isPast: end < nowMs,
    }
  })

  const dependencyData = props.dependencies
    .map((dependency) => {
      const from = taskById.get(dependency.fromTaskId)
      const to = taskById.get(dependency.toTaskId)
      if (!from || !to) return null

      const fromEnd = new Date(from.task.endDate).getTime()
      const toStart = new Date(to.task.startDate).getTime()
      const isCriticalEdge = criticalSet.has(dependency.fromTaskId) && criticalSet.has(dependency.toTaskId)

      return {
        value: [fromEnd, toStart, from.index, to.index, isCriticalEdge ? 1 : 0],
        dependency,
      }
    })
    .filter(Boolean)

  const minStart = data.length > 0 ? Math.min(...data.map((item: any) => item.value[1])) : nowMs
  const maxEnd = data.length > 0 ? Math.max(...data.map((item: any) => item.value[2])) : nowMs
  const pad = Math.max(12 * 60 * 60 * 1000, Math.round((maxEnd - minStart) * 0.04))

  const dependencySeries = showDependencies.value
    ? [{
        type: 'custom',
        z: 1,
        silent: true,
        renderItem(params: any, api: any) {
          const fromX = api.coord([api.value(0), api.value(2)])
          const toX = api.coord([api.value(1), api.value(3)])
          const isCriticalEdge = Boolean(api.value(4))

          const midX = fromX[0] + 12
          const color = isCriticalEdge ? '#d32f2f' : '#9e9e9e'

          return {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: { x1: fromX[0], y1: fromX[1], x2: midX, y2: fromX[1] },
                style: { stroke: color, lineWidth: isCriticalEdge ? 2.3 : 1.1, opacity: isCriticalEdge ? 0.95 : 0.7 },
              },
              {
                type: 'line',
                shape: { x1: midX, y1: fromX[1], x2: midX, y2: toX[1] },
                style: { stroke: color, lineWidth: isCriticalEdge ? 2.3 : 1.1, opacity: isCriticalEdge ? 0.95 : 0.7 },
              },
              {
                type: 'line',
                shape: { x1: midX, y1: toX[1], x2: toX[0] - 6, y2: toX[1] },
                style: { stroke: color, lineWidth: isCriticalEdge ? 2.3 : 1.1, opacity: isCriticalEdge ? 0.95 : 0.7 },
              },
              {
                type: 'polygon',
                shape: {
                  points: [
                    [toX[0] - 6, toX[1] - 4],
                    [toX[0] - 6, toX[1] + 4],
                    [toX[0], toX[1]],
                  ],
                },
                style: { fill: color, stroke: color, opacity: isCriticalEdge ? 0.95 : 0.75 },
              },
            ],
          }
        },
        encode: { x: [0, 1], y: [2, 3] },
        data: dependencyData,
      }]
    : []

  return {
    animationDuration: 450,
    grid: { top: 18, left: 190, right: 24, bottom: 48 },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const dependency = params?.data?.dependency as GanttDependencyItem
        if (dependency) {
          const relationship = dependency.relationship || 'finish-to-start'
          return [
            '<strong>Dependencia</strong>',
            `Tipo: ${relationship}`,
            `Origem: ${dependency.fromTaskId.slice(0, 8)}...`,
            `Destino: ${dependency.toTaskId.slice(0, 8)}...`,
          ].join('<br/>')
        }

        const task = params?.data?.task as GanttTaskItem
        if (!task) return ''
        return [
          `<strong>${task.name}</strong>`,
          `Duracao: ${task.durationHours.toFixed(1)}h`,
          `Folga: ${task.slack.toFixed(2)}h`,
          `Progresso: ${Math.round(task.progress)}%`,
          `Critica: ${task.isCritical ? 'Sim' : 'Nao'}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'time',
      min: minStart - pad,
      max: maxEnd + pad,
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(0,0,0,0.08)', type: 'dashed' },
      },
      axisLabel: {
        formatter: (value: number) => {
          const date = new Date(value)
          return `${date.getDate()}/${date.getMonth() + 1}`
        },
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: labels,
      axisLabel: {
        width: 180,
        fontSize: labelFontSize,
        overflow: 'truncate',
      },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, height: 14, bottom: 4 },
    ],
    series: [
      ...dependencySeries,
      {
        type: 'custom',
        z: 2,
        renderItem(params: any, api: any) {
          const categoryIndex = api.value(0)
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const height = Math.max(8, api.size([0, 1])[1] * 0.6)
          const progress = Math.max(0, Math.min(100, Number(api.value(4) || 0)))
          const isCritical = Boolean(api.value(5))
          const width = Math.max(2, end[0] - start[0])
          const progressWidth = Math.max(2, (width * progress) / 100)

          const fill = api.style()
          const progressFill = api.style({ fill: params.data.progressStyle?.color || '#7cb342' })

          const children: any[] = [
            {
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - height / 2,
                width,
                height,
                r: 4,
              },
              style: fill,
            },
            {
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - height / 2,
                width: Math.min(width, progressWidth),
                height,
                r: 4,
              },
              style: progressFill,
            },
          ]

          if (isCritical) {
            children.push({
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - height / 2,
                width,
                height,
                r: 4,
              },
              style: {
                fill: 'transparent',
                stroke: '#8b0000',
                lineWidth: 1.2,
              },
            })
          }

          if (showLabels.value && width > 52) {
            children.push({
              type: 'text',
              style: {
                x: start[0] + 6,
                y: start[1],
                text: `${Math.round(progress)}%`,
                fill: '#ffffff',
                fontSize: 10,
                fontWeight: 600,
                textVerticalAlign: 'middle',
              },
            })
          }

          return {
            type: 'group',
            children,
          }
        },
        encode: { x: [1, 2], y: 0 },
        data,
      },
      {
        type: 'line',
        z: 0,
        silent: true,
        data: [],
        markLine: {
          symbol: 'none',
          animation: false,
          label: {
            formatter: 'Hoje',
            color: '#ef6c00',
            fontWeight: 700,
          },
          lineStyle: {
            color: '#ef6c00',
            width: 1.3,
            type: 'dashed',
          },
          data: [{ xAxis: nowMs }],
        },
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
  () => [props.tasks, props.dependencies, props.criticalPath, showDependencies.value, showLabels.value],
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
.gantt-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.chart-container {
  width: 100%;
  height: 460px;
}

.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.7);
}

.legend-row span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.dot.critical {
  background: #d32f2f;
}

.dot.regular {
  background: #1976d2;
}

.dot.done {
  background: #2e7d32;
}

.today-line {
  width: 16px;
  height: 0;
  border-top: 2px dashed #ef6c00;
  display: inline-block;
}
</style>
