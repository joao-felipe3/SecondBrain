<template>
  <v-sheet class="page-container" elevation="0" color="transparent" @click.stop>
    <v-sheet class="page full-page" elevation="0" color="transparent" @click.stop>
      <h3 class="page-title mb-4">⚠️ Registro de Riscos</h3>

      <RiskRegister
        v-if="project._id"
        :projectId="project._id"
      />
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import RiskRegister from '../sections/RiskRegister.vue'
import type { Project } from '~/models/Project'

defineProps<{
  project: Project
  editing: boolean
}>()
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
  align-items: flex-start;
}

.page {
  flex: 1;
  min-width: 0;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.full-page {
  width: 100%;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
</style>