<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Médio Prazo</h4>
        <template v-if="editing">
          <v-textarea 
            v-model="local.midTermGoal" 
            label="Objetivo médio prazo" 
            variant="solo-filled" 
            density="comfortable" 
            auto-grow 
            rows="4" 
            @update:model-value="emitField('midTermGoal', $event)" 
          />
        </template>
        <p v-else class="goal-content">{{ project.midTermGoal }}</p>
        <div class="strategy-section">
          <h5>📋 Estratégias</h5>
          <ul>
            <li>Planejamento detalhado</li>
            <li>Alocação de recursos</li>
            <li>Identificação de riscos</li>
            <li>Planos de contingência</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h5>📈 Métricas de Sucesso</h5>
        <div class="metrics-info">
          <p><strong>Meta de Horas:</strong> {{ Math.round(((editing ? local.plannedHours : project.plannedHours) || 0) * 0.6) }}h</p>
          <p><strong>Experiência Esperada:</strong> {{ Math.round(((editing ? local.experience : project.experience) || 0) * 0.6) }} EXP</p>
          <p><strong>Recompensa Parcial:</strong> {{ Math.round(((editing ? local.reward : project.reward) || 0) * 0.6) }} pts</p>
        </div>
        <div class="checkpoint-box">
          <h6>🏁 Checkpoint</h6>
          <p>Revise e ajuste os objetivos conforme o progresso.</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
watch(() => props.project, (v) => { 
  if (v) Object.assign(local, v) 
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) Object.assign(local, props.project) 
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
</script>

<style scoped>
/* CSS removido - deixando BookModal.css gerenciar os estilos globalmente */
</style>
