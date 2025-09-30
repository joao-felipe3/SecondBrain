<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h3 class="page-title">{{ project.name }}</h3>
        <p class="project-description">{{ project.description }}</p>
        <div class="stats-grid">
          <div class="stat-row">
            <Calendar :size="16" />
            <span>{{ formatDeadline(project.deadline) }}</span>
          </div>
          <div class="stat-row">
            <Coins :size="16" />
            <span>{{ project.reward }} pontos</span>
          </div>
          <div class="stat-row">
            <Award :size="16" />
            <span>{{ project.experience }} EXP</span>
          </div>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h4>📊 Progresso do Projeto</h4>
        <div class="progress-info">
          <p><strong>Horas Trabalhadas:</strong> {{ project.totalHoursWorked }}h</p>
          <p><strong>Horas Planejadas:</strong> {{ project.plannedHours }}h</p>
          <p><strong>Progresso:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
        </div>
        <div class="progress-bar-container">
          <div 
            class="progress-bar"
            :style="{ width: `${project.progressPercentage || 0}%`, backgroundColor: project.color }"
          ></div>
        </div>
        <p><strong>Status:</strong> {{ project.status }}</p>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'

const { formatDeadline } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null }
})
</script>
