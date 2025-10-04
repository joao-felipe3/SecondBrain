<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <div v-if="project">
        <template v-if="editing">
          <v-text-field 
            v-model="local.name" 
            label="Nome do Projeto *"
            variant="solo-filled"
            density="comfortable"
            @update:model-value="emitField('name', $event)" 
          />
          <v-textarea 
            v-model="local.description" 
            label="Descrição"
            variant="solo-filled"
            density="comfortable"
            rows="3"
            auto-grow
            @update:model-value="emitField('description', $event)" 
          />
        </template>
        <template v-else>
          <h3 class="page-title">{{ project.name }}</h3>
          <p class="project-description">{{ project.description }}</p>
        </template>
        <div class="stats-grid">
          <div class="stat-row">
            <Calendar :size="16" />
            <span v-if="!editing">{{ formatDeadline(project.deadline) }}</span>
            <v-text-field 
              v-else 
              v-model="local.deadline" 
              type="date"
              label="Deadline" 
              variant="solo-filled"
              density="comfortable"
              hide-details
              @update:model-value="emitField('deadline', $event)" 
            />
          </div>
          <div class="stat-row">
            <Coins :size="16" />
            <span v-if="!editing">{{ project.reward }} pontos</span>
            <v-text-field v-else v-model.number="local.reward" type="number" label="Recompensa" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('reward', $event)" />
          </div>
            <div class="stat-row">
              <Award :size="16" />
              <span v-if="!editing">{{ project.experience }} EXP</span>
              <v-text-field v-else v-model.number="local.experience" type="number" label="EXP" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('experience', $event)" />
            </div>
            <div class="stat-row" v-if="editing">
              <span style="font-size:12px;opacity:.8">Cor:</span>
              <v-text-field v-model="local.color" type="color" label="Cor" variant="solo-filled" density="comfortable" hide-details style="max-width:120px" @update:model-value="emitField('color', $event)" />
            </div>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h4>📊 Progresso do Projeto</h4>
        <div class="progress-info">
          <p><strong>Horas Trabalhadas:</strong> {{ project.totalHoursWorked }}h</p>
          <p v-if="!editing"><strong>Horas Planejadas:</strong> {{ project.plannedHours }}h</p>
          <p v-else>
            <strong>Horas Planejadas:</strong>
            <v-text-field v-model.number="local.plannedHours" type="number" variant="solo-filled" density="comfortable" hide-details style="max-width:110px;display:inline-block" @update:model-value="emitField('plannedHours', $event)" />h
          </p>
          <p><strong>Progresso:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${project.progressPercentage || 0}%`, backgroundColor: project.color }"></div>
        </div>
        <p><strong>Status:</strong>
          <span v-if="!editing">{{ project.status }}</span>
          <v-select v-else v-model="local.status" :items="statusItems" variant="solo-filled" density="comfortable" hide-details style="max-width:220px;display:inline-block" @update:model-value="emitField('status', $event)" />
        </p>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'
// Removidos imports dos Common components - usando Vuetify diretamente

const { formatDeadline } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const statusItems = ['pending','in-progress','completed','archived']

watch(() => props.project, (val) => {
  if (val) {
    Object.assign(local, val)
  }
}, { immediate: true })

watch(() => props.editing, (is) => {
  if (is && props.project) {
    // Quando entra em modo de edição, sincroniza os dados
    Object.assign(local, props.project)
  }
}, { immediate: true })

function emitField(field: string, value: any) {
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value)
}
</script>

<style scoped>
/* CSS removido - deixando BookModal.css gerenciar os estilos globalmente */
</style>
