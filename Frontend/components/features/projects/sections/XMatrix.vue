<template>
  <v-card elevation="1" class="xmatrix-card">
    <v-card-title class="d-flex align-center justify-space-between ga-2 flex-wrap">
      <span class="text-subtitle-1">X-Matrix (Hoshin Kanri)</span>
      <v-btn size="small" variant="tonal" color="primary" :loading="loading" @click="generate">
        Gerar matriz
      </v-btn>
    </v-card-title>

    <v-card-text>
      <div v-if="loading" class="text-caption text-medium-emphasis">Gerando matriz...</div>
      <v-alert v-else-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
      <div v-else-if="!data" class="text-caption text-medium-emphasis">Sem dados de matriz para este projeto.</div>
      <template v-else>
        <v-alert
          v-if="data.diagnostics.warnings.length"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ data.diagnostics.warnings.join(' | ') }}
        </v-alert>

        <div class="meta-line mb-3">
          <v-chip size="x-small" color="primary" variant="tonal">Norte (3-5 anos): {{ data.strategyGoals.length }}</v-chip>
          <v-chip size="x-small" color="indigo" variant="tonal">Estratégico (ano/semestre): {{ data.annualGoals.length }}</v-chip>
          <v-chip size="x-small" color="teal" variant="tonal">Tático (WBS L1/L2): {{ tacticalItems.length }}</v-chip>
          <v-chip v-if="isTaskTruncated" size="x-small" color="deep-orange" variant="tonal">
            Exibindo {{ visibleTasks.length }} de {{ tacticalItems.length }} iniciativas
          </v-chip>
          <v-btn
            v-if="isTaskTruncated"
            size="x-small"
            variant="text"
            color="deep-orange"
            @click="showAllTasks = true"
          >
            Mostrar todas
          </v-btn>
        </div>

        <div class="matrix-scroll mb-4">
          <div class="text-caption font-weight-bold mb-2">Norte × Estratégico</div>
          <v-table density="compact" class="matrix-table">
            <thead>
              <tr>
                <th>Estratégia \ Anual</th>
                <th v-for="annual in data.annualGoals" :key="annual.id" class="text-center col-fixed">
                  {{ annual.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="strategy in data.strategyGoals" :key="strategy.id">
                <td class="row-header">{{ strategy.label }}</td>
                <td
                  v-for="annual in data.annualGoals"
                  :key="`${strategy.id}-${annual.id}`"
                  class="text-center"
                >
                  <span class="strength-pill" :class="strengthClass(getStrategyAnnualStrength(strategy.id, annual.id))">
                    {{ strengthLabel(getStrategyAnnualStrength(strategy.id, annual.id)) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div class="matrix-scroll">
          <div class="text-caption font-weight-bold mb-2">Estratégico × Tático (Iniciativas WBS)</div>
          <v-table density="compact" class="matrix-table">
            <thead>
              <tr>
                <th>Estratégico \ Tático</th>
                <th v-for="task in visibleTasks" :key="task.id" class="text-center col-fixed">
                  {{ task.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="annual in data.annualGoals" :key="annual.id">
                <td class="row-header">{{ annual.label }}</td>
                <td
                  v-for="task in visibleTasks"
                  :key="`${annual.id}-${task.id}`"
                  class="text-center"
                >
                  <span class="strength-pill" :class="strengthClass(getAnnualTaskStrength(annual.id, task.id))">
                    {{ strengthLabel(getAnnualTaskStrength(annual.id, task.id)) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApi } from '~/composables/api'

type Strength = 'strong' | 'medium' | 'weak' | 'none'

interface AxisItem {
  id: string
  label: string
}

interface Cell {
  fromId: string
  toId: string
  strength: Strength
  score: number
  rationale: string
}

interface XMatrixData {
  projectId: string
  projectName: string
  strategyGoals: AxisItem[]
  annualGoals: AxisItem[]
  tacticalItems?: AxisItem[]
  tasks: AxisItem[]
  strategyToAnnual: Cell[]
  annualToTactical?: Cell[]
  annualToTasks: Cell[]
  diagnostics: {
    generatedAt: string
    strategyCount: number
    annualCount: number
    tacticalCount?: number
    taskCount: number
    warnings: string[]
  }
}

const props = defineProps<{
  projectId: string
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const data = ref<XMatrixData | null>(null)
const showAllTasks = ref(false)

const tacticalItems = computed(() => {
  if (!data.value) return [] as AxisItem[]
  return data.value.tacticalItems?.length ? data.value.tacticalItems : data.value.tasks
})

const annualToTacticalCells = computed(() => {
  if (!data.value) return [] as Cell[]
  return data.value.annualToTactical?.length ? data.value.annualToTactical : data.value.annualToTasks
})

const MAX_VISIBLE_TASKS = 120

const isTaskTruncated = computed(() => {
  if (!data.value) return false
  return tacticalItems.value.length > MAX_VISIBLE_TASKS && !showAllTasks.value
})

const visibleTasks = computed(() => {
  if (showAllTasks.value) return tacticalItems.value
  return tacticalItems.value.slice(0, MAX_VISIBLE_TASKS)
})

const strategyAnnualLookup = computed(() => {
  const map = new Map<string, Strength>()
  const cells = data.value?.strategyToAnnual ?? []
  for (const cell of cells) {
    map.set(`${cell.fromId}::${cell.toId}`, cell.strength)
  }
  return map
})

const annualTaskLookup = computed(() => {
  const map = new Map<string, Strength>()
  const cells = annualToTacticalCells.value
  for (const cell of cells) {
    map.set(`${cell.fromId}::${cell.toId}`, cell.strength)
  }
  return map
})

const getStrategyAnnualStrength = (fromId: string, toId: string): Strength => {
  return strategyAnnualLookup.value.get(`${fromId}::${toId}`) || 'none'
}

const getAnnualTaskStrength = (fromId: string, toId: string): Strength => {
  return annualTaskLookup.value.get(`${fromId}::${toId}`) || 'none'
}

const strengthLabel = (value: Strength) => {
  if (value === 'strong') return 'Forte'
  if (value === 'medium') return 'Media'
  if (value === 'weak') return 'Fraca'
  return 'Nenhuma'
}

const strengthClass = (value: Strength) => {
  if (value === 'strong') return 'is-strong'
  if (value === 'medium') return 'is-medium'
  if (value === 'weak') return 'is-weak'
  return 'is-none'
}

const generate = async () => {
  if (!props.projectId) return
  loading.value = true
  error.value = null

  try {
    const { post } = useApi(`/projects/${props.projectId}/create-x-matrix`)
    const result = await post({ includeCompleted: false, wbsLevels: [1, 2], maxTacticalItems: 80 })
    if (result.error) throw result.error
    data.value = result.data as XMatrixData
    showAllTasks.value = false
  } catch (err: any) {
    error.value = err?.message || 'Falha ao gerar X-Matrix.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.xmatrix-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.meta-line {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.matrix-scroll {
  overflow-x: auto;
}

.matrix-table {
  min-width: 860px;
}

.col-fixed {
  min-width: 130px;
  max-width: 130px;
  white-space: normal;
  font-size: 0.72rem;
}

.row-header {
  min-width: 220px;
  max-width: 220px;
  white-space: normal;
  font-size: 0.76rem;
}

.strength-pill {
  display: inline-block;
  min-width: 56px;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 0.68rem;
  line-height: 1.2;
  font-weight: 600;
}

.strength-pill.is-strong {
  background: rgba(76, 175, 80, 0.16);
  color: #1b5e20;
}

.strength-pill.is-medium {
  background: rgba(255, 152, 0, 0.18);
  color: #7a4f00;
}

.strength-pill.is-weak {
  background: rgba(3, 169, 244, 0.18);
  color: #01579b;
}

.strength-pill.is-none {
  background: rgba(120, 120, 120, 0.14);
  color: #555;
}
</style>
