<template>
  <div class="pert-tab">
    <div v-if="task" class="pert-container">
      <h1 class="text-center py-2" >Estimativas PERT</h1>

      <!-- Inputs -->
      <v-row dense class="pert-inputs">
        <v-col cols="12" sm="4">
          <div class="custom-input">
            <v-text-field
              :model-value="optimistic"
              @update:model-value="(val) => (optimistic = toNumber(val))"
              type="number"
              min="0"
              label="Otimista (min)"
              variant="solo-filled"
              density="comfortable"
              hide-details
            />
          </div>
        </v-col>

        <v-col cols="12" sm="4">
          <div class="custom-input">
            <v-text-field
              :model-value="likely"
              @update:model-value="(val) => (likely = toNumber(val))"
              type="number"
              min="0"
              label="Provável (min)"
              variant="solo-filled"
              density="comfortable"
              hide-details
            />
          </div>
        </v-col>

        <v-col cols="12" sm="4">
          <div class="custom-input">
            <v-text-field
              :model-value="pessimistic"
              @update:model-value="(val) => (pessimistic = toNumber(val))"
              type="number"
              min="0"
              label="Pessimista (min)"
              variant="solo-filled"
              density="comfortable"
              hide-details
            />
          </div>
        </v-col>
      </v-row>

      <!-- Validation Error -->
      <v-alert
        v-if="validationError"
        type="error"
        variant="tonal"
        density="comfortable"
        class="validation-error"
      >
        {{ validationError }}
      </v-alert>

      <!-- Calculated Values -->
      <div class="pert-outputs">
        <h4>Valores Calculados:</h4>

        <div class="output-row">
          <span class="output-label">TE (Tempo Esperado):</span>
          <span class="output-value">{{ pertExpected }} min</span>
        </div>

        <div class="output-row">
          <span class="output-label">σ² (Variância):</span>
          <span class="output-value">{{ pertVariance }}</span>
        </div>

        <div class="output-row">
          <span class="output-label">σ (Desvio Padrão):</span>
          <span class="output-value">{{ pertStdDev }}</span>
        </div>

        <div class="output-row recommended">
          <span class="output-label">Deadline Sugerido:</span>
          <span class="output-value">{{ suggestedDeadline }}</span>
        </div>
      </div>

      <!-- Save Button -->
      <v-btn color="success" variant="flat" @click="savePertEstimates" :disabled="!!validationError">
        💾 Salvar Estimativas
      </v-btn>

      <!-- Suggest via LLM -->
      <v-btn 
        color="info" 
        variant="outlined" 
        @click="suggestEstimates"
        :loading="suggestLoading"
        :disabled="suggestLoading || !(task?.name || task?.title)"
      >
        💡 Sugerir estimativas
      </v-btn>

      <!-- Suggestion Status -->
      <v-alert
        v-if="suggestionError"
        type="error"
        variant="tonal"
        density="comfortable"
        class="mt-2"
      >
        {{ suggestionError }}
      </v-alert>

      <v-alert
        v-if="suggestionSuccess"
        type="success"
        variant="tonal"
        density="comfortable"
        class="mt-2"
      >
        ✅ Sugestões carregadas! Verifique os valores abaixo.
      </v-alert>
    </div>
    <div v-else class="empty-state">
      <p>Nenhuma tarefa selecionada</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRefs } from 'vue'
import { useTaskStore } from '~/stores/task'
import { useApiFetch } from '~/composables/useApi'

interface Props {
  task?: any
  projects?: any[]
}

interface PertSuggestionResponse {
  optimistic: number
  likely: number
  pessimistic: number
  expectedTime: number
  standardDeviation: number
  recommendation: string
  fromLLM: boolean
}

const props = defineProps<Props>()
const { task, projects } = toRefs(props)

const taskStore = useTaskStore()
const { fetch } = useApiFetch()

const taskId = computed(() => task.value?._id ?? task.value?.id)

// Reactive data
const optimistic = ref<number>(0)
const likely = ref<number>(0)
const pessimistic = ref<number>(0)
const validationError = ref<string>('')
const suggestLoading = ref(false)
const suggestionError = ref<string>('')
const suggestionSuccess = ref(false)

const toNumber = (value: unknown): number => {
  if (value == null || value === '') return 0
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

// Initialize/sync from task
watch(
  task,
  (t) => {
    optimistic.value = t?.pertOptimisticMinutes || 0
    likely.value = t?.pertMostLikelyMinutes || 0
    pessimistic.value = t?.pertPessimisticMinutes || 0
    validationError.value = ''
    suggestionError.value = ''
    suggestionSuccess.value = false
  },
  { immediate: true },
)

watch([optimistic, likely, pessimistic], () => {
  // Mantém a validação responsiva enquanto digita
  validateAndRecalculate()
  // Limpa status de sucesso ao editar
  if (suggestionSuccess.value) {
    suggestionSuccess.value = false
  }
})

// Computed properties
const pertExpected = computed(() => {
  if (!optimistic.value || !likely.value || !pessimistic.value) return 0
  // TE = (O + 4M + P) / 6
  const te = (optimistic.value + 4 * likely.value + pessimistic.value) / 6
  return Math.round(te * 100) / 100
})

const pertVariance = computed(() => {
  if (!optimistic.value || !likely.value || !pessimistic.value) return 0
  // σ² = [(P - O) / 6]²
  const variance = Math.pow((pessimistic.value - optimistic.value) / 6, 2)
  return Math.round(variance * 100) / 100
})

const pertStdDev = computed(() => {
  if (!optimistic.value || !likely.value || !pessimistic.value) return 0
  // σ = (P - O) / 6
  const stdDev = (pessimistic.value - optimistic.value) / 6
  return Math.round(stdDev * 100) / 100
})

const suggestedDeadline = computed(() => {
  if (!task.value?.deadline) return 'N/A'
  try {
    const deadline = new Date(task.value.deadline)
    const teNdays = Math.ceil(pertExpected.value / 480) // Assuming 8h = 480min work day
    const suggested = new Date(deadline)
    suggested.setDate(suggested.getDate() + teNdays)
    return suggested.toLocaleDateString('pt-BR')
  } catch {
    return 'N/A'
  }
})

// Methods
const validateAndRecalculate = () => {
  validationError.value = ''

  if (
    optimistic.value <= 0 ||
    likely.value <= 0 ||
    pessimistic.value <= 0
  ) {
    validationError.value = 'Todos os valores devem ser maiores que 0'
    return
  }

  if (optimistic.value >= likely.value) {
    validationError.value = 'Otimista deve ser menor que Provável'
    return
  }

  if (likely.value >= pessimistic.value) {
    validationError.value = 'Provável deve ser menor que Pessimista'
    return
  }
}

const savePertEstimates = async () => {
  validateAndRecalculate()
  const id = taskId.value
  if (validationError.value || !id) return

  await taskStore.updateTask(id, {
    pertOptimisticMinutes: optimistic.value,
    pertMostLikelyMinutes: likely.value,
    pertPessimisticMinutes: pessimistic.value,
  })

  // Atualizar local
  if (task.value) {
    task.value.pertOptimisticMinutes = optimistic.value
    task.value.pertMostLikelyMinutes = likely.value
    task.value.pertPessimisticMinutes = pessimistic.value
  }
}

/**
 * Sprint 3: Sugerir estimativas via LLM (Gemini)
 * Chama POST /tasks/micro/suggest-estimates e preenche campos automaticamente
 */
const suggestEstimates = async () => {
  const taskTitle = task.value?.name || task.value?.title
  if (!taskTitle) {
    suggestionError.value = 'Tarefa não possui título'
    return
  }

  suggestLoading.value = true
  suggestionError.value = ''
  suggestionSuccess.value = false

  try {
    // Determina o tipo de tarefa (micro-task type)
    // Pode ser enviado via props ou derivado do task.microTaskType
    const taskType = task.value?.microTaskType || 'quick'
    const projectName = projects.value?.find((p) => p._id === task.value?.project)?.name || ''

    const response = (await fetch('/tasks/micro/suggest-estimates', {
      method: 'POST',
      body: {
        taskType,
        description: taskTitle,
        projectContext: projectName,
      },
    })) as PertSuggestionResponse

    // Preenche os campos com as sugestões
    optimistic.value = Math.round(response.optimistic)
    likely.value = Math.round(response.likely)
    pessimistic.value = Math.round(response.pessimistic)

    suggestionSuccess.value = true
    suggestionError.value = ''

    // Auto-limpa sucesso após 5 segundos
    setTimeout(() => {
      suggestionSuccess.value = false
    }, 5000)
  } catch (error: any) {
    suggestionError.value =
      error?.data?.message ||
      error?.message ||
      'Erro ao gerar sugestões. Tente novamente.'
    suggestionSuccess.value = false
  } finally {
    suggestLoading.value = false
  }
}
</script>

<style scoped>
.pert-tab {
  width: 100%;
  height: 100%;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.pert-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0;
  margin: 0;
  position: relative;
}

/* Garantir que botões funcionem */
.pert-container :deep(.v-btn) {
  position: relative;
  z-index: 2;
  pointer-events: auto !important;
}

/* Inputs */
.pert-inputs {
  margin: 0;
  position: relative;
  z-index: 1;
}

/* Validation Error */
.validation-error {
  font-size: 12px;
}

/* Outputs */
.pert-outputs {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0 1.5rem;
}

.pert-outputs h4 {
  margin: 0 0 0.75rem 0;
  font-size: 14px;
  color: #3e2723;
}

.output-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #ede4d8;
}

.output-row:last-child {
  border-bottom: none;
}

.output-row.recommended {
  background: transparent;
  padding: 0.5rem 0;
  border-radius: 0;
  border: none;
}

.output-label {
  font-size: 13px;
  color: #a6794a;
  font-weight: 500;
}

.output-value {
  font-size: 13px;
  color: #3e2723;
  font-weight: 600;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-style: italic;
  color: #a6794a;
  font-size: 14px;
}

/* Custom scrollbar */
.pert-tab::-webkit-scrollbar {
  width: 6px;
}

.pert-tab::-webkit-scrollbar-track {
  background: transparent;
}

.pert-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.pert-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
