<template>
  <div class="tasks-summary">
    <div class="tasks-header">
      <h4>📋 Tarefas do Projeto</h4>
    </div>

    <div v-if="loading" class="loading-message">Carregando tarefas...</div>
    
    <div v-if="tasks.length > 0" class="task-list">
      <div 
        v-for="task in paginatedTasks" 
        :key="task._id"
        class="task-item"
        :class="{ completed: task.isConcluded }"
        @click="emit('open-task', task)"
      >
        <div class="task-status">
          <span v-if="task.isConcluded" class="status-icon completed">✓</span>
          <span v-else class="status-icon pending">○</span>
        </div>
        <div class="task-info">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">
            <span v-if="task.deadline" class="task-deadline">
              {{ formatYMD(task.deadline) }}
            </span>
            <span v-if="task.pomodorosPlanned" class="task-pomodoros">
              🍅 {{ task.pomodorosDid || 0 }}/{{ task.pomodorosPlanned }}
            </span>
            <span v-if="task.experience !== undefined" class="task-exp">
              ⭐ EXP {{ task.experience }}
            </span>
            <span v-if="task.prize !== undefined" class="task-reward">
              💰 {{ task.prize }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="empty">Nenhuma tarefa cadastrada ainda.</p>

    <!-- Paginação -->
    <div v-if="tasks.length > 0 && totalPages > 1" class="pagination-controls">
      <v-btn 
        size="small" 
        variant="text"
        :disabled="currentPage === 1"
        @click="currentPage--"
      >
        ◀
      </v-btn>
      <span class="pagination-info">{{ currentPage }} / {{ totalPages }}</span>
      <v-btn 
        size="small" 
        variant="text"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
      >
        ▶
      </v-btn>
    </div>

    <!-- Botão Nova Tarefa -->
    <div v-if="editing" class="new-task-btn-wrapper">
      <v-btn 
        color="primary" 
        size="small" 
        prepend-icon="mdi-plus"
        @click="emit('create-task')"
      >
        Nova Tarefa
      </v-btn>
    </div>
    
    <p v-if="error" class="error-message">Erro ao carregar tarefas</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import useDateFormat from '~/composables/utils/useDateFormat'

interface Task {
  _id: string
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

const props = defineProps<{
  tasks: Task[]
  loading: boolean
  error: any
  editing: boolean
}>()

const emit = defineEmits<{
  (e: 'open-task', task: Task): void
  (e: 'create-task'): void
}>()

const { formatYMD } = useDateFormat()

const currentPage = ref(1)
const itemsPerPage = 3

const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return props.tasks.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(props.tasks.length / itemsPerPage)
})

// Reset pagination when tasks change
watch(() => props.tasks.length, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value)
  }
})
</script>

<style scoped>
.tasks-summary {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.tasks-summary h4 {
  margin: 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.loading-message {
  text-align: center;
  color: #64748b;
  padding: 2rem 0;
  font-style: italic;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.5rem;
  transition: all 0.2s;
  cursor: pointer;
}

.task-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.task-item.completed {
  opacity: 0.7;
}

.task-status {
  flex-shrink: 0;
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
}

.status-icon.completed {
  background: #dcfce7;
  color: #16a34a;
}

.status-icon.pending {
  background: #fef3c7;
  color: #ca8a04;
  font-size: 1rem;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 0.8rem;
  color: #1e293b;
  font-weight: 500;
  margin-bottom: 0.2rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.task-item.completed .task-name {
  text-decoration: line-through;
}

.task-meta {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  font-size: clamp(0.6rem, 1.4vw, 0.7rem);
  color: #64748b;
}

.task-deadline, .task-pomodoros, .task-exp, .task-reward {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}

.error-message {
  color: #ef4444;
  text-align: center;
  margin-top: 1rem;
  font-size: 0.875rem;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 0;
  margin-top: 0.5rem;
  border-top: 1px solid #e2e8f0;
}

.pagination-info {
  font-size: 0.875rem;
  color: #64748b;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
}

.new-task-btn-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
  border-top: 1px solid #e2e8f0;
}
</style>
