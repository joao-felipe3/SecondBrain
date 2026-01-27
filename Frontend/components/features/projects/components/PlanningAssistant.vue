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

    <!-- Estado de Carregamento -->
    <div v-if="loading" class="loading-state">
      <v-progress-circular
        indeterminate
        size="64"
        width="4"
        color="primary"
      />
      <p class="loading-message">Analisando seus objetivos e criando um plano...</p>
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
import SuggestionsList from './SuggestionsList.vue'
import SuggestionsCarouselDialog from './SuggestionsCarouselDialog.vue'

interface Suggestion {
  name: string
  deadline: string
  pomodoros: number
  priority: number
  difficulty: number
  selected: boolean
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

const hasGoals = computed(() => {
  return props.project?.shortTermGoal || props.project?.midTermGoal || props.project?.longTermGoal
})

const selectedSuggestions = computed(() => {
  return suggestions.value.filter(s => s.selected)
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
  
  try {
    const { post } = useApi('/tasks/ai-suggestions')
    const { data, error: e } = await post({
      projectName: props.project?.name || 'Projeto',
      projectId: props.project?._id || props.project?.id,
      shortTermGoal: props.project?.shortTermGoal || '',
      midTermGoal: props.project?.midTermGoal || '',
      longTermGoal: props.project?.longTermGoal || '',
      userPrompt: prompt.value || '',
      targetHours: 50,
    })
    
    if (e) throw e
    
    suggestions.value = data.map((suggestion: any) => ({
      name: suggestion.name,
      deadline: suggestion.deadline,
      pomodoros: suggestion.pomodoros,
      priority: suggestion.priority,
      difficulty: suggestion.difficulty,
      selected: suggestion.selected,
    }))
  } catch (err: any) {
    error.value = 'Falha ao gerar sugestões. Tente novamente.'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function resetSuggestions() {
  suggestions.value = []
  prompt.value = ''
  error.value = null
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
  padding: 3rem 0;
}

.loading-message {
  font-size: 1rem;
  color: #64748b;
  text-align: center;
  font-style: italic;
  margin: 0;
}
</style>
