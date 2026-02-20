<template>
  <div class="wbs-tree-container">
    <v-card class="tree-card" :elevation="6">
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div>
          <div class="text-h6">🌳 Árvore de Geração</div>
          <div class="text-caption text-medium-emphasis">{{ leafNodes.length }} pacotes • {{ totalTasks }} tasks</div>
        </div>
        
        <div class="d-flex gap-2 align-center">
          <v-btn 
            icon="mdi-zoom-in" 
            size="small" 
            variant="text"
            @click="zoomIn"
            :disabled="zoom >= 2"
          />
          <span class="text-caption" style="min-width: 30px; text-align: center;">{{ (zoom * 100).toFixed(0) }}%</span>
          <v-btn 
            icon="mdi-zoom-out" 
            size="small" 
            variant="text"
            @click="zoomOut"
            :disabled="zoom <= 0.5"
          />
          <v-btn 
            icon="mdi-magnify" 
            size="small" 
            variant="text"
            @click="resetZoom"
          />
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0" style="height: 300px; position: relative; overflow: hidden;">
        <div ref="chartContainer" style="width: 100%; height: 100%;" />
      </v-card-text>

      <v-divider />

      <v-card-text class="pa-3">
        <div class="d-flex gap-2 flex-wrap">
          <div class="d-flex align-center gap-1">
            <div style="width: 12px; height: 12px; margin:0 0.3rem; background: #E53935; border-radius: 50%;"></div>
            <span class="text-caption">P1 (Crítica)</span>
          </div>
          <div class="d-flex align-center gap-1">
            <div style="width: 12px; height: 12px; margin:0 0.3rem; background: #FB8C00; border-radius: 50%;"></div>
            <span class="text-caption">P2 (Alta)</span>
          </div>
          <div class="d-flex align-center gap-1">
            <div style="width: 12px; height: 12px; margin:0 0.3rem; background: #1E88E5; border-radius: 50%;"></div>
            <span class="text-caption">P3 (Média)</span>
          </div>
          <div class="d-flex align-center gap-1">
            <div style="width: 12px; height: 12px; margin:0 0.3rem; background: #43A047; border-radius: 50%;"></div>
            <span class="text-caption">P4 (Baixa)</span>
          </div>
          <v-divider vertical class="mx-2" />
          <div class="d-flex align-center gap-1">
            <v-icon size="small">mdi-check-circle</v-icon>
            <span class="text-caption">Concluído</span>
          </div>
          <div class="d-flex align-center gap-1">
            <v-icon size="small" style="color: #1E88E5;">mdi-circle</v-icon>
            <span class="text-caption">Atual</span>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { PropType } from 'vue'
import * as echarts from 'echarts'

interface WBSNode {
  _id?: string
  name: string
  description?: string
  level: number
  estimatedHours: number
  children?: WBSNode[]
}

interface LeafNode {
  node: WBSNode
  path: string
  level: number
  generatedTasks?: any[]
  generatedHours?: number
}

const props = defineProps({
  leafNodes: { type: Array as PropType<LeafNode[]>, default: () => [] },
  currentIndex: { type: Number, default: 0 },
})

const emit = defineEmits<{
  (e: 'leaf-clicked', leafNode: LeafNode): void
  (e: 'task-clicked', task: any): void
}>()

const chartContainer = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
const zoom = ref(1)

const totalTasks = computed(() => 
  props.leafNodes.reduce((sum, leaf) => sum + (leaf.generatedTasks?.length || 0), 0)
)

function getPriorityColor(priority: number): string {
  const colors: Record<number, string> = {
    1: '#E53935', // Crítica - Vermelho
    2: '#FB8C00', // Alta - Laranja
    3: '#1E88E5', // Média - Azul
    4: '#43A047', // Baixa - Verde
  }
  return colors[priority] || '#757575'
}

function getMicroTaskTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    prepare: '📋',
    practice: '⚙️',
    produce: '📝',
    test: '✅',
    consolidate: '🎯',
    review: '👀',
  }
  return icons[type] || '•'
}

function handleChartClick(params: any) {
  // Check if clicked on a node
  if (params.data) {
    const currentLeaf = props.leafNodes[props.currentIndex]
    if (currentLeaf) {
      emit('leaf-clicked', currentLeaf)
    }
  }
}

function buildTreeData() {
  if (props.leafNodes.length === 0) {
    return {
      name: '🌳 Sem dados',
      children: [],
      itemStyle: { color: '#90A4AE' },
    }
  }

  const leafNodes = props.leafNodes
  const currentLeaf = leafNodes[props.currentIndex]

  if (!currentLeaf || !currentLeaf.generatedTasks?.length) {
    return {
      name: `📦 ${currentLeaf?.node.name || 'Carregando...'}`,
      children: [],
      itemStyle: { color: '#1E88E5' },
    }
  }

  // Group tasks by theme or type
  const tasksByTheme = new Map<string, any[]>()
  for (const task of currentLeaf.generatedTasks) {
    const theme = String(task.themeTag || 'Outros').trim() || 'Outros'
    if (!tasksByTheme.has(theme)) {
      tasksByTheme.set(theme, [])
    }
    tasksByTheme.get(theme)!.push(task)
  }

  // Build tree structure
  const children = Array.from(tasksByTheme.entries()).map(([theme, tasks]) => ({
    name: `${theme} (${tasks.length})`,
    children: tasks.map((task: any) => ({
      name: `${getMicroTaskTypeIcon(task.microTaskType)} ${task.name}`,
      itemStyle: {
        color: getPriorityColor(task.priority || 3),
        opacity: 0.8,
      },
      symbolSize: Math.max(20, Math.min(35, (task.pomodorosPlanned || 1) * 5)),
      value: `${task.pomodorosPlanned}🍅 ${task.cognitiveMode}`,
    })),
    itemStyle: {
      color: '#558B2F',
      opacity: 0.6,
    },
  }))

  return {
    name: `🌳 ${currentLeaf.node.name}`,
    children,
    itemStyle: {
      color: '#2E7D32',
    },
  }
}

function buildChartOption() {
  const treeData = buildTreeData()

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        if (params.data.value) {
          return `
            <div style="padding: 8px;">
              <strong>${params.name}</strong><br>
              <span style="font-size: 12px; color: #999;">${params.data.value}</span>
            </div>
          `
        }
        return params.name
      },
    },
    series: [
      {
        type: 'tree',
        data: [treeData],
        top: '10%',
        left: '10%',
        bottom: '10%',
        right: '10%',
        symbol: 'circle',
        symbolSize: [25, 25],
        initialTreeDepth: 2,
        roam: true, // Enable panning and zooming
        label: {
          position: 'top',
          verticalAlign: 'middle',
          align: 'center',
          fontSize: 11,
          fontWeight: 'bold',
        },
        leaves: {
          label: {
            position: 'right',
            align: 'left',
            fontSize: 10,
          },
        },
        emphasis: {
          focus: 'descendant',
          itemStyle: {
            borderWidth: 3,
            borderColor: '#FFD700',
            opacity: 1,
            shadowBlur: 10,
            shadowColor: '#FFD700',
          },
          label: {
            fontSize: 12,
            fontWeight: 'bold',
          },
        },
        animationDuration: 750,
        animationEasing: 'cubicOut',
      },
    ],
  }
}

function initChart() {
  if (!chartContainer.value) return

  chart = echarts.init(chartContainer.value, null, { locale: 'pt_BR' })
  chart.setOption(buildChartOption())

  // Add click event listener to chart
  chart.on('click', handleChartClick)

  // Handle window resize
  const handleResize = () => {
    chart?.resize()
  }
  window.addEventListener('resize', handleResize)

  return () => {
    window.removeEventListener('resize', handleResize)
    chart?.dispose()
  }
}

function updateChart() {
  if (chart) {
    chart.setOption(buildChartOption(), true)
  }
}

function zoomIn() {
  zoom.value = Math.min(2, zoom.value + 0.2)
  if (chart) {
    const instance = chart.getOption() as any
    if (instance.series?.[0]) {
      instance.series[0].symbolSize = (instance.series[0].symbolSize || 25) * 1.2
      chart.setOption(instance as any)
    }
  }
}

function zoomOut() {
  zoom.value = Math.max(0.5, zoom.value - 0.2)
  if (chart) {
    const instance = chart.getOption() as any
    if (instance.series?.[0]) {
      instance.series[0].symbolSize = Math.max(15, (instance.series[0].symbolSize || 25) * 0.8)
      chart.setOption(instance as any)
    }
  }
}

function resetZoom() {
  zoom.value = 1
  updateChart()
}

onMounted(() => {
  initChart()
})

watch(() => props.currentIndex, () => {
  updateChart()
})

watch(() => props.leafNodes, () => {
  updateChart()
}, { deep: true })
</script>

<style scoped>
.wbs-tree-container {
  width: 100%;
}

.tree-card {
  background: linear-gradient(135deg, rgba(46, 125, 50, 0.05) 0%, rgba(27, 94, 32, 0.02) 100%);
}

:deep(.echarts-legend) {
  display: none;
}
</style>
