<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Médio Prazo</h4>
        <p class="goal-content">{{ project.midTermGoal }}</p>
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
          <p><strong>Meta de Horas:</strong> {{ Math.round((project.plannedHours || 0) * 0.6) }}h</p>
          <p><strong>Experiência Esperada:</strong> {{ Math.round((project.experience || 0) * 0.6) }} EXP</p>
          <p><strong>Recompensa Parcial:</strong> {{ Math.round((project.reward || 0) * 0.6) }} pts</p>
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

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null }
})
</script>
