<template>
  <div class="pert-tab">
    <div v-if="task" class="pert-container">
      <h3 class="pert-title">⏱️ Estimativas PERT</h3>

      <!-- Inputs -->
      <div class="pert-inputs">
        <div class="pert-input-group">
          <label>Otimista (min):</label>
          <input
            v-model.number="optimistic"
            type="number"
            min="0"
            class="pert-input"
            @change="validateAndRecalculate"
          />
        </div>

        <div class="pert-input-group">
          <label>Provável (min):</label>
          <input
            v-model.number="likely"
            type="number"
            min="0"
            class="pert-input"
            @change="validateAndRecalculate"
          />
        </div>

        <div class="pert-input-group">
          <label>Pessimista (min):</label>
          <input
            v-model.number="pessimistic"
            type="number"
            min="0"
            class="pert-input"
            @change="validateAndRecalculate"
          />
        </div>
      </div>

      <!-- Validation Error -->
      <div v-if="validationError" class="validation-error">
        {{ validationError }}
      </div>

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
      <button class="save-pert-btn" @click="savePertEstimates" :disabled="!!validationError">
        💾 Salvar Estimativas
      </button>

      <!-- Suggest via LLM (futuro) -->
      <button class="suggest-btn" @click="suggestEstimates" disabled>
        💡 Sugerir estimativas (em breve)
      </button>
    </div>
    <div v-else class="empty-state">
      <p>Nenhuma tarefa selecionada</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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

// Reactive data
const optimistic = ref<number>(0)
const likely = ref<number>(0)
const pessimistic = ref<number>(0)
const validationError = ref<string>('')

// Initialize from task
onMounted(() => {
  if (props.task) {
    optimistic.value = props.task.pertOptimisticMinutes || 0
    likely.value = props.task.pertMostLikelyMinutes || 0
    pessimistic.value = props.task.pertPessimisticMinutes || 0
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
  if (validationError.value || !props.task?.id) return

  await taskStore.updateTask(props.task.id, {
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

.pert-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #3e2723;
}

/* Inputs */
.pert-inputs {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pert-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pert-input-group label {
  font-size: 13px;
  font-weight: 500;
  color: #3e2723;
}

.pert-input {
  padding: 8px 10px;
  font-family: 'Irish Grover', cursive;
  font-size: 14px;
  border: 1px solid #d4a574;
  border-radius: 3px;
  background: #fafaf8;
  color: #3e2723;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.pert-input:focus {
  outline: none;
  border-color: #b8934a;
  background: #ffffff;
}

.pert-input::-webkit-outer-spin-button,
.pert-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pert-input {
  -moz-appearance: textfield;
}

/* Validation Error */
.validation-error {
  padding: 10px 12px;
  background: #ffe0e0;
  border: 1px solid #f44336;
  border-radius: 3px;
  color: #c92a2a;
  font-size: 12px;
  line-height: 1.4;
}

/* Outputs */
.pert-outputs {
  background: #fafaf8;
  border: 1px solid #ede4d8;
  border-radius: 3px;
  padding: 1rem;
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
  background: rgba(126, 197, 118, 0.1);
  padding: 0.75rem;
  border-radius: 3px;
  border: 1px solid #c8e6c9;
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

/* Buttons */
.save-pert-btn,
.suggest-btn {
  padding: 10px 12px;
  border-radius: 3px;
  font-family: 'Irish Grover', cursive;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    opacity 0.2s ease;
  border: 1px solid #d4a574;
}

.save-pert-btn:disabled,
.suggest-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-pert-btn {
  background: #7ec576;
  color: white;
  border-color: #5fa855;
}

.save-pert-btn:hover:not(:disabled) {
  background: #6bb15f;
}

.save-pert-btn:active:not(:disabled) {
  background: #5a9850;
}

.suggest-btn {
  background: #f5e6d3;
  color: #3e2723;
}

.suggest-btn:hover:not(:disabled) {
  background: #ede4d8;
}

.suggest-btn:active:not(:disabled) {
  background: #e8dcc8;
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
