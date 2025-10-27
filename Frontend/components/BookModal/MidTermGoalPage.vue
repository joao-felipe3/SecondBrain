<template>
  <div class="page-container" :class="{ editing }">
    <!-- Página Esquerda: Backlog de Ideias -->
    <div class="page left-page">
      <div v-if="project" class="backlog-section">
        <h4>💡 Backlog de Ideias</h4>
        <p class="subtitle">Possíveis melhorias e funcionalidades</p>

        <div class="backlog-form">
          <v-textarea
            v-model="newIdea.text"
            label="Nova ideia ou melhoria"
            variant="solo-filled"
            density="comfortable"
            auto-grow
            rows="2"
            placeholder="Descreva uma ideia ou melhoria para o projeto..."
          />
          <div class="actions">
            <v-btn 
              color="primary" 
              size="small"
              @click="addIdea" 
              :disabled="!newIdea.text.trim()"
            >
              Adicionar
            </v-btn>
          </div>
        </div>

        <div class="backlog-list" v-if="ideas.length">
          <div 
            v-for="(idea, i) in ideas" 
            :key="i" 
            class="backlog-item"
          >
            <div class="item-header">
              <span class="item-number">#{{ i + 1 }}</span>
              <v-btn 
                icon 
                size="x-small" 
                variant="text"
                @click="removeIdea(i)"
              >
                <span class="delete-icon">×</span>
              </v-btn>
            </div>
            <p class="item-text">{{ idea.text }}</p>
            <span class="item-date">{{ formatYMD(idea.createdAt) }}</span>
          </div>
        </div>
        <p v-else class="empty">Nenhuma ideia ainda. Adicione a primeira acima.</p>
      </div>
    </div>

    <!-- Página Direita: Progresso do Projeto -->
    <div class="page right-page">
      <div v-if="project" class="progress-section">
        <h4>📊 Progresso do Projeto</h4>
        <p class="subtitle">Acompanhamento de tarefas e métricas</p>

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

        <div class="progress-bar-container">
          <div class="progress-bar-label">
            <span>Progresso Geral</span>
            <span class="progress-percentage">{{ completionRate }}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: completionRate + '%' }"></div>
          </div>
        </div>

        <div class="tasks-summary">
          <h5>Tarefas Recentes</h5>
          <div class="task-list" v-if="projectTasks.length">
            <div 
              v-for="task in recentTasks" 
              :key="task._id || task.id"
              class="task-item"
              :class="{ completed: task.isConcluded }"
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
                </div>
              </div>
            </div>
          </div>
          <p v-else class="empty">Nenhuma tarefa cadastrada ainda.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, ref, watch, computed } from 'vue'
import useDateFormat from '~/composables/useDateFormat'
import { useApiResource } from '~/composables/useApi'

type Project = Record<string, any>

interface BacklogIdea {
  text: string
  createdAt: string
}

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

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const { formatYMD } = useDateFormat()
const tasksApi = useApiResource('/tasks')

// Backlog de Ideias - Página Esquerda
const ideas = ref<BacklogIdea[]>([])
const newIdea = reactive({ text: '' })

// Tarefas do projeto - Página Direita
const projectTasks = ref<Task[]>([])

// Computed properties para estatísticas
const completedTasks = computed(() => 
  projectTasks.value.filter(t => t.isConcluded).length
)

const pendingTasks = computed(() => 
  projectTasks.value.filter(t => !t.isConcluded).length
)

const completionRate = computed(() => {
  if (projectTasks.value.length === 0) return 0
  return Math.round((completedTasks.value / projectTasks.value.length) * 100)
})

const recentTasks = computed(() => {
  // Retorna as 5 tarefas mais recentes (por deadline ou ordem)
  return [...projectTasks.value]
    .sort((a, b) => {
      if (!a.deadline || !b.deadline) return 0
      return new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
    })
    .slice(0, 5)
})

// Funções para Ideias (página esquerda)
function addIdea() {
  if (!newIdea.text.trim()) return
  
  ideas.value.unshift({
    text: newIdea.text.trim(),
    createdAt: new Date().toISOString()
  })
  
  newIdea.text = ''
  persistBacklog()
}

function removeIdea(index: number) {
  ideas.value.splice(index, 1)
  persistBacklog()
}

// Persiste o backlog no projeto
function persistBacklog() {
  emit('update-field', 'backlogIdeas', ideas.value)
}

// Carrega tarefas do projeto
async function loadProjectTasks() {
  const projectId = (props.project as any)?._id || (props.project as any)?.id
  if (!projectId) return
  
  try {
    const { data } = await tasksApi.list()
    if (data && Array.isArray(data)) {
      // Filtra apenas as tarefas deste projeto
      projectTasks.value = data.filter((task: any) => task.project === projectId)
    }
  } catch (error) {
    console.error('Erro ao carregar tarefas:', error)
  }
}

// Carrega dados do projeto
watch(() => props.project, (v) => {
  if (v) {
    // Carrega ideias da página esquerda
    if ((v as any).backlogIdeas && Array.isArray((v as any).backlogIdeas)) {
      ideas.value = [...(v as any).backlogIdeas]
    }
    
    // Carrega tarefas do projeto
    loadProjectTasks()
  }
}, { immediate: true })
</script>

<style scoped>
.backlog-section, .progress-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.backlog-section h4, .progress-section h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.subtitle {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: #64748b;
  font-style: italic;
}

/* Backlog Styles */
.backlog-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
}

.backlog-form .actions {
  display: flex;
  justify-content: flex-end;
}

.backlog-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.25rem;
}

.backlog-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.backlog-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.item-number {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.delete-icon {
  font-size: 1.5rem;
  line-height: 1;
  color: #ef4444;
}

.item-text {
  margin: 0 0 0.5rem 0;
  color: #334155;
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
}

.item-date {
  font-size: 0.75rem;
  color: #94a3b8;
}

/* Progress Styles */
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

.progress-bar-container {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
}

.progress-bar-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #475569;
  font-weight: 600;
}

.progress-percentage {
  color: #2563eb;
  font-weight: 700;
}

.progress-bar-track {
  height: 12px;
  background: #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
  transition: width 0.3s ease;
}

.tasks-summary h5 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: #1e293b;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  transition: all 0.2s;
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
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
}

.status-icon.completed {
  background: #dcfce7;
  color: #16a34a;
}

.status-icon.pending {
  background: #fef3c7;
  color: #ca8a04;
  font-size: 1.25rem;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 0.9rem;
  color: #1e293b;
  font-weight: 500;
  margin-bottom: 0.25rem;
  word-break: break-word;
}

.task-item.completed .task-name {
  text-decoration: line-through;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}

.task-deadline, .task-pomodoros {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}
</style>
