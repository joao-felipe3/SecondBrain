<template>
  <div class="task-details-view">
    <div class="detail-card main-info">
      <h3 class="task-title-detail">{{ task.name }}</h3>
      <p v-if="task.description" class="task-description">{{ task.description }}</p>
      <div v-if="task.deadline" class="deadline-badge">
        📅 {{ formatYMD(task.deadline) }}
      </div>
    </div>

    <div class="detail-card stats-grid">
      <div class="stat-item pomodoros">
        <div class="stat-icon">🍅</div>
        <div class="stat-content">
          <div class="stat-label">Pomodoros</div>
          <div class="stat-value">{{ task.pomodorosDid || 0 }}/{{ task.pomodorosPlanned }}</div>
        </div>
      </div>
      
      <div v-if="task.priority !== undefined" class="stat-item">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
          <div class="stat-label">Prioridade</div>
          <div class="stat-value">{{ task.priority }}</div>
        </div>
      </div>

      <div v-if="task.difficult !== undefined" class="stat-item">
        <div class="stat-icon">💪</div>
        <div class="stat-content">
          <div class="stat-label">Dificuldade</div>
          <div class="stat-value">{{ task.difficult }}</div>
        </div>
      </div>

      <div v-if="task.experience !== undefined" class="stat-item exp">
        <div class="stat-icon">⭐</div>
        <div class="stat-content">
          <div class="stat-label">EXP</div>
          <div class="stat-value">{{ task.experience }}</div>
        </div>
      </div>

      <div v-if="task.prize !== undefined" class="stat-item reward">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <div class="stat-label">Reward</div>
          <div class="stat-value">{{ task.prize }}</div>
        </div>
      </div>

      <div class="stat-item status">
        <div class="stat-icon">{{ task.isConcluded ? '✅' : '⏳' }}</div>
        <div class="stat-content">
          <div class="stat-label">Status</div>
          <div class="stat-value">{{ task.isConcluded ? 'Concluída' : 'Pendente' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/utils/useDateFormat'

interface Task {
  _id?: string
  name: string
  description?: string
  deadline?: string
  pomodorosPlanned?: number
  pomodorosDid?: number
  priority?: number
  difficult?: number
  experience?: number
  prize?: number
  isConcluded: boolean
}

defineProps<{
  task: Task
}>()

const { formatYMD } = useDateFormat()
</script>

<style scoped>
.task-details-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}

.main-info {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  border: 1px solid #667eea30;
}

.task-title-detail {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem 0;
}

.task-description {
  color: #475569;
  margin: 0 0 0.75rem 0;
  line-height: 1.6;
}

.deadline-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  padding: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.stat-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.stat-item.pomodoros {
  border-left: 3px solid #ef4444;
}

.stat-item.exp {
  border-left: 3px solid #f59e0b;
}

.stat-item.reward {
  border-left: 3px solid #10b981;
}

.stat-item.status {
  border-left: 3px solid #3b82f6;
}

.stat-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-bottom: 0.125rem;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
}
</style>
