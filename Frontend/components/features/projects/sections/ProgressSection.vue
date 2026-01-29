<template>
  <div class="progress-section">
    <h4 class="mb-4">📊 Progresso do Projeto</h4>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-value">{{ completedTasks }}</div>
        <div class="stat-label">Concluídas</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-value">{{ pendingTasks }}</div>
        <div class="stat-label">Pendentes</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-value">{{ completionRate }}%</div>
        <div class="stat-label">Completo</div>
      </div>
    </div>

    <div class="activity-section">
      <div class="activity-header">
        <h5>📅 Atividade</h5>
        <div class="period-selector">
          <button 
            v-for="p in periods" 
            :key="p.value"
            @click="selectedPeriod = p.value"
            :class="{ active: selectedPeriod === p.value }"
            class="period-btn"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <ActivityGraph 
        :tasks="tasks" 
        :period="selectedPeriod" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ActivityGraph from './ActivityGraph.vue'

interface Task {
  _id?: string
  id?: string
  name: string
  description?: string
  deadline?: Date
  pomodorosPlanned?: number
  pomodorosDid?: number
  isConcluded: boolean
}

const props = defineProps<{
  tasks: Task[]
}>()

const selectedPeriod = ref<'week' | 'month' | 'year'>('month')

const periods = [
  { label: 'Semana', value: 'week' as const },
  { label: 'Mês', value: 'month' as const },
  { label: 'Ano', value: 'year' as const }
]

const completedTasks = computed(() => 
  props.tasks.filter(t => t.isConcluded).length
)

const pendingTasks = computed(() => 
  props.tasks.filter(t => !t.isConcluded).length
)

const completionRate = computed(() => {
  if (props.tasks.length === 0) return 0
  return Math.round((completedTasks.value / props.tasks.length) * 100)
})
</script>

<style scoped>
.progress-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.progress-section h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
}

.stat-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
}

.activity-section {
  border-top: 2px solid #e2e8f0;
  padding-top: 1rem;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.activity-header h5 {
  margin: 0;
  font-size: 1rem;
  color: #1e293b;
}

.period-selector {
  display: flex;
  gap: 0.25rem;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 0.125rem;
}

.period-btn {
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  color: #64748b;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.period-btn:hover {
  color: #334155;
}

.period-btn.active {
  background: white;
  color: #1e293b;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
</style>
