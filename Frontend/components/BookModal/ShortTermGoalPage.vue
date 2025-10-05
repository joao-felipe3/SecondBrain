<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <v-textarea v-model="local.shortTermGoal" label="Objetivo curto prazo" variant="solo-filled" density="comfortable" auto-grow rows="4" @update:model-value="emitField('shortTermGoal', $event)" />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div class="timeline-info">
          <h5>📅 Cronograma</h5>
          <p><strong>Início:</strong>
            <span v-if="!editing">{{ formatDate(project.startDate) }}</span>
            <v-text-field v-else v-model="local.startDate" type="date" label="Início" variant="solo-filled" density="comfortable" hide-details style="max-width:170px;display:inline-block" @update:model-value="emitField('startDate', $event)" />
          </p>
          <p><strong>Prazo:</strong>
            <span v-if="!editing">{{ formatDate(project.deadline) }}</span>
            <v-text-field v-else v-model="local.deadline" type="date" label="Prazo" variant="solo-filled" density="comfortable" hide-details style="max-width:170px;display:inline-block" @update:model-value="emitField('deadline', $event)" />
          </p>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h5>💡 Dicas para o Sucesso</h5>
        <ul class="tips-list">
          <li>Divida as tarefas em pequenas etapas</li>
          <li>Estabeleça marcos intermediários</li>
          <li>Monitore o progresso regularmente</li>
          <li>Ajuste o cronograma conforme necessário</li>
        </ul>
        <div class="motivation-box">
          <h6>🌟 Motivação</h6>
          <p>"O sucesso é a soma de pequenos esforços repetidos dia após dia."</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

const { formatDate } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})

// Sincroniza apenas os campos específicos desta página
watch(() => props.project, (v) => { 
  if (v) {
    local.shortTermGoal = v.shortTermGoal
    local.startDate = v.startDate
    local.deadline = v.deadline
  }
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.shortTermGoal = props.project.shortTermGoal
    local.startDate = props.project.startDate
    local.deadline = props.project.deadline
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
