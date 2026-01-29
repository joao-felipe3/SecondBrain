<template>
  <div class="planning-assistant">
    <div class="assistant-header">
      <h4>🧠 Planning Assistance</h4>
    </div>

    <!-- Estado Inicial: Prompt para o usuário -->
    <div v-if="!loading && !suggestions.length" class="initial-state">
      <v-textarea
        v-model="prompt"
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
        @click="generateSuggestions"
        :disabled="!hasGoals"
      >
        Gerar Tarefas
      </v-btn>
      <p v-if="!hasGoals" class="warning-message">
        ⚠️ Defina objetivos para gerar sugestões
      </p>
    </div>

    <!-- Estado de Carregamento com Progresso -->
    <div v-if="loading" class="loading-state">
      <v-progress-circular
        v-if="!progress"
        indeterminate
        size="64"
        width="4"
        color="primary"
      />
      
      <!-- Progresso detalhado quando disponível -->
      <div v-else class="progress-details">
        <v-progress-circular
          :model-value="progressPercent"
          :size="80"
          :width="6"
          color="primary"
        >
          <span class="progress-percent">{{ progressPercent }}%</span>
        </v-progress-circular>
        
        <div class="progress-info">
          <p class="progress-title">{{ progressMessage }}</p>
          <div class="progress-stats">
            <span class="stat">
              <strong>{{ progress.tasksGenerated }}</strong> tarefas
            </span>
            <span class="stat-divider">•</span>
            <span class="stat">
              <strong>{{ progress.currentHours.toFixed(1) }}</strong>h de <strong>{{ progress.targetHours }}</strong>h
            </span>
            <span class="stat-divider">•</span>
            <span class="stat">
              Iteração <strong>{{ progress.currentIteration }}</strong>/{{ progress.maxIterations }}
            </span>
          </div>
          <v-progress-linear
            :model-value="progressPercent"
            color="primary"
            height="8"
            rounded
            class="mt-3"
          />
        </div>
      </div>
      
      <p v-if="!progress" class="loading-message">Analisando seus objetivos e criando um plano...</p>
    </div>

    <!-- Estado com Sugestões -->
    <SuggestionsList
      v-if="!loading && suggestions.length"
      :suggestions="suggestions"
      :adding="adding"
      :error="error"
      @reset="resetSuggestions"
      @discard="discardSuggestions"
      @add="addSuggestions"
      @open-carousel="openCarousel"
    />

    <!-- Dialog do Carrossel -->
    <SuggestionsCarouselDialog
      v-model="carouselOpen"
      :suggestions="suggestions"
      :initial-index="carouselIndex"
      @select-all="selectAll"
      @deselect-all="deselectAll"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useApi } from '~/composables/api/useApi'
import { SuggestionsList, SuggestionsCarouselDialog } from '../tasks'

interface Suggestion {
  name: string
  deadline: string
  pomodoros: number
  priority: number
  difficulty: number
  selected: boolean
}

interface Progress {
  currentIteration: number
  maxIterations: number
  currentHours: number
  targetHours: number
  tasksGenerated: number
  status: 'loading' | 'success' | 'error' | 'partial'
  message: string
}

const props = defineProps<{
  project: Record<string, any> | null
}>()

const emit = defineEmits<{
  (e: 'tasks-added', tasks: any[]): void
}>()

// State
const prompt = ref('')
const loading = ref(false)
const suggestions = ref<Suggestion[]>([])
const error = ref<string | null>(null)
const adding = ref(false)
const carouselOpen = ref(false)
const carouselIndex = ref(0)
const progress = ref<Progress | null>(null)

const hasGoals = computed(() => {
  return props.project?.shortTermGoal || props.project?.midTermGoal || props.project?.longTermGoal
})

const selectedSuggestions = computed(() => {
  return suggestions.value.filter(s => s.selected)
})

const progressPercent = computed(() => {
  if (!progress.value || progress.value.targetHours <= 0) return 0
  return Math.min(100, Math.round((progress.value.currentHours / progress.value.targetHours) * 100))
})

const progressMessage = computed(() => {
  if (!progress.value) return 'Iniciando...'
  const { status, currentIteration, tasksGenerated } = progress.value
  
  if (status === 'loading') {
    if (currentIteration === 0) return 'Analisando objetivos do projeto...'
    if (currentIteration === 1) return 'Gerando primeiras tarefas...'
    return `Gerando mais tarefas (${tasksGenerated} criadas)...`
  }
  if (status === 'success') return progress.value.message
  if (status === 'partial') return `⚠️ ${progress.value.message}`
  if (status === 'error') return `❌ ${progress.value.message}`
  return 'Processando...'
})

function selectAll() {
  suggestions.value.forEach(s => s.selected = true)
}

function deselectAll() {
  suggestions.value.forEach(s => s.selected = false)
}

async function generateSuggestions() {
  loading.value = true
  error.value = null
  progress.value = null
  
  // Inicializa progresso
  progress.value = {
    currentIteration: 0,
    maxIterations: 15,
    currentHours: 0,
    targetHours: 50,
    tasksGenerated: 0,
    status: 'loading',
    message: 'Iniciando geração...'
  }
  
  try {
    // Usa a configuração do Nuxt para obter a base URL da API
    const baseURL = 'http://localhost:3000' // Porta do backend NestJS
    
    const payload = {
      projectName: props.project?.name || 'Projeto',
      projectId: props.project?._id || props.project?.id,
      shortTermGoal: props.project?.shortTermGoal || '',
      midTermGoal: props.project?.midTermGoal || '',
      longTermGoal: props.project?.longTermGoal || '',
      userPrompt: prompt.value || '',
      targetHours: 50,
    }
    
    // Conecta ao endpoint SSE para receber progresso em tempo real
    const eventSource = new EventSource(
      `${baseURL}/tasks/ai-suggestions-stream?` + new URLSearchParams({
        projectName: payload.projectName,
        projectId: payload.projectId,
        shortTermGoal: payload.shortTermGoal,
        midTermGoal: payload.midTermGoal,
        longTermGoal: payload.longTermGoal,
        userPrompt: payload.userPrompt,
        targetHours: String(payload.targetHours),
      })
    )
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Se é progresso, atualiza o estado
        if (data.currentIteration !== undefined) {
          progress.value = data
        }
        
        // Se é resultado completo, processa as sugestões
        if (data.type === 'complete' && data.result) {
          const result = data.result
          progress.value = result.progress
          suggestions.value = result.suggestions.map((suggestion: any) => ({
            name: suggestion.name,
            deadline: suggestion.deadline,
            pomodoros: suggestion.pomodoros,
            priority: suggestion.priority,
            difficulty: suggestion.difficulty,
            selected: suggestion.selected,
          }))
          
          if (result.progress.status === 'error') {
            error.value = result.progress.message
          } else if (result.progress.status === 'partial') {
            console.warn('Geração parcial:', result.progress.message)
          }
          
          eventSource.close()
          loading.value = false
        }
        
        // Se é erro
        if (data.type === 'error') {
          error.value = data.error || 'Erro ao gerar sugestões'
          eventSource.close()
          loading.value = false
        }
      } catch (parseError) {
        console.error('Erro ao parsear evento SSE:', parseError)
      }
    }
    
    eventSource.onerror = (err) => {
      console.error('Erro no SSE:', err)
      error.value = 'Falha na conexão com o servidor. Tente novamente.'
      eventSource.close()
      loading.value = false
    }
    
  } catch (err: any) {
    error.value = 'Falha ao gerar sugestões. Tente novamente.'
    console.error(err)
    loading.value = false
  }
}

function resetSuggestions() {
  suggestions.value = []
  prompt.value = ''
  error.value = null
  progress.value = null
  carouselIndex.value = 0
}

function discardSuggestions() {
  resetSuggestions()
}

function openCarousel(index: number) {
  carouselIndex.value = index
  carouselOpen.value = true
}

async function addSuggestions() {
  if (selectedSuggestions.value.length === 0) return
  
  adding.value = true
  error.value = null
  
  try {
    const projectId = props.project?._id || props.project?.id
    if (!projectId) throw new Error('Project ID não encontrado')
    
    const { post } = useApi('/tasks')
    const addedTasks: any[] = []
    
    for (const suggestion of selectedSuggestions.value) {
      const payload = {
        project: projectId,
        name: suggestion.name,
        description: prompt.value || '',
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
      addedTasks.push(data)
    }
    
    emit('tasks-added', addedTasks)
    resetSuggestions()
  } catch (err: any) {
    error.value = 'Falha ao adicionar tarefas. Tente novamente.'
    console.error(err)
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
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
  padding: 2rem 0;
}

.progress-details {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 320px;
}

.progress-percent {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1e293b;
}

.progress-info {
  text-align: center;
  width: 100%;
}

.progress-title {
  font-size: 1rem;
  color: #334155;
  margin: 0 0 0.75rem 0;
  font-weight: 500;
}

.progress-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #64748b;
}

.stat {
  white-space: nowrap;
}

.stat strong {
  color: #1e293b;
  font-weight: 600;
}

.stat-divider {
  color: #cbd5e1;
}

.loading-message {
  font-size: 1rem;
  color: #64748b;
  text-align: center;
  font-style: italic;
  margin: 0;
}
</style>
