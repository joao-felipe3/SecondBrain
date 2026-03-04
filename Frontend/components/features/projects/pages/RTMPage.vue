<template>
  <v-sheet class="page-container" elevation="0" color="transparent" @click.stop>
    <!-- LEFT PAGE: Matriz de Rastreabilidade -->
    <v-sheet class="page left-page" elevation="0" color="transparent" @click.stop>
      <h3 class="page-title mb-4">🔗 Matriz de Rastreabilidade</h3>

      <RTMMatrix
        v-if="project._id"
        :projectId="project._id"
        :smartObjective="project.smartObjective"
      />
    </v-sheet>

    <!-- RIGHT PAGE: Planejamento em Ondas + Riscos -->
    <v-sheet class="page right-page" elevation="0" color="transparent" @click.stop>
      <v-tabs
        v-model="activeTab"
        class="mb-2"
        density="compact"
      >
        <v-tab value="waves" text="Ondas" />
        <v-tab value="risks" text="Riscos" />
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- Aba: Planejamento em Ondas -->
        <v-window-item value="waves">
          <ProjectWavesTimeline
            v-if="project._id"
            :projectId="project._id"
          />
        </v-window-item>

        <!-- Aba: Registro de Riscos -->
        <v-window-item value="risks">
          <RiskRegister
            v-if="project._id"
            :projectId="project._id"
          />
        </v-window-item>
      </v-window>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import RTMMatrix from '../sections/RTMMatrix.vue'
import ProjectWavesTimeline from '../sections/ProjectWavesTimeline.vue'
import RiskRegister from '../sections/RiskRegister.vue'
import type { Project } from '~/models/Project'

defineProps<{
  project: Project
  editing: boolean
}>()

const activeTab = ref<'waves' | 'risks'>('waves')
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

.left-page {
  border-right: 1px solid #e2e8f0;
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
</style>
