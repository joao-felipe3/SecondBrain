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
          { 'wave-current': idx === currentWaveIndex }
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
          {{ wave.taskIds.length }} tarefas
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
  createdAt: string
}

const props = defineProps<{
  projectId: string
}>()

const waves: Ref<ProjectWave[]> = ref([])
const selectedWave: Ref<ProjectWave | null> = ref(null)
const loading = ref(false)

const currentWaveIndex = computed(() => {
  return waves.value.findIndex(w => w.status === 'active')
})

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
    if (response.length > 0) {
      selectedWave.value = response[0]
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
