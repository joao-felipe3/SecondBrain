<template>
  <v-sheet class="pert-full-page" elevation="0" color="transparent" @click.stop>
    <v-card elevation="1" class="control-bar mb-3">
      <v-card-text class="d-flex align-center flex-wrap ga-2 py-3">
        <h3 class="page-title ma-0">PERT/CPM</h3>

        <v-switch
          v-model="includeCompleted"
          label="Incluir concluidas"
          density="compact"
          hide-details
          inset
          class="pert-switch"
          @update:model-value="reload"
        />

        <v-switch
          v-model="onlyCritical"
          label="Somente criticas"
          density="compact"
          hide-details
          inset
          class="pert-switch"
        />

        <v-select
          v-model="selectedWave"
          :items="waveOptions"
          item-title="label"
          item-value="value"
          label="Wave"
          density="compact"
          hide-details
          variant="outlined"
          class="compact-select"
        />


        <v-btn
          v-if="selectedGroupId"
          size="small"
          variant="text"
          color="primary"
          @click="clearDetail"
        >
          Voltar ao resumo
        </v-btn>

        
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="loading" type="image" class="chart-shell" />

    <div v-else-if="isMobile">
      <v-card elevation="1" class="chart-shell">
        <v-card-title class="text-subtitle-2">Lista Compacta (mobile)</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th class="text-right">Folga</th>
                <th class="text-right">Dur.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="node in displayNodes" :key="node.id">
                <td>{{ node.name }}</td>
                <td class="text-right">{{ node.slack.toFixed(1) }}h</td>
                <td class="text-right">{{ node.durationHours.toFixed(1) }}h</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>

    <PertDiagramVisualization
      v-else
      :nodes="displayNodes"
      :edges="displayEdges"
      :ready-node-ids="Array.from(displayReadyIds)"
      :blocked-node-ids="Array.from(displayBlockedIds)"
      :focus-node-ids="Array.from(displayFocusIds)"
      :only-critical="onlyCritical"
      :critical-edges-only="criticalEdgesOnly"
      :show-all-edges="showAllEdges"
      :ready-now-task-count="readyNowTaskCount"
      @node-click="onGraphNodeClick"
      class="chart-shell"
    />
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Project } from '~/models/Project'
import { useDisplay } from 'vuetify'
import { usePertDiagramData, type PertDiagramNode, type PertDiagramEdge } from '~/composables/features/pert/usePertDiagramData'
import { useApi } from '~/composables/api'
import PertDiagramVisualization from '../visualization/PertDiagramVisualization.vue'

interface ProjectWave {
  _id: string
  waveNumber: number
  status: 'planned' | 'active' | 'completed'
  taskIds: string[]
}

const props = defineProps<{
  project: Project | Record<string, any> | null
  editing?: boolean
}>()

const projectId = computed(() => {
  return (props.project as any)?._id || (props.project as any)?.id || ''
})

const { mobile } = useDisplay()
const isMobile = computed(() => mobile.value)
const onlyCritical = ref(false)
const criticalEdgesOnly = ref(false)
const showAllEdges = ref(true)
const slackBucket = ref<'all' | 'critical' | 'near' | 'comfortable'>('all')
const selectedWave = ref<string>('ready')
const viewMode = ref<'summary' | 'detail'>('summary')
const selectedGroupId = ref<string | null>(null)
const waves = ref<ProjectWave[]>([])

const {
  loading,
  error,
  includeCompleted,
  nodes,
  edges,
  alerts,
  data,
  load,
} = usePertDiagramData(() => String(projectId.value || ''))

const statistics = computed(() => {
  const result = data.value?.statistics
  return {
    criticalTasks: result?.criticalTasks || 0,
    projectDurationHours: data.value?.projectDurationHours || 0,
  }
})

const graphMeta = computed(() => {
  const predecessorMap = new Map<string, string[]>()
  const successorMap = new Map<string, string[]>()

  for (const node of nodes.value) {
    predecessorMap.set(node.id, [])
    successorMap.set(node.id, [])
  }

  for (const edge of edges.value) {
    predecessorMap.set(edge.target, [...(predecessorMap.get(edge.target) || []), edge.source])
    successorMap.set(edge.source, [...(successorMap.get(edge.source) || []), edge.target])
  }

  const nodeById = new Map(nodes.value.map((node) => [node.id, node]))
  const readyNow = new Set<string>()
  const blocked = new Set<string>()

  for (const node of nodes.value) {
    if (node.isConcluded) continue
    const predecessors = predecessorMap.get(node.id) || []
    const allDone = predecessors.every((id) => nodeById.get(id)?.isConcluded)
    if (allDone) readyNow.add(node.id)
    else blocked.add(node.id)
  }

  return {
    predecessorMap,
    successorMap,
    readyNow,
    blocked,
  }
})

const wavesByNumber = computed(() => {
  const map = new Map<number, Set<string>>()
  for (const wave of waves.value) {
    const key = Number(wave.waveNumber || 0)
    if (!map.has(key)) map.set(key, new Set<string>())
    const taskSet = map.get(key) as Set<string>
    for (const taskId of wave.taskIds || []) {
      taskSet.add(String(taskId))
    }
  }
  return map
})

const waveOptions = computed(() => {
  const dynamic = Array.from(wavesByNumber.value.keys())
    .sort((a, b) => a - b)
    .map((waveNumber) => {
      const taskCount = (wavesByNumber.value.get(waveNumber) || new Set<string>()).size
      return {
        label: `Wave ${waveNumber} (${taskCount})`,
        value: `wave:${waveNumber}`,
      }
    })

  return [
    { label: 'Posso fazer agora', value: 'ready' },
    { label: 'Todas as waves', value: 'all' },
    ...dynamic,
  ]
})

const slackOptions = [
  { label: 'Todas folgas', value: 'all' },
  { label: 'Criticas (0h)', value: 'critical' },
  { label: 'Quase criticas (<2h)', value: 'near' },
  { label: 'Confortaveis (>=2h)', value: 'comfortable' },
]

const filteredNodes = computed(() => {
  let result = [...nodes.value]

  if (selectedWave.value === 'ready') {
    const readyIds = graphMeta.value.readyNow
    result = result.filter((node) => readyIds.has(node.id))
  } else if (selectedWave.value.startsWith('wave:')) {
    const targetWave = Number(selectedWave.value.replace('wave:', ''))
    const allowedTaskIds = wavesByNumber.value.get(targetWave) || new Set<string>()
    result = result.filter((node) => allowedTaskIds.has(String(node.id)))
  }

  if (onlyCritical.value) {
    result = result.filter((node) => node.isCritical)
  }

  if (slackBucket.value === 'critical') {
    result = result.filter((node) => Math.abs(node.slack) < 0.1)
  } else if (slackBucket.value === 'near') {
    result = result.filter((node) => node.slack >= 0 && node.slack < 2)
  } else if (slackBucket.value === 'comfortable') {
    result = result.filter((node) => node.slack >= 2)
  }

  return result
})

const readyNowIds = computed(() => {
  const inScope = new Set(filteredNodes.value.map((node) => node.id))
  return new Set(Array.from(graphMeta.value.readyNow).filter((id) => inScope.has(id)))
})

const blockedIds = computed(() => {
  const inScope = new Set(filteredNodes.value.map((node) => node.id))
  return new Set(Array.from(graphMeta.value.blocked).filter((id) => inScope.has(id)))
})

const focusNodeIds = computed(() => {
  if (!selectedWave.value.startsWith('wave:')) {
    return new Set(Array.from(readyNowIds.value))
  }

  const targetWave = Number(selectedWave.value.replace('wave:', ''))
  const allowedTaskIds = wavesByNumber.value.get(targetWave) || new Set<string>()
  const waveNodeIds = filteredNodes.value
    .filter((node) => allowedTaskIds.has(String(node.id)))
    .map((node) => node.id)

  const focus = new Set<string>(waveNodeIds)
  const queue = [...waveNodeIds]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const predecessors = graphMeta.value.predecessorMap.get(current) || []
    for (const prev of predecessors) {
      if (!focus.has(prev)) {
        focus.add(prev)
        queue.push(prev)
      }
    }
  }

  return focus
})

const filteredEdges = computed(() => {
  const allowedIds = new Set(filteredNodes.value.map((node) => node.id))
  const inScope = edges.value.filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target))
  if (!criticalEdgesOnly.value) return inScope

  const criticalOnly = inScope.filter((edge) => edge.isCriticalEdge)
  return criticalOnly.length > 0 ? criticalOnly : inScope
})

const getWbsParts = (node: PertDiagramNode) => {
  const raw = String(node.wbsPath || '').trim()
  if (!raw) return ['Sem pacote']
  return raw.split(/[>/\\|]/).map((part) => part.trim()).filter(Boolean)
}

const buildGroupMapByDepth = (depth: number) => {
  const map = new Map<string, PertDiagramNode[]>()
  for (const node of filteredNodes.value) {
    const parts = getWbsParts(node)
    const key = parts.slice(0, Math.min(depth, parts.length)).join(' > ') || 'Sem pacote'
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(node)
  }
  return map
}

const adaptiveGroupMap = computed(() => {
  const allParts = filteredNodes.value.map((node) => getWbsParts(node))
  const maxDepth = Math.max(1, ...allParts.map((parts) => parts.length))

  let best = buildGroupMapByDepth(1)
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const current = buildGroupMapByDepth(depth)
    const groupStats = Array.from(current.values()).map((tasks) => ({
      hours: tasks.reduce((sum, task) => sum + Number(task.durationHours || 0), 0),
      count: tasks.length,
    }))
    const maxHours = Math.max(0, ...groupStats.map((item) => item.hours))
    const maxCount = Math.max(0, ...groupStats.map((item) => item.count))

    best = current
    if (maxHours <= 80 && maxCount <= 30) {
      break
    }
  }

  return best
})

const summaryGraph = computed(() => {
  const taskToGroup = new Map<string, string>()
  const groupToTasks = new Map<string, string[]>()
  const nodeById = new Map(filteredNodes.value.map((node) => [node.id, node]))

  for (const [groupLabel, tasks] of adaptiveGroupMap.value.entries()) {
    const groupId = `group:${groupLabel}`
    groupToTasks.set(groupId, tasks.map((task) => task.id))
    for (const task of tasks) {
      taskToGroup.set(task.id, groupId)
    }
  }

  const nodes = Array.from(adaptiveGroupMap.value.entries()).map(([groupLabel, tasks]) => {
    const duration = tasks.reduce((sum, task) => sum + Number(task.durationHours || 0), 0)
    const minES = Math.min(...tasks.map((task) => Number(task.earlyStart || 0)))
    const maxEF = Math.max(...tasks.map((task) => Number(task.earlyFinish || 0)))
    const minLS = Math.min(...tasks.map((task) => Number(task.lateStart || 0)))
    const maxLF = Math.max(...tasks.map((task) => Number(task.lateFinish || 0)))
    const avgSlack = tasks.reduce((sum, task) => sum + Number(task.slack || 0), 0) / Math.max(tasks.length, 1)

    return {
      id: `group:${groupLabel}`,
      name: `${groupLabel} (${tasks.length})`,
      durationHours: duration,
      earlyStart: minES,
      earlyFinish: maxEF,
      lateStart: minLS,
      lateFinish: maxLF,
      slack: avgSlack,
      isCritical: tasks.some((task) => task.isCritical),
      progress: tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / Math.max(tasks.length, 1),
      isConcluded: tasks.every((task) => task.isConcluded),
      priority: Math.max(...tasks.map((task) => Number(task.priority || 0))),
      parentWbsNodeId: tasks.find((task) => task.parentWbsNodeId)?.parentWbsNodeId,
      wbsPath: groupLabel,
      x: 0,
      y: 0,
    } as PertDiagramNode
  })

  const aggregateEdge = new Map<string, { source: string; target: string; critical: boolean; relationship: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' }>()
  for (const edge of filteredEdges.value) {
    const fromGroup = taskToGroup.get(edge.source)
    const toGroup = taskToGroup.get(edge.target)
    if (!fromGroup || !toGroup || fromGroup === toGroup) continue

    const key = `${fromGroup}->${toGroup}`
    if (!aggregateEdge.has(key)) {
      aggregateEdge.set(key, {
        source: fromGroup,
        target: toGroup,
        critical: false,
        relationship: edge.relationship,
      })
    }

    const current = aggregateEdge.get(key)
    if (current) {
      current.critical = current.critical || edge.isCriticalEdge
    }
  }

  const edges = Array.from(aggregateEdge.entries()).map(([id, item]) => ({
    id,
    source: item.source,
    target: item.target,
    relationship: item.relationship,
    isAutoIdentified: true,
    isCriticalEdge: item.critical,
  }))

  const readyTaskIds = new Set(Array.from(readyNowIds.value))
  const blockedTaskIds = new Set(Array.from(blockedIds.value))
  const readyGroupIds = new Set<string>()
  const blockedGroupIds = new Set<string>()
  for (const [groupId, taskIds] of groupToTasks.entries()) {
    if (taskIds.some((id) => readyTaskIds.has(id))) readyGroupIds.add(groupId)
    if (taskIds.every((id) => blockedTaskIds.has(id))) blockedGroupIds.add(groupId)
  }

  const focusGroupIds = new Set<string>()
  for (const groupId of readyGroupIds) focusGroupIds.add(groupId)
  if (selectedGroupId.value && groupToTasks.has(selectedGroupId.value)) {
    focusGroupIds.add(selectedGroupId.value)
  }

  return {
    nodes,
    edges,
    taskToGroup,
    groupToTasks,
    nodeById,
    readyGroupIds,
    blockedGroupIds,
    focusGroupIds,
  }
})

const detailGraph = computed(() => {
  if (!selectedGroupId.value) {
    return {
      nodes: [] as PertDiagramNode[],
      edges: [] as PertDiagramEdge[],
    }
  }

  const taskIds = new Set(summaryGraph.value.groupToTasks.get(selectedGroupId.value) || [])
  const nodesDetail = filteredNodes.value.filter((node) => taskIds.has(node.id))
  const nodeSet = new Set(nodesDetail.map((node) => node.id))
  const edgesDetail = filteredEdges.value.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))

  return {
    nodes: nodesDetail,
    edges: edgesDetail,
  }
})

const displayNodes = computed(() => {
  if (viewMode.value === 'summary') return summaryGraph.value.nodes
  return detailGraph.value.nodes
})

const displayEdges = computed(() => {
  if (viewMode.value === 'summary') return summaryGraph.value.edges
  return detailGraph.value.edges
})

const displayReadyIds = computed(() => {
  if (viewMode.value === 'summary') return new Set(summaryGraph.value.readyGroupIds)
  const visible = new Set(detailGraph.value.nodes.map((node) => node.id))
  return new Set(Array.from(readyNowIds.value).filter((id) => visible.has(id)))
})

const displayBlockedIds = computed(() => {
  if (viewMode.value === 'summary') return new Set(summaryGraph.value.blockedGroupIds)
  const visible = new Set(detailGraph.value.nodes.map((node) => node.id))
  return new Set(Array.from(blockedIds.value).filter((id) => visible.has(id)))
})

const displayFocusIds = computed(() => {
  if (viewMode.value === 'summary') return new Set(summaryGraph.value.focusGroupIds)
  return new Set(detailGraph.value.nodes.map((node) => node.id))
})

const selectedGroupLabel = computed(() => {
  if (!selectedGroupId.value) return ''
  const id = selectedGroupId.value
  if (id.startsWith('group:')) return id.replace('group:', '')
  return id
})

const readyNowTaskCount = computed(() => readyNowIds.value.size)

const clearDetail = () => {
  viewMode.value = 'summary'
  selectedGroupId.value = null
}

const onGraphNodeClick = (node: PertDiagramNode) => {
  if (viewMode.value !== 'summary') return
  if (!node?.id || !String(node.id).startsWith('group:')) return
  selectedGroupId.value = String(node.id)
  viewMode.value = 'detail'
}

const loadWaves = async () => {
  const id = String(projectId.value || '')
  if (!id) {
    waves.value = []
    return
  }

  try {
    const { get } = useApi(`/projects/${id}/waves`)
    const result = await get()
    if (result.error) throw result.error
    waves.value = Array.isArray(result.data) ? (result.data as ProjectWave[]) : []
  } catch {
    waves.value = []
  }
}

const reload = async () => {
  await Promise.all([load(), loadWaves()])
}

onMounted(reload)

watch(projectId, () => {
  selectedWave.value = 'ready'
  clearDetail()
  reload()
})

watch(onlyCritical, () => {
  if (filteredNodes.value.length === 0) {
    selectedWave.value = 'all'
  }
})

watch(selectedWave, () => {
  clearDetail()
})
</script>

<style scoped>
.pert-full-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.control-bar {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.chart-shell {
  flex: 1;
  min-height: 0;
}

.page-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.pert-switch :deep(.v-label) {
  font-size: 0.75rem;
}

.pert-switch :deep(.v-selection-control) {
  gap: 0rem;
}

.pert-switch :deep(.v-selection-control__input) {
  margin-inline-end: -0.15rem;
}

.pert-switch :deep(.v-selection-control__wrapper) {
  transform: scale(0.6);
  transform-origin: right center;
  margin-left: -1rem;
}

.compact-select {
  max-width: 210px;
}

.compact-select :deep(.v-field__input),
.compact-select :deep(.v-label) {
  font-size: 0.75rem;
}
</style>
