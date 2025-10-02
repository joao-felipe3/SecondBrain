<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Médio Prazo</h4>
        <template v-if="editing">
          <textarea v-model="local.midTermGoal" class="textarea" rows="5" placeholder="Objetivo médio prazo" @input="emitField('midTermGoal', local.midTermGoal)" />
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
watch(() => props.project, (v) => { if (v) Object.assign(local, v) }, { immediate: true })
watch(() => props.editing, (is) => { if (is && props.project) Object.assign(local, props.project) })

function emitField(field: string, value: any) { emit('update-field', field, value) }
</script>

<style scoped>
.textarea { width:100%; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:.4rem .5rem; border-radius:4px; font:inherit; }
.editing .textarea { background:#fff; color:#222; border:1px solid #c9b28a; box-shadow:0 0 0 2px rgba(140,90,40,0.12); }
.editing .textarea:focus { outline:2px solid #b7791f; outline-offset:2px; }
</style>
