<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project" class="tasks-summary">
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
            @click="openTask(task)"
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

        <p v-else class="empty">Nenhuma tarefa cadastrada ainda.</p>

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
        <!-- Botão Nova Tarefa abaixo da paginação -->
        <div v-if="editing && tasks.length > 0" class="new-task-btn-wrapper">
          <v-btn 
            color="primary" 
            size="small" 
            prepend-icon="mdi-plus"
            @click="createNewTask"
          >
            Nova Tarefa
          </v-btn>
        </div>
        
        <!-- Botão Nova Tarefa quando não há tarefas -->
        <div v-if="editing && tasks.length === 0" class="new-task-btn-wrapper">
          <v-btn 
            color="primary" 
            size="small" 
            prepend-icon="mdi-plus"
            @click="createNewTask"
          >
            Nova Tarefa
          </v-btn>
        </div>
        
        <p v-if="error" class="error-message">Erro ao carregar tarefas</p>

        <!-- Dialog de Detalhes/Edição da Task -->
        <v-dialog v-model="taskDialogOpen" max-width="700">
          <v-card class="task-dialog-card">
            <v-card-title class="task-dialog-header">
              <div class="header-content">
                <span class="header-icon">{{ isCreatingNewTask ? '➕' : (editing ? '✏️' : '📋') }}</span>
                <span class="header-title">{{ isCreatingNewTask ? 'Nova Tarefa' : (editing ? 'Editar Tarefa' : 'Detalhes da Tarefa') }}</span>
              </div>
              <v-btn icon="mdi-close" variant="text" size="small" @click="closeTask" />
            </v-card-title>
            <v-divider />
            <v-card-text class="task-dialog-body">
              <div v-if="selectedTask || isCreatingNewTask">
                <template v-if="editing || isCreatingNewTask">
                  <div class="form-section">
                    <v-text-field 
                      v-model="localTask.name" 
                      label="📝 Nome da tarefa" 
                      variant="outlined"
                      density="comfortable"
                      color="primary"
                    />
                    <v-textarea 
                      v-model="localTask.description" 
                      label="📄 Descrição" 
                      variant="outlined"
                      auto-grow 
                      rows="2" 
                      density="comfortable"
                      color="primary"
                    />
                  </div>
                  
                  <div class="form-section">
                    <h5 class="section-title">⏱️ Planejamento</h5>
                    <div class="dialog-grid">
                      <v-text-field 
                        v-model.number="localTask.pomodorosPlanned" 
                        type="number" 
                        label="🍅 Pomodoros" 
                        variant="outlined"
                        density="comfortable"
                        color="primary"
                      />
                      <v-text-field 
                        v-model="localTask.deadline" 
                        type="date" 
                        label="📅 Deadline" 
                        variant="outlined"
                        density="comfortable"
                        color="primary"
                      />
                    </div>
                  </div>

                  <div class="form-section">
                    <h5 class="section-title">🎯 Atributos</h5>
                    <div class="dialog-grid">
                      <v-text-field 
                        v-model.number="localTask.priority" 
                        type="number" 
                        label="⚡ Prioridade (1-4)" 
                        variant="outlined"
                        density="comfortable" 
                        :min="1" 
                        :max="4"
                        color="primary"
                      />
                      <v-text-field 
                        v-model.number="localTask.difficult" 
                        type="number" 
                        label="💪 Dificuldade (1-4)" 
                        variant="outlined"
                        density="comfortable" 
                        :min="1" 
                        :max="4"
                        color="primary"
                      />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="task-details-view">
                    <div class="detail-card main-info">
                      <h3 class="task-title-detail">{{ selectedTask.name }}</h3>
                      <p v-if="selectedTask.description" class="task-description">{{ selectedTask.description }}</p>
                      <div v-if="selectedTask.deadline" class="deadline-badge">
                        📅 {{ formatYMD(selectedTask.deadline) }}
                      </div>
                    </div>

                    <div class="detail-card stats-grid">
                      <div class="stat-item pomodoros">
                        <div class="stat-icon">🍅</div>
                        <div class="stat-content">
                          <div class="stat-label">Pomodoros</div>
                          <div class="stat-value">{{ selectedTask.pomodorosDid || 0 }}/{{ selectedTask.pomodorosPlanned }}</div>
                        </div>
                      </div>
                      
                      <div v-if="selectedTask.priority !== undefined" class="stat-item">
                        <div class="stat-icon">⚡</div>
                        <div class="stat-content">
                          <div class="stat-label">Prioridade</div>
                          <div class="stat-value">{{ selectedTask.priority }}</div>
                        </div>
                      </div>

                      <div v-if="selectedTask.difficult !== undefined" class="stat-item">
                        <div class="stat-icon">💪</div>
                        <div class="stat-content">
                          <div class="stat-label">Dificuldade</div>
                          <div class="stat-value">{{ selectedTask.difficult }}</div>
                        </div>
                      </div>

                      <div v-if="selectedTask.experience !== undefined" class="stat-item exp">
                        <div class="stat-icon">⭐</div>
                        <div class="stat-content">
                          <div class="stat-label">EXP</div>
                          <div class="stat-value">{{ selectedTask.experience }}</div>
                        </div>
                      </div>

                      <div v-if="selectedTask.prize !== undefined" class="stat-item reward">
                        <div class="stat-icon">💰</div>
                        <div class="stat-content">
                          <div class="stat-label">Reward</div>
                          <div class="stat-value">{{ selectedTask.prize }}</div>
                        </div>
                      </div>

                      <div class="stat-item status">
                        <div class="stat-icon">{{ selectedTask.isConcluded ? '✅' : '⏳' }}</div>
                        <div class="stat-content">
                          <div class="stat-label">Status</div>
                          <div class="stat-value">{{ selectedTask.isConcluded ? 'Concluída' : 'Pendente' }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
                <v-alert v-if="dialogError" type="error" density="compact" class="mt-3">
                  {{ dialogError }}
                </v-alert>
              </div>
            </v-card-text>
            <v-divider />
            <v-card-actions class="task-dialog-actions">
              <v-btn variant="text" @click="closeTask">Fechar</v-btn>
              <v-spacer />
              <v-btn v-if="editing && selectedTask && !isCreatingNewTask" color="error" variant="outlined" @click="deleteTask" :loading="saving" prepend-icon="mdi-delete">
                Excluir
              </v-btn>
              <v-btn v-if="(editing && selectedTask) || isCreatingNewTask" color="primary" variant="elevated" @click="saveTask" :loading="saving" prepend-icon="mdi-content-save">
                {{ isCreatingNewTask ? 'Criar' : 'Salvar' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import { useApi } from '~/composables/useApi'
import type { PropType } from 'vue'
import { reactive, watch, ref, computed } from 'vue'

const { formatYMD } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const tasks = ref<any[]>([])
const loading = ref(false)
const error = ref<null | any>(null)

// Paginação
const currentPage = ref(1)
const itemsPerPage = 4

const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return tasks.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(tasks.value.length / itemsPerPage)
})

// Dialog e edição de task
const taskDialogOpen = ref(false)
const selectedTask = ref<any | null>(null)
const localTask = reactive<any>({})
const saving = ref(false)
const dialogError = ref<string | null>(null)
const isCreatingNewTask = ref(false)

function createNewTask() {
  isCreatingNewTask.value = true
  selectedTask.value = null
  dialogError.value = null
  // Valores padrão para nova task
  Object.assign(localTask, {
    name: '',
    description: '',
    deadline: '',
    pomodorosPlanned: 1,
    pomodorosDid: 0,
    priority: 1,
    difficult: 1,
    isConcluded: false,
  })
  taskDialogOpen.value = true
}

function openTask(task: any) {
  isCreatingNewTask.value = false
  selectedTask.value = task
  dialogError.value = null
  // clonar campos que podemos editar
  Object.assign(localTask, {
    _id: task._id,
    name: task.name,
    description: task.description || '',
    deadline: task.deadline ? new Date(task.deadline).toISOString().substring(0, 10) : '',
    pomodorosPlanned: task.pomodorosPlanned ?? 0,
    pomodorosDid: task.pomodorosDid ?? 0,
    priority: task.priority ?? null,
    difficult: task.difficult ?? null,
    isConcluded: !!task.isConcluded,
  })
  taskDialogOpen.value = true
}

function closeTask() {
  taskDialogOpen.value = false
  selectedTask.value = null
  isCreatingNewTask.value = false
}

async function saveTask() {
  saving.value = true
  dialogError.value = null
  try {
    const payload: any = {
      name: localTask.name,
      description: localTask.description,
      deadline: localTask.deadline ? new Date(localTask.deadline) : new Date(),
      pomodorosPlanned: Number(localTask.pomodorosPlanned),
      pomodorosDid: Number(localTask.pomodorosDid),
      priority: localTask.priority !== null ? Number(localTask.priority) : null,
      difficult: localTask.difficult !== null ? Number(localTask.difficult) : null,
      isConcluded: !!localTask.isConcluded,
      late: false,
      recurrency: 'Daily',
      notification: null,
    }
    // experience e prize são calculados automaticamente no backend

    if (isCreatingNewTask.value) {
      // Criar nova task
      payload.project = getProjectId(props.project)
      if (!payload.project) {
        throw new Error('Project ID não encontrado')
      }
      
      const { post } = useApi('/tasks')
      const { data, error: e } = await post(payload)
      if (e) throw e
      
      // Adiciona à lista local
      tasks.value.unshift(data)
      // Volta para primeira página para ver a nova task
      currentPage.value = 1
    } else if (selectedTask.value) {
      // Atualizar task existente
      const { patch } = useApi(`/tasks/${selectedTask.value._id}`)
      const { data, error: e } = await patch(payload)
      if (e) throw e
      
      // Atualiza a lista local
      const idx = tasks.value.findIndex(t => t._id === selectedTask.value._id)
      if (idx >= 0) tasks.value[idx] = data
    }
    
    closeTask()
  } catch (err: any) {
    dialogError.value = isCreatingNewTask.value ? 'Falha ao criar a tarefa.' : 'Falha ao salvar a tarefa.'
    console.error(err)
  } finally {
    saving.value = false
  }
}

async function deleteTask() {
  if (!selectedTask.value) return
  saving.value = true
  dialogError.value = null
  try {
    const { remove } = useApi(`/tasks/${selectedTask.value._id}`)
    const { error: e } = await remove()
    if (e) throw e
    tasks.value = tasks.value.filter(t => t._id !== selectedTask.value._id)
    closeTask()
  } catch (err: any) {
    dialogError.value = 'Falha ao excluir a tarefa.'
    console.error(err)
  } finally {
    saving.value = false
  }
}

function getProjectId(p: any) {
  return p && (p._id || p.id || p.id === 0) ? (p._id || p.id) : null
}

async function fetchTasksForProject(p: any) {
  tasks.value = []
  error.value = null
  const id = getProjectId(p)
  if (!id) return
  loading.value = true
  try {
    const api = useApi(`/projects/${id}/tasks`)
    const { data, error: e } = await api.get()
    if (e) throw e
    tasks.value = data || []
  } catch (err) {
    error.value = err
    console.error('Error fetching tasks for project', err)
  } finally {
    loading.value = false
  }
}

// Sincroniza apenas os campos específicos desta página
watch(() => props.project, (v) => { 
  if (v) {
    local.shortTermGoal = v.shortTermGoal
    local.midTermGoal = v.midTermGoal
    local.longTermGoal = v.longTermGoal
    fetchTasksForProject(v)
  }
}, { immediate: true })

// Reseta paginação quando tasks mudam
watch(() => tasks.value.length, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value)
  }
})

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.shortTermGoal = props.project.shortTermGoal
    local.midTermGoal = props.project.midTermGoal
    local.longTermGoal = props.project.longTermGoal
  }
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
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

.subtitle {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: #64748b;
  font-style: italic;
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
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
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
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: clamp(0.65rem, 1.6vw, 0.75rem);
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

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.task-details .details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem 0.75rem;
  margin-top: 0.5rem;
}

/* Dialog Styles */
.task-dialog-card {
  border-radius: 12px !important;
  overflow: hidden;
}

.task-dialog-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  font-size: 1.5rem;
}

.header-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.task-dialog-body {
  padding: 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 1.5rem;
}

.form-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
  margin: 0 0 0.75rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e2e8f0;
}

/* View Mode Styles */
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

.task-dialog-actions {
  padding: 1rem 1.5rem;
  background: #f8fafc;
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

.pagination-controls .v-btn {
  opacity: 1 !important;
  visibility: visible !important;
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
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}
</style>

