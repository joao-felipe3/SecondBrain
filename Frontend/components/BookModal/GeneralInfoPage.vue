<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <template v-if="editing">
          <input v-model="local.name" class="input" placeholder="Nome do Projeto" @input="emitField('name', local.name)" />
          <textarea v-model="local.description" class="textarea" rows="4" placeholder="Descrição" @input="emitField('description', local.description)" />
        </template>
        <template v-else>
          <h3 class="page-title">{{ project.name }}</h3>
          <p class="project-description">{{ project.description }}</p>
        </template>
        <div class="stats-grid">
          <div class="stat-row">
            <Calendar :size="16" />
            <span v-if="!editing">{{ formatDeadline(project.deadline) }}</span>
            <input v-else type="date" v-model="local.deadline" class="input" @input="emitField('deadline', local.deadline)" />
          </div>
          <div class="stat-row">
            <Coins :size="16" />
            <span v-if="!editing">{{ project.reward }} pontos</span>
            <input v-else type="number" min="0" v-model.number="local.reward" class="input" @input="emitField('reward', local.reward)" />
          </div>
          <div class="stat-row">
            <Award :size="16" />
            <span v-if="!editing">{{ project.experience }} EXP</span>
            <input v-else type="number" min="0" v-model.number="local.experience" class="input" @input="emitField('experience', local.experience)" />
          </div>
          <div class="stat-row" v-if="editing">
            <span style="font-size:12px;opacity:.8">Cor:</span>
            <input type="color" v-model="local.color" class="color-input" @input="emitField('color', local.color)" />
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
            <input type="number" min="0" v-model.number="local.plannedHours" class="inline-input" @input="emitField('plannedHours', local.plannedHours)" />h
          </p>
          <p><strong>Progresso:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${project.progressPercentage || 0}%`, backgroundColor: project.color }"></div>
        </div>
        <p><strong>Status:</strong>
          <span v-if="!editing">{{ project.status }}</span>
          <select v-else v-model="local.status" class="input" @change="emitField('status', local.status)">
            <option value="pending">pending</option>
            <option value="in-progress">in-progress</option>
            <option value="completed">completed</option>
            <option value="archived">archived</option>
          </select>
        </p>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch, toRefs } from 'vue'

const { formatDeadline } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})

watch(() => props.project, (val) => {
  if (val) Object.assign(local, val)
}, { immediate: true })

watch(() => props.editing, (is) => {
  if (is && props.project) Object.assign(local, props.project)
}, { immediate: true })

function emitField(field: string, value: any) {
  emit('update-field', field, value)
}
</script>

<style scoped>
.input, .textarea, .inline-input, select { width:100%; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:.4rem .5rem; border-radius:4px; font:inherit; }
.editing .input, .editing .textarea, .editing .inline-input, .editing select { background:#fff; color:#222; border:1px solid #c9b28a; box-shadow:0 0 0 2px rgba(140,90,40,0.15); }
.editing .input:focus, .editing .textarea:focus, .editing .inline-input:focus, .editing select:focus { outline:2px solid #b7791f; outline-offset:2px; }
.inline-input { width:5rem; display:inline-block; }
.textarea { resize: vertical; }
.color-input { width: 40px; height: 32px; padding:0; background:transparent; border:none; }
</style>
