<template>
  <v-sheet class="pert-full-page" elevation="0" color="transparent" @click.stop>
    <v-card elevation="1" class="control-bar mb-3">
      <v-card-text class="d-flex align-center flex-wrap ga-2 py-3">
        <h3 class="page-title ma-0">PERT/CPM</h3>

        <v-chip size="small" color="primary" variant="tonal">
          {{ filteredNodes.length }} nos
        </v-chip>

        <v-chip size="small" color="error" variant="tonal">
          {{ (statistics?.criticalTasks || 0) }} criticos
        </v-chip>

        <v-chip size="small" color="indigo" variant="tonal">
          {{ (statistics?.projectDurationHours || 0).toFixed(1) }}h duracao
        </v-chip>

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

        <v-switch
          v-model="criticalEdgesOnly"
          label="Arestas criticas"
          density="compact"
          hide-details
          inset
          class="pert-switch"
        />

        <v-select
          v-model="slackBucket"
          :items="slackOptions"
          item-title="label"
          item-value="value"
          label="Folga"
          density="compact"
          hide-details
          variant="outlined"
          class="compact-select"
        />

        <v-select
          v-model="selectedWbsPackage"
          :items="wbsPackageOptions"
          item-title="label"
          item-value="value"
          label="Pacote WBS"
          density="compact"
          hide-details
          variant="outlined"
          clearable
          class="compact-select"
        />
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
              <tr v-for="node in filteredNodes" :key="node.id">
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
      :nodes="filteredNodes"
      :edges="filteredEdges"
      :only-critical="onlyCritical"
      :critical-edges-only="criticalEdgesOnly"
      class="chart-shell"
    />
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Project } from '~/models/Project'
import { useDisplay } from 'vuetify'
import { usePertDiagramData, type PertDiagramNode } from '~/composables/features/usePertDiagramData'
import PertDiagramVisualization from '../visualization/PertDiagramVisualization.vue'

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
const slackBucket = ref<'all' | 'critical' | 'near' | 'comfortable'>('all')
const selectedWbsPackage = ref<string | null>(null)

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

const extractWbsParts = (node: PertDiagramNode): string[] => {
  const rawPath = String(node.wbsPath || '').trim()
  if (!rawPath) return []
  return rawPath.split(/[>/\\|]/).map((item) => item.trim()).filter(Boolean)
}

const wbsPackageOptions = computed(() => {
  const packages = new Set<string>()
  for (const node of nodes.value) {
    const parts = extractWbsParts(node)
    if (parts.length > 0) {
      for (let i = 1; i <= parts.length; i += 1) {
        packages.add(parts.slice(0, i).join(' > '))
      }
    }
  }

  return Array.from(packages)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ label: path, value: path }))
})

const slackOptions = [
  { label: 'Todas folgas', value: 'all' },
  { label: 'Criticas (0h)', value: 'critical' },
  { label: 'Quase criticas (<2h)', value: 'near' },
  { label: 'Confortaveis (>=2h)', value: 'comfortable' },
]

const filteredNodes = computed(() => {
  let result = [...nodes.value]

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

  if (selectedWbsPackage.value) {
    const selectedParts = selectedWbsPackage.value.split(' > ').map((item) => item.trim()).filter(Boolean)
    result = result.filter((node) => {
      const nodeParts = extractWbsParts(node)
      if (nodeParts.length < selectedParts.length) return false
      for (let i = 0; i < selectedParts.length; i += 1) {
        if (nodeParts[i] !== selectedParts[i]) return false
      }
      return true
    })

    // Fallback: if package has no critical tasks, keep package filter and drop critical-only restriction.
    if (result.length === 0 && onlyCritical.value) {
      result = nodes.value.filter((node) => {
        const nodeParts = extractWbsParts(node)
        if (nodeParts.length < selectedParts.length) return false
        for (let i = 0; i < selectedParts.length; i += 1) {
          if (nodeParts[i] !== selectedParts[i]) return false
        }
        return true
      })
    }
  }

  return result
})

const filteredEdges = computed(() => {
  const allowedIds = new Set(filteredNodes.value.map((node) => node.id))
  const inScope = edges.value.filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target))
  if (!criticalEdgesOnly.value) return inScope

  const criticalOnly = inScope.filter((edge) => edge.isCriticalEdge)
  return criticalOnly.length > 0 ? criticalOnly : inScope
})

const reload = async () => {
  await load()
}

onMounted(reload)

watch(projectId, () => {
  selectedWbsPackage.value = null
  reload()
})

watch(onlyCritical, () => {
  if (selectedWbsPackage.value && filteredNodes.value.length === 0) {
    selectedWbsPackage.value = null
  }
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
