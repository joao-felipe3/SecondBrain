<template>
  <div class="page-content">
    <div class="page-header">
      <h2 class="page-title">Matriz de Rastreabilidade</h2>
      <p class="page-subtitle">
        Mapeie e valide a cobertura de requisitos nas tarefas do projeto
      </p>
    </div>

    <RTMMatrix
      v-if="project._id"
      :projectId="project._id"
      :smartObjective="project.smartObjective"
    />
  </div>
</template>

<script setup lang="ts">
import RTMMatrix from '../sections/RTMMatrix.vue'
import type { Project } from '~/models/Project'

defineProps<{
  project: Project
  editing: boolean
}>()
</script>

<style scoped>
.page-content {
  padding: 2rem 1.5rem;
  max-width: 100%;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  margin-bottom: 2rem;
  text-align: center;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0;
  color: #fff;
}

.page-subtitle {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0.5rem 0 0 0;
}
</style>
