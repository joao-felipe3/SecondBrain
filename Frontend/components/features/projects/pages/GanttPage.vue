<template>
  <v-sheet class="gantt-full-page" elevation="0" color="transparent" @click.stop>
    <v-card elevation="1" class="control-bar mb-3">
      <v-card-text class="d-flex align-center flex-wrap ga-2 py-3">
        <h3 class="page-title ma-0">Gantt</h3>

        <v-chip size="small" color="primary" variant="tonal">
          {{ displayTasks.length }} exibidas
        </v-chip>

        <v-chip size="small" color="error" variant="tonal">
          {{ summary.criticalCount }} criticas
        </v-chip>

        <v-chip size="small" color="success" variant="tonal">
          {{ summary.concludedCount }} concluidas
        </v-chip>

        <v-switch
          v-model="includeCompleted"
          label="Incluir concluidas"
          density="compact"
          hide-details
          inset
          class="gantt-switch"
          @update:model-value="reload"
        />

        <v-switch
          v-model="onlyCritical"
          label="Somente criticas"
          density="compact"
          hide-details
          inset
          class="gantt-switch"
        />

        <v-switch
          v-model="groupByWbs"
          label="Agrupar WBS"
          density="compact"
          hide-details
          inset
          class="gantt-switch"
        />

        <v-select
          v-model="wbsGroupingLevel"
          :items="wbsLevelOptions"
          item-title="label"
          item-value="value"
          label="Nivel WBS"
          density="compact"
          hide-details
          variant="outlined"
          class="wbs-level-select"
          :disabled="!groupByWbs"
        />

        <v-select
          v-model="selectedWbsGroupKey"
          :items="wbsPackageOptions"
          item-title="label"
          item-value="value"
          label="Pacote WBS"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          class="wbs-package-select"
          :disabled="!groupByWbs"
        />
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
      {{ error }}
    </v-alert>

    <v-skeleton-loader v-if="loading" type="image" class="chart-shell" />

    <div v-else-if="isMobile">
      <v-card elevation="1" class="chart-shell">
        <v-card-title class="text-subtitle-2">Lista Compacta (mobile)</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th class="text-right">Dur.</th>
                <th class="text-right">Prog.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in displayTasks" :key="task.id">
                <td>{{ task.name }}</td>
                <td class="text-right">{{ task.durationHours.toFixed(1) }}h</td>
                <td class="text-right">{{ Math.round(task.progress) }}%</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>

    <GanttChartVisualization
      v-else
      :tasks="displayTasks"
      :dependencies="displayDependencies"
      :critical-path="displayCriticalPath"
      class="chart-shell"
    />
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Project } from '~/models/Project'
import { useDisplay } from 'vuetify'
import { useGanttData, type GanttTaskItem, type GanttDependencyItem } from '~/composables/features/useGanttData'
import GanttChartVisualization from '../visualization/GanttChartVisualization.vue'

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
const groupByWbs = ref(true)
const wbsGroupingLevel = ref<'root' | 'leaf' | number>('leaf')
const selectedWbsGroupKey = ref<string | null>(null)

const {
  loading,
  error,
  includeCompleted,
  ganttTasks,
  dependencies,
  criticalPath,
  alerts,
  load,
} = useGanttData(() => String(projectId.value || ''))

const filteredTasks = computed<GanttTaskItem[]>(() => {
  const tasks = ganttTasks.value || []
  if (!onlyCritical.value) return tasks
  return tasks.filter((task) => task.isCritical)
})

const extractWbsParts = (task: GanttTaskItem): string[] => {
  const rawPath = String(task.wbsPath || '').trim()
  if (!rawPath) return []

  return rawPath
    .split(/[>/\\|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const maxWbsLevel = computed(() => {
  let maxLevel = 1
  for (const task of filteredTasks.value) {
    const current = extractWbsParts(task).length
    if (current > maxLevel) maxLevel = current
  }
  return maxLevel
})

const wbsLevelOptions = computed(() => {
  const options: Array<{ label: string; value: 'root' | 'leaf' | number }> = [
    { label: 'Raiz (nivel 1)', value: 'root' },
    { label: 'Folha (menor pacote)', value: 'leaf' },
  ]

  for (let level = 2; level <= maxWbsLevel.value; level += 1) {
    options.push({ label: `Nivel ${level}`, value: level })
  }

  return options
})

const resolveWbsGrouping = (task: GanttTaskItem): { key: string; label: string } | null => {
  const parts = extractWbsParts(task)
  if (parts.length === 0) return null

  if (wbsGroupingLevel.value === 'root') {
    return {
      key: `path:${parts[0]}`,
      label: parts[0],
    }
  }

  if (wbsGroupingLevel.value === 'leaf') {
    const fullPath = parts.join(' > ')
    return {
      key: `path:${fullPath}`,
      label: parts[parts.length - 1],
    }
  }

  const requestedLevel = Number(wbsGroupingLevel.value)
  const boundedLevel = Math.max(1, Math.min(parts.length, requestedLevel))
  const levelPath = parts.slice(0, boundedLevel).join(' > ')
  return {
    key: `path:${levelPath}`,
    label: parts[boundedLevel - 1],
  }
}

const groupKeyForTask = (task: GanttTaskItem): string => {
  const grouping = resolveWbsGrouping(task)
  if (grouping) return grouping.key
  if (task.parentWbsNodeId) return `wbs:${task.parentWbsNodeId}`
  return 'sem-wbs'
}

const groupLabelForKey = (key: string): string => {
  if (key.startsWith('path:')) {
    const path = key.replace('path:', '')
    const parts = path.split(' > ').map((item) => item.trim()).filter(Boolean)
    return parts[parts.length - 1] || path
  }
  if (key.startsWith('wbs:')) return `WBS ${key.replace('wbs:', '').slice(0, 6)}`
  return 'Sem WBS'
}

const groupedBuckets = computed(() => {
  const groups = new Map<string, GanttTaskItem[]>()
  for (const task of filteredTasks.value) {
    const key = groupKeyForTask(task)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(task)
  }
  return groups
})

const wbsPackageOptions = computed(() => {
  if (!groupByWbs.value) return [] as Array<{ label: string; value: string }>
  return Array.from(groupedBuckets.value.entries())
    .map(([key, items]) => ({
      label: `${groupLabelForKey(key)} (${items.length})`,
      value: key,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const selectedWbsTasks = computed<GanttTaskItem[]>(() => {
  if (!groupByWbs.value || !selectedWbsGroupKey.value) return []
  return groupedBuckets.value.get(selectedWbsGroupKey.value) || []
})

const groupedTasks = computed<GanttTaskItem[]>(() => {
  const tasks = filteredTasks.value
  if (!groupByWbs.value) return tasks

  return Array.from(groupedBuckets.value.entries()).map(([key, items]) => {
    const sortedByStart = [...items].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )

    const minStart = new Date(sortedByStart[0].startDate).getTime()
    const maxEnd = Math.max(...items.map((task) => new Date(task.endDate).getTime()))
    const spanHours = Math.max(0.5, (maxEnd - minStart) / (1000 * 60 * 60))
    const weightedProgress = items.reduce((sum, task) => sum + (task.progress * Math.max(0.2, task.durationHours)), 0)
      / Math.max(1, items.reduce((sum, task) => sum + Math.max(0.2, task.durationHours), 0))

    return {
      id: `grp:${key}`,
      name: `${groupLabelForKey(key)} (${items.length})`,
      startDate: new Date(minStart).toISOString(),
      endDate: new Date(maxEnd).toISOString(),
      durationHours: Number(spanHours.toFixed(2)),
      earlyStart: Math.min(...items.map((task) => task.earlyStart)),
      earlyFinish: Math.max(...items.map((task) => task.earlyFinish)),
      lateStart: Math.min(...items.map((task) => task.lateStart)),
      lateFinish: Math.max(...items.map((task) => task.lateFinish)),
      slack: Number(Math.min(...items.map((task) => task.slack)).toFixed(2)),
      isCritical: items.some((task) => task.isCritical),
      progress: Number(weightedProgress.toFixed(1)),
      isConcluded: items.every((task) => task.isConcluded),
      priority: Math.max(...items.map((task) => task.priority || 0)),
      parentWbsNodeId: key,
      wbsPath: items[0]?.wbsPath,
    }
  })
})

const displayTasks = computed<GanttTaskItem[]>(() => {
  const source = selectedWbsTasks.value.length > 0 ? selectedWbsTasks.value : groupedTasks.value
  return source
    .slice()
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
})

const displayDependencies = computed<GanttDependencyItem[]>(() => {
  const tasks = selectedWbsTasks.value.length > 0 ? selectedWbsTasks.value : filteredTasks.value
  const allowedTaskIds = new Set(tasks.map((task) => task.id))

  if (!groupByWbs.value || selectedWbsTasks.value.length > 0) {
    return dependencies.value.filter((dependency) => (
      allowedTaskIds.has(dependency.fromTaskId) && allowedTaskIds.has(dependency.toTaskId)
    ))
  }

  const groupByTaskId = new Map<string, string>()
  for (const task of tasks) {
    groupByTaskId.set(task.id, `grp:${groupKeyForTask(task)}`)
  }

  const grouped = new Map<string, GanttDependencyItem>()
  for (const dependency of dependencies.value) {
    const fromGroup = groupByTaskId.get(dependency.fromTaskId)
    const toGroup = groupByTaskId.get(dependency.toTaskId)
    if (!fromGroup || !toGroup || fromGroup === toGroup) continue

    const depId = `${fromGroup}->${toGroup}`
    if (!grouped.has(depId)) {
      grouped.set(depId, {
        id: depId,
        fromTaskId: fromGroup,
        toTaskId: toGroup,
        relationship: dependency.relationship,
        reason: 'Dependencia agregada por WBS',
        isAutoIdentified: dependency.isAutoIdentified,
      })
    }
  }

  return Array.from(grouped.values())
})

const displayCriticalPath = computed<string[]>(() => {
  if (!groupByWbs.value || selectedWbsTasks.value.length > 0) {
    const allowed = new Set(displayTasks.value.map((task) => task.id))
    return criticalPath.value.filter((taskId) => allowed.has(taskId))
  }

  const taskById = new Map(filteredTasks.value.map((task) => [task.id, task]))
  const mapped = criticalPath.value
    .map((taskId) => {
      const task = taskById.get(taskId)
      return task ? `grp:${groupKeyForTask(task)}` : null
    })
    .filter(Boolean) as string[]

  return mapped.filter((value, index) => mapped.indexOf(value) === index)
})

const summary = computed(() => {
  const tasks = filteredTasks.value
  return {
    totalDurationHours: tasks.reduce((sum, task) => sum + (task.durationHours || 0), 0),
    criticalCount: tasks.filter((task) => task.isCritical).length,
    concludedCount: tasks.filter((task) => task.isConcluded).length,
  }
})

const reload = async () => {
  await load()
}

onMounted(reload)

watch(projectId, () => {
  reload()
})

watch(groupByWbs, (enabled) => {
  if (!enabled) selectedWbsGroupKey.value = null
})

watch(wbsGroupingLevel, () => {
  selectedWbsGroupKey.value = null
})
</script>

<style scoped>
.gantt-full-page {
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

.gantt-switch :deep(.v-label) {
  font-size: 0.75rem;
}

.gantt-switch :deep(.v-selection-control) {
  gap: 0rem;
}

.gantt-switch :deep(.v-selection-control__input) {
  margin-inline-end: -0.15rem;
}

.gantt-switch :deep(.v-selection-control__wrapper) {
  transform: scale(0.6);
  transform-origin: right center;
  margin-left: -1rem;
}

.wbs-level-select {
  max-width: 185px;
}

.wbs-level-select :deep(.v-field__input),
.wbs-level-select :deep(.v-label) {
  font-size: 0.75rem;
}

.wbs-package-select {
  max-width: 230px;
}

.wbs-package-select :deep(.v-field__input),
.wbs-package-select :deep(.v-label) {
  font-size: 0.75rem;
}
</style>
