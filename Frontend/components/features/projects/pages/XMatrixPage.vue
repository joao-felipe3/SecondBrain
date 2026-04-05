<template>
  <v-sheet class="xmatrix-page" elevation="0" color="transparent" @click.stop>
    <h3 class="page-title mb-3">X-Matrix</h3>
    <XMatrix v-if="project?._id" :project-id="String(project._id)" />
    <v-alert v-else type="info" variant="tonal" density="compact">
      Projeto sem ID valido para gerar X-Matrix.
    </v-alert>
  </v-sheet>
</template>

<script setup lang="ts">
import XMatrix from '../sections/XMatrix.vue'
import type { Project } from '~/models/Project'

defineProps<{
  project: Project
  editing: boolean
}>()
</script>

<style scoped>
.xmatrix-page {
  width: 100%;
  height: 100%;
}

.page-title {
  font-size: 1.05rem;
  font-weight: 700;
}
</style>
