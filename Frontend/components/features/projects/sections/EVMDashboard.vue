<template>
  <v-card elevation="1" class="evm-card">
    <v-card-title class="d-flex align-center justify-space-between ga-2">
      <span class="text-subtitle-1 font-weight-medium">EVM Dashboard</span>
      <v-chip size="small" color="primary" variant="tonal">Integrado API</v-chip>
    </v-card-title>

    <v-card-text class="pt-2">
      <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact" class="mb-3">
        {{ errorMessage }}
      </v-alert>

      <div class="kpi-grid mb-4">
        <v-tooltip text="SPI (Schedule Performance Index): mede se o ritmo de entrega esta acima ou abaixo do planejado." location="top">
          <template #activator="{ props }">
            <v-card v-bind="props" variant="tonal" :color="spiColor" class="kpi-card">
              <v-card-text>
                <div class="kpi-label">SPI</div>
                <div class="kpi-value">{{ formatIndex(spi) }}</div>
              </v-card-text>
            </v-card>
          </template>
        </v-tooltip>

        <v-tooltip text="PV (Planned Value): valor planejado acumulado para o momento atual." location="top">
          <template #activator="{ props }">
            <v-card v-bind="props" variant="tonal" color="primary" class="kpi-card">
              <v-card-text>
                <div class="kpi-label">PV</div>
                <div class="kpi-value">{{ formatValue(forecast.pv) }}</div>
              </v-card-text>
            </v-card>
          </template>
        </v-tooltip>

        <v-tooltip text="EV (Earned Value): valor agregado acumulado com base no progresso real." location="top">
          <template #activator="{ props }">
            <v-card v-bind="props" variant="tonal" color="indigo" class="kpi-card">
              <v-card-text>
                <div class="kpi-label">EV</div>
                <div class="kpi-value">{{ formatValue(forecast.ev) }}</div>
              </v-card-text>
            </v-card>
          </template>
        </v-tooltip>

        <v-card variant="tonal" color="info" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Horas Concluidas</div>
            <div class="kpi-value">{{ formatHours(summary.totals.completedHours) }}</div>
          </v-card-text>
        </v-card>

        <v-card variant="tonal" color="teal" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Consistencia Semanal</div>
            <div class="kpi-value">{{ formatPercent(summary.personalMetrics.consistencyScore) }}</div>
          </v-card-text>
        </v-card>

        <v-card variant="tonal" color="cyan" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Aderencia ao Plano</div>
            <div class="kpi-value">{{ formatPercent(summary.personalMetrics.planAdherence) }}</div>
          </v-card-text>
        </v-card>

        <v-card variant="tonal" color="deep-purple" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Tendencia</div>
            <div class="kpi-value">{{ trendLabel }}</div>
          </v-card-text>
        </v-card>

        <v-card variant="tonal" color="pink" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Valor Percebido</div>
            <div class="kpi-value">{{ formatPercent(summary.personalMetrics.perceivedValueScore) }}</div>
          </v-card-text>
        </v-card>

        <v-card variant="tonal" color="amber" class="kpi-card">
          <v-card-text>
            <div class="kpi-label">Restante</div>
            <div class="kpi-value">{{ formatHours(forecast.remainingHours) }}</div>
          </v-card-text>
        </v-card>
      </div>

      <v-alert
        :type="isCritical ? 'error' : isWarning ? 'warning' : 'success'"
        variant="tonal"
        class="mb-4"
      >
        {{ interpretation }}
      </v-alert>

      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-2">Registrar Progresso</v-card-title>
        <v-card-text class="form-grid">
          <v-text-field
            v-model="entryDate"
            type="date"
            label="Data"
            density="compact"
            variant="outlined"
            hide-details
          />

          <v-text-field
            v-model.number="entryPlannedValue"
            type="number"
            min="0"
            label="Valor Planejado (PV)"
            density="compact"
            variant="outlined"
            hide-details
          />

          <v-text-field
            v-model.number="entryCompletedHours"
            type="number"
            min="0"
            label="Horas Concluidas"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-plus"
            :disabled="!canAddEntry"
            :loading="saving"
            @click="addEntry"
          >
            Adicionar Registro
          </v-btn>
          <v-btn
            color="default"
            variant="text"
            size="small"
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="loadData"
          >
            Atualizar
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card variant="outlined">
        <v-card-title class="text-subtitle-2">Curva S: Planejado x Realizado</v-card-title>
        <v-card-text>
          <v-empty-state
            v-if="curveRows.length === 0"
            icon="mdi-chart-line"
            title="Sem registros"
            text="Adicione entradas para visualizar a evolucao acumulada."
            density="compact"
          />

          <div v-else class="curve-list">
            <v-alert type="info" variant="tonal" density="compact">
              O ideal e manter a linha Realizado (EV) proxima da Planejada (PV).
            </v-alert>

            <div
              v-for="(point, index) in curveRows"
              :key="`${point.date}-${index}`"
              class="curve-row"
            >
              <div class="curve-meta">
                <strong>{{ point.date }}</strong>
                <span>Planejado {{ formatValue(point.cumulativePV) }}</span>
                <span>Realizado {{ formatValue(point.cumulativeEV) }}</span>
              </div>

              <div class="bars">
                <div class="bar pv" :style="{ width: `${toBarPercent(point.cumulativePV)}%` }">PV</div>
                <div class="bar ev" :style="{ width: `${toBarPercent(point.cumulativeEV)}%` }">EV</div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="outlined" class="mt-4">
        <v-card-title class="text-subtitle-2">Registros Recentes</v-card-title>
        <v-card-text class="pt-2">
          <v-empty-state
            v-if="entries.length === 0"
            icon="mdi-format-list-bulleted"
            title="Sem registros"
            text="Os registros mais recentes aparecem aqui."
            density="compact"
          />

          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>Data</th>
                <th class="text-right">PV</th>
                <th class="text-right">Hrs</th>
                <th class="text-right">Origem</th>
                <th class="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in recentEntries" :key="entry._id">
                <td>{{ toIsoDate(entry.date) }}</td>
                <td class="text-right">{{ formatValue(entry.plannedValue) }}</td>
                <td class="text-right">{{ formatHours(entry.completedHours) }}</td>
                <td class="text-right">{{ sourceLabel(entry.source) }}</td>
                <td class="text-right">
                  <v-btn
                    icon="mdi-delete-outline"
                    size="x-small"
                    variant="text"
                    color="error"
                    :loading="deletingId === entry._id"
                    @click="removeEntry(entry._id)"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface ProgressEntry {
  _id: string
  date: string
  completedHours: number
  plannedValue: number
  source?: 'manual' | 'pomodoro' | 'completion'
}

interface EVMSummary {
  spi: number
  forecast: {
    estimatedDate: string | null
    variance: number
    remainingHours: number
    completionRate: number
    bac: number
    ev: number
    pv: number
  }
  curve: {
    plannedValue: number[]
    actualValue: number[]
    dates: string[]
  }
  totals: {
    completedHours: number
    entriesCount: number
  }
  personalMetrics: {
    consistencyScore: number
    planAdherence: number
    completionTrend: 'acelerando' | 'estavel' | 'desacelerando' | 'insuficiente'
    perceivedValueScore: number
    actionHint: string
  }
}

const props = defineProps<{
  projectId: string
  plannedHours?: number
}>()

const emptySummary: EVMSummary = {
  spi: 1,
  forecast: {
    estimatedDate: null,
    variance: 0,
    remainingHours: 0,
    completionRate: 0,
    bac: 0,
    ev: 0,
    pv: 0,
  },
  curve: {
    plannedValue: [],
    actualValue: [],
    dates: [],
  },
  totals: {
    completedHours: 0,
    entriesCount: 0,
  },
  personalMetrics: {
    consistencyScore: 100,
    planAdherence: 100,
    completionTrend: 'insuficiente',
    perceivedValueScore: 100,
    actionHint: 'Registre progresso para gerar recomendacoes personalizadas.',
  },
}

const loading = ref(false)
const saving = ref(false)
const deletingId = ref('')
const errorMessage = ref('')

const today = new Date().toISOString().slice(0, 10)
const entryDate = ref(today)
const entryPlannedValue = ref(0)
const entryCompletedHours = ref(0)

const entries = ref<ProgressEntry[]>([])
const summary = ref<EVMSummary>({ ...emptySummary })

const forecast = computed(() => summary.value.forecast)
const spi = computed(() => summary.value.spi || 1)

const trendLabel = computed(() => {
  const map: Record<EVMSummary['personalMetrics']['completionTrend'], string> = {
    acelerando: 'Acelerando',
    estavel: 'Estavel',
    desacelerando: 'Desacelerando',
    insuficiente: 'Dados insuficientes',
  }

  return map[summary.value.personalMetrics.completionTrend] || 'Dados insuficientes'
})

const canAddEntry = computed(() => {
  return (
    !!props.projectId
    && !!entryDate.value
    && entryPlannedValue.value >= 0
    && entryCompletedHours.value >= 0
  )
})

const isWarning = computed(() => spi.value < 0.95)
const isCritical = computed(() => spi.value < 0.85)

const spiColor = computed(() => {
  if (spi.value < 0.85) return 'error'
  if (spi.value < 0.95) return 'warning'
  return 'success'
})

const interpretation = computed(() => {
  const delay = spi.value < 1 ? ((1 - spi.value) * 100).toFixed(1) : '0.0'

  if (isCritical.value) {
    return `Voce esta avancando abaixo do ritmo esperado (${delay}% de atraso). Priorize menos tarefas e entregue o essencial nesta semana.`
  }

  if (isWarning.value) {
    return `O plano precisa de ajuste: ritmo ${delay}% abaixo do esperado.`
  }

  if (summary.value.personalMetrics.consistencyScore < 70) {
    return 'Ritmo geral bom, mas a consistencia semanal pode melhorar. Defina uma meta minima de horas por semana.'
  }

  return 'Voce esta no ritmo esperado. Mantenha a consistencia semanal para sustentar o progresso.'
})

const curveRows = computed(() => {
  const dates = summary.value.curve.dates || []
  const pv = summary.value.curve.plannedValue || []
  const ev = summary.value.curve.actualValue || []

  return dates.map((date, index) => ({
    date,
    cumulativePV: pv[index] || 0,
    cumulativeEV: ev[index] || 0,
  }))
})

const maxCurveValue = computed(() => {
  if (curveRows.value.length === 0) return 1
  return Math.max(
    ...curveRows.value.flatMap((point) => [point.cumulativePV, point.cumulativeEV]),
    1,
  )
})

const recentEntries = computed(() => [...entries.value].slice(-6).reverse())

const toBarPercent = (value: number) => {
  return Math.max(4, Math.min(100, (value / maxCurveValue.value) * 100))
}

const toIsoDate = (value: string) => {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

const sourceLabel = (source?: ProgressEntry['source']) => {
  if (source === 'pomodoro') return 'Pomodoro'
  if (source === 'completion') return 'Conclusao'
  return 'Manual'
}

const loadData = async () => {
  if (!props.projectId) return

  loading.value = true
  errorMessage.value = ''

  try {
    const [progressResponse, summaryResponse] = await Promise.all([
      $fetch<ProgressEntry[]>(`/api/projects/${props.projectId}/evm/progress`),
      $fetch<EVMSummary>(`/api/projects/${props.projectId}/evm/summary`),
    ])

    entries.value = progressResponse || []
    summary.value = summaryResponse || { ...emptySummary }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar dados EVM.'
    errorMessage.value = message
  } finally {
    loading.value = false
  }
}

const addEntry = async () => {
  if (!canAddEntry.value) return

  saving.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/projects/${props.projectId}/evm/progress`, {
      method: 'POST',
      body: {
        date: entryDate.value,
        completedHours: Number(entryCompletedHours.value) || 0,
        plannedValue: Number(entryPlannedValue.value) || 0,
      },
    })

    entryPlannedValue.value = 0
    entryCompletedHours.value = 0

    await loadData()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao registrar progresso.'
    errorMessage.value = message
  } finally {
    saving.value = false
  }
}

const removeEntry = async (entryId: string) => {
  if (!props.projectId || !entryId) return

  deletingId.value = entryId
  errorMessage.value = ''

  try {
    await $fetch(`/api/projects/${props.projectId}/evm/progress/${entryId}`, {
      method: 'DELETE',
    })

    await loadData()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao remover registro.'
    errorMessage.value = message
  } finally {
    deletingId.value = ''
  }
}

onMounted(loadData)

watch(
  () => props.projectId,
  () => {
    entries.value = []
    summary.value = { ...emptySummary }
    loadData()
  },
)

const formatIndex = (value: number) => value.toFixed(2)
const formatHours = (value: number) => `${value.toFixed(1)}h`
const formatPercent = (value: number) => `${Math.round(value)}%`
const formatValue = (value: number) => value.toFixed(1)
</script>

<style scoped>
.evm-card {
  background: rgba(255, 255, 255, 0.92);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.kpi-card :deep(.v-card-text) {
  padding: 0.55rem;
}

.kpi-label {
  font-size: 0.7rem;
  color: rgba(0, 0, 0, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.kpi-value {
  font-size: 1rem;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.curve-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.curve-row {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 0.55rem;
}

.curve-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  font-size: 0.75rem;
  margin-bottom: 0.45rem;
}

.bars {
  display: grid;
  gap: 0.35rem;
}

.bar {
  height: 18px;
  border-radius: 6px;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.4rem;
  min-width: 40px;
}

.bar.pv {
  background: #2563eb;
}

.bar.ev {
  background: #059669;
}

@media (max-width: 960px) {
  .kpi-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
