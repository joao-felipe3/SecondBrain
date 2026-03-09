<template>
  <div class="section-header">
    <div>
      <div class="header-actions">
        <v-btn
          size="small"
          variant="outlined"
          rounded="pill"
          prepend-icon="mdi-waveform"
          @click="generateWaves"
          :loading="loading"
        >
          Gerar Ondas
        </v-btn>
        <v-btn
          v-if="waves.length > 0"
          size="small"
          variant="tonal"
          rounded="pill"
          prepend-icon="mdi-calendar-sync-outline"
          color="primary"
          :loading="replanningDeadlines"
          @click="replanTaskDeadlines"
        >
          Replanejar Prazos
        </v-btn>
      </div>
      <div v-if="waves.length > 0" class="header-meta">
        <span>{{ waves.length }} ondas</span>
        <span>Ativa: {{ activeWaveLabel }}</span>
        <span>Próxima: {{ nextPlannedWaveLabel }}</span>
      </div>
    </div>
  </div>

  <div v-if="waves.length > 0" class="timeline-shell">
    <div class="timeline">
      <div
        v-for="(wave, idx) in waves"
        :key="wave._id"
        class="wave-item"
        :class="[
          `wave-status-${wave.status}`,
          {
            'wave-current': idx === progressiveWaveIndex,
            'wave-future': isFutureWave(idx, wave.status),
          },
        ]"
        @click="selectWave(wave)"
      >
        <v-tooltip location="top" open-delay="120" max-width="320">
          <template #activator="{ props: tooltipProps }">
            <div class="wave-surface" v-bind="tooltipProps">
              <div class="wave-marker-wrap">
                <div class="wave-connector"></div>
                <div class="wave-marker">
                  <v-icon size="18">
                    {{ getWaveIcon(wave.status) }}
                  </v-icon>
                </div>
              </div>

              <div class="wave-label">
                <p class="wave-title">Onda {{ wave.waveNumber }}</p>
                <p class="wave-subtitle">
                  {{ formatDate(wave.startDate) }} - {{ formatDate(wave.endDate) }}
                </p>
              </div>

              <div class="wave-footer">
                <v-chip
                  size="x-small"
                  label
                  class="wave-status-chip"
                  :class="`status-${wave.status}`"
                >
                  {{ getWaveStatusLabel(wave.status) }}
                </v-chip>

                <div class="wave-tasks-count">
                  {{ wave.taskIds.length }}
                </div>
              </div>
            </div>
          </template>

          <div class="wave-tooltip">
            <div class="tooltip-title">Onda {{ wave.waveNumber }}</div>
            <div class="tooltip-line">Status: {{ getWaveStatusLabel(wave.status) }}</div>
            <div class="tooltip-line">
              Período: {{ formatDate(wave.startDate) }} - {{ formatDate(wave.endDate) }}
            </div>
            <div class="tooltip-line">Tarefas: {{ wave.taskIds.length }}</div>
            <div v-if="wave.description" class="tooltip-description">{{ wave.description }}</div>
          </div>
        </v-tooltip>
      </div>
    </div>
  </div>

  <div v-if="waves.length > 0" class="timeline-legend">
    <div class="legend-item">
      <span class="legend-dot planned"></span>
      <span>Planejada</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot active"></span>
      <span>Ativa</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot completed"></span>
      <span>Concluída</span>
    </div>
  </div>

  <!-- Dialog com Detalhes da Onda Selecionada -->
  <v-dialog v-model="showWaveDialog" max-width="600" scrollable no-click-animation persistent>
    <v-card v-if="selectedWave" class="wave-dialog-card">
      <v-card-title>
        Onda {{ selectedWave.waveNumber }}
        <v-chip
          :class="`status-${selectedWave.status}`"
          size="small"
          label
          class="ml-2"
        >
          {{ getWaveStatusLabel(selectedWave.status) }}
        </v-chip>
      </v-card-title>

      <v-card-text>
        <v-row dense class="mb-4">
          <v-col cols="6">
            <p class="text-caption text-grey">Período</p>
            <p class="font-weight-bold">
              {{ formatDate(selectedWave.startDate) }} - {{ formatDate(selectedWave.endDate) }}
            </p>
          </v-col>
          <v-col cols="6">
            <p class="text-caption text-grey">Tarefas</p>
            <p class="font-weight-bold">{{ selectedWave.taskIds.length }} planejadas</p>
          </v-col>
        </v-row>

        <v-card v-if="selectedWave.description" variant="outlined" class="mb-3 wave-focus-card">
          <v-card-text class="py-2 px-3">
            <p class="text-caption text-grey mb-1">Foco da Onda</p>
            <p class="mb-0">{{ selectedWave.description }}</p>
          </v-card-text>
        </v-card>

        <div v-if="!isSelectedWaveFuture" class="current-wave-tasks">
          <p class="text-caption text-grey mb-2">Tarefas Detalhadas</p>
          <v-list v-if="selectedWaveTasks.length > 0" density="compact" class="task-list" lines="two">
            <v-list-item
              v-for="task in selectedWaveTasks"
              :key="task._id"
              :title="task.name"
              :subtitle="task.deadline ? `Prazo: ${formatDate(task.deadline)}` : 'Sem prazo definido'"
            >
              <template #append>
                <v-chip size="x-small" variant="outlined">
                  {{ estimateTaskHours(task).toFixed(1) }}h
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <p v-else class="text-caption text-grey mb-0">Não há tarefas detalhadas vinculadas a esta onda.</p>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showWaveDialog = false">
          Fechar
        </v-btn>
        <v-btn
          v-if="selectedWave.status === 'planned'"
          size="small"
          color="primary"
          variant="tonal"
          @click="activateWave(selectedWave._id)"
        >
          Ativar Onda
        </v-btn>
        <v-btn
          v-else-if="selectedWave.status === 'active'"
          size="small"
          color="success"
          variant="tonal"
          @click="completeWave(selectedWave._id)"
        >
          Marcar como Concluída
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Sem ondas -->
  <v-empty-state
    v-if="waves.length === 0"
    icon="mdi-wave"
    title="Nenhuma onda planejada"
    text="Clique em 'Gerar Ondas' para criar o planejamento em waves"
    class="mt-4"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Ref } from 'vue'

interface ProjectWave {
  _id: string
  projectId: string
  waveNumber: number
  startDate: string
  endDate: string
  status: 'planned' | 'active' | 'completed'
  taskIds: string[]
  description?: string
  createdAt: string
}

interface ProjectTask {
  _id: string
  name: string
  deadline?: string
  isConcluded?: boolean
  pomodorosPlanned?: number
  pomodorosDid?: number
  pertExpectedMinutes?: number
  createdAt?: string
}

interface ReplanTaskDeadlinesResponse {
  updatedCount: number
  skippedConcludedCount: number
  waveCount: number
  summaries: Array<{
    waveNumber: number
    updatedTasks: number
    skippedConcludedTasks: number
    effectiveStartDate: string | null
    effectiveEndDate: string | null
  }>
}

const props = defineProps<{
  projectId: string
}>()

const waves: Ref<ProjectWave[]> = ref([])
const selectedWave: Ref<ProjectWave | null> = ref(null)
const projectTasks: Ref<ProjectTask[]> = ref([])
const loading = ref(false)
const showWaveDialog = ref(false)
const replanningDeadlines = ref(false)

const currentWaveIndex = computed(() => {
  return waves.value.findIndex(w => w.status === 'active')
})

const activeWaveLabel = computed(() => {
  const activeWave = waves.value.find(w => w.status === 'active')
  return activeWave ? `Onda ${activeWave.waveNumber}` : 'Nenhuma'
})

const nextPlannedWaveLabel = computed(() => {
  const nextWave = waves.value.find(w => w.status === 'planned')
  return nextWave ? `Onda ${nextWave.waveNumber}` : 'Sem próxima'
})

const progressiveWaveIndex = computed(() => {
  return currentWaveIndex.value >= 0 ? currentWaveIndex.value : 0
})

const isFutureWave = (index: number, status: ProjectWave['status']) => {
  return status === 'planned' && index > progressiveWaveIndex.value
}

const isSelectedWaveFuture = computed(() => {
  if (!selectedWave.value) return false
  const index = waves.value.findIndex(w => w._id === selectedWave.value?._id)
  if (index < 0) return false
  return isFutureWave(index, selectedWave.value.status)
})

const selectedWaveTasks = computed(() => {
  if (!selectedWave.value) return []
  const ids = new Set((selectedWave.value.taskIds || []).map(id => String(id)))
  return projectTasks.value.filter(task => ids.has(String(task._id)))
})

const estimateTaskHours = (task: ProjectTask) => {
  if (typeof task.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
    return task.pertExpectedMinutes / 60
  }
  if (typeof task.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
    return task.pomodorosPlanned * 0.5
  }
  return 1
}

const getWaveIcon = (status: string) => {
  const map: Record<string, string> = {
    planned: 'mdi-clock-outline',
    active: 'mdi-play-circle',
    completed: 'mdi-check-circle',
  }
  return map[status] || 'mdi-wave'
}

const getWaveStatusLabel = (status: ProjectWave['status']) => {
  const map: Record<ProjectWave['status'], string> = {
    planned: 'Planejada',
    active: 'Ativa',
    completed: 'Concluída',
  }
  return map[status]
}

const getWaveCompactLabel = (wave: ProjectWave, index: number) => {
  if (wave.status === 'active') {
    return 'Em execução'
  }
  if (wave.status === 'completed') {
    return 'Já concluída'
  }
  if (isFutureWave(index, wave.status)) {
    return 'Próxima etapa'
  }
  return 'Planejamento'
}

const getGranularityDescription = (waveNumber: number) => {
  if (waveNumber <= 2) {
    return 'Todas as sub-tarefas e passos detalhados'
  } else if (waveNumber <= 4) {
    return 'Marcos principais e tarefas críticas'
  } else {
    return 'Apenas milestones de alto nível'
  }
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR', {
    month: 'short',
    day: 'numeric',
  })
}

const selectWave = (wave: ProjectWave) => {
  selectedWave.value = wave
  showWaveDialog.value = true
}

const refreshProjectData = async (providedWaves?: ProjectWave[]) => {
  const selectedWaveId = selectedWave.value?._id ?? null
  const nextWaves = providedWaves ?? await $fetch<ProjectWave[]>(`/api/projects/${props.projectId}/waves`)

  waves.value = nextWaves || []
  projectTasks.value = await $fetch<ProjectTask[]>(`/api/projects/${props.projectId}/tasks`)

  if (waves.value.length === 0) {
    selectedWave.value = null
    showWaveDialog.value = false
    return
  }

  selectedWave.value =
    (selectedWaveId ? waves.value.find(wave => wave._id === selectedWaveId) ?? null : null) ||
    waves.value[progressiveWaveIndex.value] ||
    waves.value[0]
}

const generateWaves = async () => {
  loading.value = true
  try {
    const response = await $fetch<ProjectWave[]>(`/api/projects/${props.projectId}/generate-waves`, {
      method: 'POST',
      body: {
        waveLengthDays: 28, // 4 semanas - duração é calculada do projeto.deadline
      },
    })
    await refreshProjectData(response)
  } catch (error) {
    console.error('Erro ao gerar ondas:', error)
  } finally {
    loading.value = false
  }
}

const activateWave = async (waveId: string) => {
  try {
    await $fetch<void>(`/api/projects/${props.projectId}/waves/${waveId}`, {
      method: 'PATCH',
      body: { status: 'active' },
    })
    await refreshProjectData()
  } catch (error) {
    console.error('Erro ao ativar onda:', error)
  }
}

const completeWave = async (waveId: string) => {
  try {
    await $fetch<void>(`/api/projects/${props.projectId}/waves/${waveId}`, {
      method: 'PATCH',
      body: { status: 'completed' },
    })
    await refreshProjectData()
  } catch (error) {
    console.error('Erro ao completar onda:', error)
  }
}

const replanTaskDeadlines = async () => {
  replanningDeadlines.value = true
  try {
    const response = await $fetch<ReplanTaskDeadlinesResponse>(
      `/api/projects/${props.projectId}/waves/replan-task-deadlines`,
      {
        method: 'POST',
      },
    )

    await refreshProjectData()
    console.debug(
      `[waves] replanejamento concluído: ${response.updatedCount} tarefas atualizadas em ${response.waveCount} ondas`,
    )
  } catch (error) {
    console.error('Erro ao replanejar prazos das tarefas:', error)
  } finally {
    replanningDeadlines.value = false
  }
}

onMounted(async () => {
  try {
    await refreshProjectData()
  } catch (error) {
    // Erro ao carregar ondas é esperado se a rota não existir ainda
    console.debug('Ondas não existem ainda:', error)
  }
})
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.section-eyebrow {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #64748b;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}

.header-meta {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: #64748b;
}

.timeline-shell {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  padding: 0.7rem 0.8rem 0.8rem;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
}

.timeline {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 0.55rem;
  width: 100%;
}

.wave-item {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  min-width: 0;
}

.wave-surface {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.38rem;
  height: 100%;
  padding: 0.35rem 0.25rem 0.2rem;
  border-radius: 12px;
}

.wave-item:hover {
  transform: translateY(-2px);
}

.wave-item.wave-status-planned {
  color: #1976d2;
}

.wave-item.wave-status-active {
  color: #2e7d32;
}

.wave-item.wave-status-completed {
  color: #1565c0;
}

.wave-item.wave-current {
  transform: translateY(-1px);
}

.wave-item.wave-future {
  opacity: 0.8;
  filter: saturate(0.82);
}

.wave-marker-wrap {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 26px;
}

.wave-connector {
  position: absolute;
  inset: 50% -0.55rem auto;
  height: 2px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.24), rgba(148, 163, 184, 0.52), rgba(148, 163, 184, 0.24));
}

.wave-item:first-child .wave-connector {
  left: 50%;
}

.wave-item:last-child .wave-connector {
  right: 50%;
}

.wave-marker {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #eff6ff;
  border: 2px solid currentColor;
  color: #1976d2;
}

.wave-status-active .wave-marker {
  background: #ecfdf3;
  color: #388e3c;
}

.wave-status-completed .wave-marker {
  background: #eff6ff;
  color: #1565c0;
}

.wave-label {
  min-width: 0;
  text-align: center;
}

.wave-title {
  font-weight: 600;
  font-size: 0.77rem;
  line-height: 1.1;
  margin: 0 0 0.08rem;
  color: #0f172a;
}

.wave-subtitle {
  font-size: 0.63rem;
  color: #64748b;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wave-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.08rem;
  flex-wrap: wrap;
}

.wave-tasks-count {
  font-size: 0.62rem;
  color: #475569;
  background: rgba(15, 23, 42, 0.05);
  padding: 0.16rem 0.38rem;
  border-radius: 999px;
}

.wave-status-chip {
  max-width: 84px;
}

.wave-tooltip {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tooltip-title {
  font-weight: 700;
  color: #e2e8f0;
}

.tooltip-line {
  font-size: 0.8rem;
  color: #cbd5e1;
}

.tooltip-description {
  margin-top: 0.3rem;
  font-size: 0.8rem;
  color: #f8fafc;
}

.timeline-legend {
  display: flex;
  gap: 0.9rem;
  flex-wrap: wrap;
  margin-top: 0.45rem;
  padding-inline: 0.1rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.74rem;
  color: #64748b;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-dot.planned {
  background: #64b5f6;
}

.legend-dot.active {
  background: #4caf50;
}

.legend-dot.completed {
  background: #90caf9;
}

.wave-focus-card {
  border-style: dashed;
}

.task-list {
  max-height: 260px;
  overflow-y: auto;
}

.granularity-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(33, 150, 243, 0.08);
  border-left: 3px solid #2196f3;
  border-radius: 4px;
  font-size: 0.85rem;
}

.status-planned {
  background-color: rgba(100, 181, 246, 0.2) !important;
  color: #1976d2 !important;
}

.status-active {
  background-color: rgba(76, 175, 80, 0.2) !important;
  color: #388e3c !important;
}

.status-completed {
  background-color: rgba(144, 202, 249, 0.2) !important;
  color: #1565c0 !important;
}

.wave-dialog-card {
  background-color: #ffffff;
}

@media (max-width: 700px) {
  .timeline {
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  }

  .timeline-shell {
    padding: 0.65rem 0.7rem 0.75rem;
  }

  .header-meta {
    gap: 0.45rem;
    font-size: 0.68rem;
  }
}
</style>
