<template>
  <v-sheet class="waves-timeline" elevation="0" color="transparent">
    <div class="section-header">
      <h4 class="section-title">🌊 Planejamento em Ondas</h4>
      <v-btn
        size="small"
        variant="outlined"
        @click="generateWaves"
        :loading="loading"
      >
        Gerar Ondas
      </v-btn>
    </div>

    <!-- Timeline Visual -->
    <div v-if="waves.length > 0" class="timeline">
      <div
        v-for="(wave, idx) in waves"
        :key="wave._id"
        class="wave-item"
        :class="[
          `wave-status-${wave.status}`,
          { 'wave-current': idx === progressiveWaveIndex, 'wave-future': isFutureWave(idx, wave.status) }
        ]"
        @click="selectWave(wave)"
      >
        <div class="wave-marker">
          <v-icon size="24">
            {{ getWaveIcon(wave.status) }}
          </v-icon>
        </div>
        <div class="wave-label">
          <p class="wave-title">Onda {{ wave.waveNumber }}</p>
          <p class="wave-date">
            {{ formatDate(wave.startDate) }} - {{ formatDate(wave.endDate) }}
          </p>
        </div>
        <div class="wave-tasks-count">
          {{ wave.taskIds.length }} {{ isFutureWave(idx, wave.status) ? 'itens agrupados' : 'tarefas' }}
        </div>
      </div>
    </div>

    <!-- Detalhes da Onda Selecionada -->
    <v-expand-transition>
      <div v-if="selectedWave" class="wave-details mt-4">
        <v-card variant="outlined">
          <v-card-title>
            Onda {{ selectedWave.waveNumber }}
            <v-chip
              :class="`status-${selectedWave.status}`"
              size="small"
              label
              class="ml-2"
            >
              {{ selectedWave.status }}
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

            <v-alert
              v-if="isSelectedWaveFuture"
              density="comfortable"
              type="info"
              variant="tonal"
              class="mb-3"
            >
              Onda futura em planejamento agregado (épicos/milestones). O detalhamento completo será feito quando esta onda se aproximar.
            </v-alert>

            <v-alert
              v-else
              density="comfortable"
              type="success"
              variant="tonal"
              class="mb-3"
            >
              Onda em detalhamento máximo: tarefas individuais e esforço estimado.
            </v-alert>

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

            <!-- Granularidade por Onda -->
            <div class="granularity-info">
              <v-icon size="18" class="mr-2">mdi-information</v-icon>
              <span class="text-caption">
                <strong v-if="selectedWave.waveNumber === 1 || selectedWave.waveNumber === 2">
                  Detalhe máximo:
                </strong>
                <strong v-else>
                  Detalhe reduzido:
                </strong>
                {{ getGranularityDescription(selectedWave.waveNumber) }}
              </span>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
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
      </div>
    </v-expand-transition>

    <!-- Sem ondas -->
    <v-empty-state
      v-if="waves.length === 0"
      icon="mdi-wave"
      title="Nenhuma onda planejada"
      text="Clique em 'Gerar Ondas' para criar o planejamento em waves"
      class="mt-4"
    />
  </v-sheet>
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
  pomodorosPlanned?: number
  pertExpectedMinutes?: number
}

const props = defineProps<{
  projectId: string
}>()

const waves: Ref<ProjectWave[]> = ref([])
const selectedWave: Ref<ProjectWave | null> = ref(null)
const projectTasks: Ref<ProjectTask[]> = ref([])
const loading = ref(false)

const currentWaveIndex = computed(() => {
  return waves.value.findIndex(w => w.status === 'active')
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
  selectedWave.value = selectedWave.value?._id === wave._id ? null : wave
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
    waves.value = response
    projectTasks.value = await $fetch<ProjectTask[]>(`/api/projects/${props.projectId}/tasks`)
    if (response.length > 0) {
      selectedWave.value = response[progressiveWaveIndex.value] || response[0]
    }
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
    const wave = waves.value.find(w => w._id === waveId)
    if (wave) wave.status = 'active'
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
    const wave = waves.value.find(w => w._id === waveId)
    if (wave) wave.status = 'completed'
  } catch (error) {
    console.error('Erro ao completar onda:', error)
  }
}

onMounted(async () => {
  try {
    const response = await $fetch<ProjectWave[]>(`/api/projects/${props.projectId}/waves`)
    waves.value = response || []
    projectTasks.value = await $fetch<ProjectTask[]>(`/api/projects/${props.projectId}/tasks`)
    if (waves.value.length > 0) {
      selectedWave.value = waves.value[progressiveWaveIndex.value] || waves.value[0]
    }
  } catch (error) {
    // Erro ao carregar ondas é esperado se a rota não existir ainda
    console.debug('Ondas não existem ainda:', error)
  }
})
</script>

<style scoped>
.waves-timeline {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.timeline {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.5rem 0;
}

.wave-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 140px;
  background: rgba(0, 0, 0, 0.02);
  border: 2px solid transparent;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }

  &.wave-status-planned {
    border-color: #64b5f6;
  }

  &.wave-status-active {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  &.wave-status-completed {
    border-color: #90caf9;
    opacity: 0.7;
  }

  &.wave-current {
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
  }

  &.wave-future {
    opacity: 0.72;
    filter: saturate(0.75);
  }
}

.wave-marker {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(100, 181, 246, 0.2);
  color: #1976d2;

  .wave-status-active & {
    background: rgba(76, 175, 80, 0.2);
    color: #388e3c;
  }
}

.wave-label {
  text-align: center;
}

.wave-title {
  font-weight: 600;
  font-size: 0.85rem;
  margin: 0;
}

.wave-date {
  font-size: 0.75rem;
  color: #666;
  margin: 0.25rem 0 0 0;
}

.wave-tasks-count {
  font-size: 0.75rem;
  color: #999;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.wave-details {
  padding: 0.5rem 0;
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
</style>
