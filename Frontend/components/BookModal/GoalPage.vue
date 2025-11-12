<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project" class="planning-assistant">
        <div class="assistant-header">
          <h4>🧠 Planning Assistance</h4>
        </div>

        <!-- Estado Inicial: Prompt para o usuário -->
        <div v-if="!aiLoading && !aiSuggestions.length" class="initial-state">
          <v-textarea
            v-model="aiPrompt"
            label="Adicionar detalhes ou refinar o pedido"
            placeholder="Ex: Quero focar em tarefas de pesquisa primeiro, com prazo de 2 semanas..."
            variant="outlined"
            rows="4"
            auto-grow
            density="comfortable"
            color="primary"
          />
          <v-btn
            color="primary"
            size="large"
            block
            prepend-icon="mdi-creation"
            @click="generateAISuggestions"
            :disabled="!project.shortTermGoal && !project.midTermGoal && !project.longTermGoal"
          >
            Gerar Tarefas
          </v-btn>
          <p v-if="!project.shortTermGoal && !project.midTermGoal && !project.longTermGoal" class="warning-message">
            ⚠️ Defina objetivos para gerar sugestões
          </p>
        </div>

        <!-- Estado de Carregamento -->
        <div v-if="aiLoading" class="loading-state">
          <v-progress-circular
            indeterminate
            size="64"
            width="4"
            color="primary"
          />
          <p class="loading-message">Analisando seus objetivos e criando um plano...</p>
        </div>

        <!-- Estado com Sugestões -->
        <div v-if="!aiLoading && aiSuggestions.length" class="suggestions-state">
          <div class="suggestions-preview">
            <div class="preview-header">
              <div class="preview-info">
                <p class="preview-subtitle">{{ aiSuggestions.length }} tarefas prontas para revisão</p>
              </div>
            </div>

            <div class="preview-header-actions">
              <v-btn
                size="small"
                color="primary"
                variant="outlined"
                @click="resetSuggestions"
              >
                <v-icon size="18">mdi-refresh</v-icon>
                Nova Sugestão
              </v-btn>
            </div>

            <div class="preview-list">
              <table class="preview-table" role="table">
                <tbody>
                  <tr
                    v-for="(suggestion, index) in aiSuggestions"
                    :key="index"
                    :class="{ selected: suggestion.selected }"
                    class="preview-row"
                    @click="onSuggestionRowClick(suggestion, index, $event)"
                  >
                    <td class="preview-checkbox-cell">
                      <v-checkbox
                        v-model="suggestion.selected"
                        hide-details
                        density="compact"
                        color="primary"
                      />
                    </td>
                    <td class="preview-name-cell">{{ suggestion.name }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="suggestions-actions">
            <v-btn
              color="error"
              variant="outlined"
              prepend-icon="mdi-close"
              @click="discardSuggestions"
            >
              Descartar Sugestões
            </v-btn>
            <v-btn
              color="success"
              variant="elevated"
              prepend-icon="mdi-check"
              @click="addSuggestionsToProject"
              :disabled="selectedSuggestions.length === 0"
              :loading="addingSuggestions"
            >
              Adicionar {{ selectedSuggestions.length }} Tarefa(s)
            </v-btn>
          </div>

          <v-alert v-if="aiError" type="error" density="compact" class="mt-3">
            {{ aiError }}
          </v-alert>
        </div>

        <!-- Dialog do Carrossel -->
        <v-dialog v-model="carouselDialogOpen" max-width="900" persistent>
          <v-card class="carousel-dialog-card">
            <v-card-title class="carousel-dialog-header">
              <div class="header-content">
                <span class="header-icon">🎯</span>
                <div class="header-text">
                  <span class="header-title">Revisar Sugestões</span>
                  <span class="header-subtitle">{{ selectedSuggestions.length }} de {{ aiSuggestions.length }} selecionadas</span>
                </div>
              </div>
              <v-btn icon="mdi-close" variant="text" size="small" @click="carouselDialogOpen = false" />
            </v-card-title>

            <v-card-text class="carousel-dialog-body">
              <div class="carousel-container">
                <button 
                  class="carousel-nav prev" 
                  @click="prevCard"
                  :disabled="carouselIndex === 0"
                >
                  ◀
                </button>
                
                <div class="carousel-wrapper">
                  <div class="carousel-track" :style="{ transform: `translateX(-${carouselIndex * 100}%)` }">
                    <div
                      v-for="(suggestion, index) in aiSuggestions"
                      :key="index"
                      class="suggestion-card"
                      :class="{ selected: suggestion.selected }"
                    >
                      <div class="card-header">
                        <v-checkbox
                          v-model="suggestion.selected"
                          hide-details
                          density="comfortable"
                          color="primary"
                          class="card-checkbox"
                          label="Adicionar esta tarefa"
                        />
                        <div class="card-number">{{ index + 1 }}/{{ aiSuggestions.length }}</div>
                      </div>
                      
                      <div class="card-body">
                        <v-text-field
                          v-model="suggestion.name"
                          label="📝 Nome da Tarefa"
                          variant="outlined"
                          density="comfortable"
                          hide-details
                          class="card-name-field"
                        />
                        
                        <div class="card-date">
                          <span class="date-label">📅 Prazo:</span>
                          <v-text-field
                            v-model="suggestion.deadline"
                            type="date"
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="card-date-field"
                          />
                        </div>
                        
                        <div class="card-attributes">
                          <div class="attribute-item pomodoros">
                            <div class="attribute-icon">🍅</div>
                            <div class="attribute-content">
                              <div class="attribute-label">Pomodoros</div>
                              <div class="attribute-value">{{ suggestion.pomodoros || 1 }}</div>
                            </div>
                          </div>
                          
                          <div class="attribute-item priority">
                            <div class="attribute-icon">⚡</div>
                            <div class="attribute-content">
                              <div class="attribute-label">Prioridade</div>
                              <div class="attribute-value">{{ suggestion.priority || 1 }}</div>
                            </div>
                          </div>
                          
                          <div class="attribute-item difficulty">
                            <div class="attribute-icon">💪</div>
                            <div class="attribute-content">
                              <div class="attribute-label">Dificuldade</div>
                              <div class="attribute-value">{{ suggestion.difficulty || 1 }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button 
                  class="carousel-nav next" 
                  @click="nextCard"
                  :disabled="carouselIndex === aiSuggestions.length - 1"
                >
                  ▶
                </button>
              </div>
            </v-card-text>

            <v-card-actions class="carousel-dialog-actions">
              <v-btn variant="text" @click="carouselDialogOpen = false">
                Fechar
              </v-btn>
              <v-spacer />
              <div class="quick-actions">
                <v-btn
                  size="small"
                  variant="outlined"
                  @click="selectAll"
                >
                  Selecionar Todas
                </v-btn>
                <v-btn
                  size="small"
                  variant="outlined"
                  @click="deselectAll"
                >
                  Desmarcar Todas
                </v-btn>
              </div>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
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

// AI Planning Assistant
const aiPrompt = ref('')
const aiLoading = ref(false)
const aiSuggestions = ref<any[]>([])
const aiError = ref<string | null>(null)
const addingSuggestions = ref(false)
const carouselIndex = ref(0)
const carouselDialogOpen = ref(false)

const selectedSuggestions = computed(() => {
  return aiSuggestions.value.filter(s => s.selected)
})

function nextCard() {
  if (carouselIndex.value < aiSuggestions.value.length - 1) {
    carouselIndex.value++
  }
}

function prevCard() {
  if (carouselIndex.value > 0) {
    carouselIndex.value--
  }
}

function selectAll() {
  aiSuggestions.value.forEach(s => s.selected = true)
}

function deselectAll() {
  aiSuggestions.value.forEach(s => s.selected = false)
}

async function generateAISuggestions() {
  aiLoading.value = true
  aiError.value = null
  
  try {
    // Call the backend API to generate AI suggestions
    const { post } = useApi('/tasks/ai-suggestions')
    const { data, error: e } = await post({
      projectName: props.project?.name || 'Projeto',
      projectId: props.project?._id || props.project?.id, // Envia o ID do projeto
      shortTermGoal: props.project?.shortTermGoal || '',
      midTermGoal: props.project?.midTermGoal || '',
      longTermGoal: props.project?.longTermGoal || '',
      userPrompt: aiPrompt.value || '',
      targetHours: 50, // Envia as horas planejadas do projeto
    })
    
    if (e) throw e
    
    // Map the API response to the expected format
    aiSuggestions.value = data.map((suggestion: any) => ({
      name: suggestion.name,
      deadline: suggestion.deadline,
      pomodoros: suggestion.pomodoros,
      priority: suggestion.priority,
      difficulty: suggestion.difficulty,
      selected: suggestion.selected,
    }))
  } catch (err: any) {
    aiError.value = 'Falha ao gerar sugestões. Tente novamente.'
    console.error(err)
  } finally {
    aiLoading.value = false
  }
}

function resetSuggestions() {
  aiSuggestions.value = []
  aiPrompt.value = ''
  aiError.value = null
  carouselIndex.value = 0
}

function discardSuggestions() {
  resetSuggestions()
}

function onSuggestionRowClick(suggestion: any, index: number, e: MouseEvent) {
  const target = e.target as HTMLElement
  // If the click happened inside the checkbox cell, let the checkbox handle it
  if (target && typeof target.closest === 'function' && target.closest('.preview-checkbox-cell')) {
    return
  }

  // Open the carousel dialog at the clicked suggestion
  carouselIndex.value = index
  carouselDialogOpen.value = true
}

async function addSuggestionsToProject() {
  if (selectedSuggestions.value.length === 0) return
  
  addingSuggestions.value = true
  aiError.value = null
  
  try {
    const projectId = getProjectId(props.project)
    if (!projectId) throw new Error('Project ID não encontrado')
    
    const { post } = useApi('/tasks')
    
    // Criar cada tarefa selecionada
    for (const suggestion of selectedSuggestions.value) {
      const payload = {
        project: projectId,
        name: suggestion.name,
        description: aiPrompt.value || '',
        deadline: new Date(suggestion.deadline),
        pomodorosPlanned: suggestion.pomodoros || 1,
        pomodorosDid: 0,
        priority: suggestion.priority || 1,
        difficult: suggestion.difficulty || 1,
        isConcluded: false,
        late: false,
        recurrency: 'Daily',
        notification: null,
      }
      
      const { data, error: e } = await post(payload)
      if (e) throw e
      
      // Adiciona à lista de tarefas
      tasks.value.unshift(data)
    }
    
    // Volta para primeira página e limpa sugestões
    currentPage.value = 1
    resetSuggestions()
  } catch (err: any) {
    aiError.value = 'Falha ao adicionar tarefas. Tente novamente.'
    console.error(err)
  } finally {
    addingSuggestions.value = false
  }
}

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

/* Planning Assistant Styles */
.planning-assistant {
  height: 100%;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0rem;
  overflow: hidden;
  box-sizing: border-box;
}


.assistant-header {
  margin-bottom: 0rem;
}

.assistant-header h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.initial-state {
  padding: 0;
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.warning-message {
  text-align: center;
  color: #f59e0b;
  font-size: 0.875rem;
  margin: 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 3rem 0;
}

.loading-message {
  font-size: 1rem;
  color: #64748b;
  text-align: center;
  font-style: italic;
  margin: 0;
}

.suggestions-state {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

/* Preview Styles */
.suggestions-preview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}

.preview-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid #e2e8f0;
}

.preview-header-actions {
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-header-actions :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

/* Make button labels slightly smaller and allow wrapping so long labels don't force wide buttons */
.preview-header-actions :deep(.v-btn__content),
.suggestions-actions :deep(.v-btn__content),
.suggestions-actions .v-btn,
.preview-header-actions .v-btn {
  font-size: 0.75rem; /* slightly smaller */
  white-space: normal !important; /* allow wrapping */
  overflow-wrap: anywhere;
  word-wrap: break-word;
  text-align: center;
}

.preview-info {
  flex: 1;
}

.preview-title {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
}

.preview-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: #64748b;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
}

.preview-row {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
}

.preview-row.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.preview-row td {
  padding: 0.5rem 0.75rem;
  vertical-align: middle;
}

.preview-checkbox-cell {
  width: 48px;
  padding-left: 0.5rem;
}

.preview-name-cell {
  /* allow long task names to wrap onto multiple lines instead of truncating */
  overflow-wrap: anywhere; /* modern */
  word-wrap: break-word;  /* fallback */
  white-space: normal;
  color: #334155;
  font-weight: 500;
  font-size: 0.78rem; /* slightly smaller so long names fit without expanding width */
  line-height: 1.2;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.625rem;
  transition: all 0.2s;
}

.preview-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.preview-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.preview-name {
  flex: 1;
  font-size: 0.875rem;
  color: #334155;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-badges {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.mini-badge {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  color: #64748b;
}

.preview-actions {
  padding-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

/* Carousel Dialog Styles */
.carousel-dialog-card {
  border-radius: 16px !important;
  overflow: hidden;
}

.carousel-dialog-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  font-size: 2rem;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.header-subtitle {
  font-size: 0.875rem;
  opacity: 0.9;
}

.carousel-dialog-body {
  padding: 2rem;
  min-height: 500px;
}

.carousel-dialog-actions {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
}

/* Carousel Styles */
.carousel-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 100%;
  min-height: 400px;
}

.carousel-nav {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #e2e8f0;
  background: white;
  color: #64748b;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.carousel-nav:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #3b82f6;
  color: #3b82f6;
  transform: scale(1.1);
}

.carousel-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.carousel-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.carousel-track {
  display: flex;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;
}

.suggestion-card {
  flex: 0 0 100%;
  width: 100%;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-sizing: border-box;
  min-height: 350px;
}

.suggestion-card.selected {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #3b82f6;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid #e2e8f0;
}

.card-checkbox {
  flex-shrink: 0;
}

.card-number {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
  background: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.suggestion-card.selected .card-number {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.card-name-field {
  font-size: 1rem;
  font-weight: 500;
}

.card-date {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.date-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #334155;
  flex-shrink: 0;
}

.card-date-field {
  flex: 1;
}

.card-attributes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.attribute-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.attribute-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

.attribute-item.pomodoros {
  border-color: #fecaca;
}

.attribute-item.priority {
  border-color: #fed7aa;
}

.attribute-item.difficulty {
  border-color: #ddd6fe;
}

.suggestion-card.selected .attribute-item {
  border-color: #93c5fd;
}

.attribute-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.attribute-content {
  flex: 1;
  min-width: 0;
}

.attribute-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-bottom: 0.125rem;
}

.attribute-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
}

.suggestions-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

.suggestions-actions .v-btn {
  flex: 1;
}
</style>

