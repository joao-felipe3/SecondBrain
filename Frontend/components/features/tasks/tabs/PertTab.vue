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

      <!-- Suggest via LLM (futuro) -->
      <v-btn variant="text" @click="suggestEstimates" disabled>
        💡 Sugerir estimativas (em breve)
      </v-btn>
    </div>
    <div v-else class="empty-state">
      <p>Nenhuma tarefa selecionada</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTaskStore } from '~/stores/task'

interface Props {
  task?: any
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})

const taskStore = useTaskStore()

const taskId = computed(() => props.task?._id ?? props.task?.id)

// Reactive data
const optimistic = ref<number>(0)
const likely = ref<number>(0)
const pessimistic = ref<number>(0)
const validationError = ref<string>('')

const toNumber = (value: unknown): number => {
  if (value == null || value === '') return 0
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

// Initialize/sync from task
watch(
  () => props.task,
  (t) => {
    optimistic.value = t?.pertOptimisticMinutes || 0
    likely.value = t?.pertMostLikelyMinutes || 0
    pessimistic.value = t?.pertPessimisticMinutes || 0
    validationError.value = ''
  },
  { immediate: true },
)

watch([optimistic, likely, pessimistic], () => {
  // Mantém a validação responsiva enquanto digita
  validateAndRecalculate()
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
  if (!props.task?.deadline) return 'N/A'
  try {
    const deadline = new Date(props.task.deadline)
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
  if (props.task) {
    props.task.pertOptimisticMinutes = optimistic.value
    props.task.pertMostLikelyMinutes = likely.value
    props.task.pertPessimisticMinutes = pessimistic.value
  }
}

const suggestEstimates = () => {
  // TODO: Call LLM service to suggest estimates
  console.log('Sugerir estimativas via LLM')
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
}

/* Inputs */
.pert-inputs {
  margin: 0;
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
