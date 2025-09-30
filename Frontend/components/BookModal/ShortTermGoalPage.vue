<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <p class="goal-content">{{ project.shortTermGoal }}</p>
        <div class="timeline-info">
          <h5>📅 Cronograma</h5>
          <p><strong>Início:</strong> {{ formatDate(project.startDate) }}</p>
          <p><strong>Prazo:</strong> {{ formatDate(project.deadline) }}</p>
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

const { formatDate } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null }
})
</script>
