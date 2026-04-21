<template>
  <div class="pert-display">
    <!-- Compact PERT Summary Card -->
    <v-card variant="outlined" density="compact" class="pert-card">
      <v-card-text class="pert-content">
        <!-- Header with PERT metric -->
        <div class="pert-header">
          <div class="te-badge" :class="teClass">
            ⏱️ {{ expectedTime }}min
          </div>
          <div class="deadline-badge" :class="deadlineClass">
            📅 {{ formattedDeadline }}
          </div>
        </div>

        <!-- Mini PERT details (collapsible) -->
        <div v-if="showDetails" class="pert-details">
          <div class="detail-row">
            <span class="detail-label">O:</span>
            <span class="detail-value">{{ optimistic }}min</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">M:</span>
            <span class="detail-value">{{ likely }}min</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">P:</span>
            <span class="detail-value">{{ pessimistic }}min</span>
          </div>
          <div class="detail-row emphasized">
            <span class="detail-label">σ:</span>
            <span class="detail-value">{{ standardDeviation }}</span>
          </div>
        </div>

        <!-- Toggle Details Button -->
        <v-btn
          v-if="hasValidPert"
          size="x-small"
          variant="text"
          @click="showDetails = !showDetails"
          class="toggle-details"
        >
          {{ showDetails ? '▲' : '▼' }} Detalhes
        </v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  optimistic?: number
  likely?: number
  pessimistic?: number
  deadline?: Date | string
}

const props = withDefaults(defineProps<Props>(), {
  optimistic: undefined,
  likely: undefined,
  pessimistic: undefined,
  deadline: undefined,
})

const showDetails = ref(false)

/**
 * Calcula o Tempo Esperado (TE)
 * TE = (O + 4M + P) / 6
 */
const expectedTime = computed(() => {
  const { optimistic: O, likely: M, pessimistic: P } = props
  if (!O || !M || !P) return 0
  const te = (O + 4 * M + P) / 6
  return Math.round(te)
})

/**
 * Calcula o Desvio Padrão
 * σ = (P - O) / 6
 */
const standardDeviation = computed(() => {
  const { optimistic: O, pessimistic: P } = props
  if (!O || !P) return 0
  const sigma = (P - O) / 6
  return Math.round(sigma * 100) / 100
})

/**
 * Retorna se PERT tem valores válidos
 */
const hasValidPert = computed(() => {
  return props.optimistic && props.likely && props.pessimistic
})

/**
 * Formata a data de deadline
 */
const formattedDeadline = computed(() => {
  if (!props.deadline) return 'N/A'
  try {
    const date = typeof props.deadline === 'string' ? new Date(props.deadline) : props.deadline
    return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })
  } catch {
    return 'N/A'
  }
})

/**
 * Retorna classe CSS para TE badge baseada na duração
 */
const teClass = computed(() => {
  const te = expectedTime.value
  if (te <= 30) return 'te-quick'
  if (te <= 120) return 'te-medium'
  return 'te-long'
})

/**
 * Retorna classe CSS para deadline badge
 * Baseada em dias até o deadline
 */
const deadlineClass = computed(() => {
  if (!props.deadline) return 'deadline-unknown'
  
  try {
    const deadline = typeof props.deadline === 'string' ? new Date(props.deadline) : props.deadline
    const now = new Date()
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysLeft < 0) return 'deadline-overdue'
    if (daysLeft === 0) return 'deadline-today'
    if (daysLeft <= 3) return 'deadline-soon'
    return 'deadline-ok'
  } catch {
    return 'deadline-unknown'
  }
})
</script>

<style scoped>
.pert-display {
  width: 100%;
}

.pert-card {
  border-radius: 8px;
  border: 1px solid #d4a574;
  background: linear-gradient(135deg, #fff8f0 0%, #f5e6d3 100%);
}

.pert-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pert-header {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.te-badge,
.deadline-badge {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

/* TE Badge Colors */
.te-quick {
  background-color: #c8e6c9;
  color: #1b5e20;
}

.te-medium {
  background-color: #fff9c4;
  color: #f57f17;
}

.te-long {
  background-color: #ffccbc;
  color: #bf360c;
}

/* Deadline Badge Colors */
.deadline-ok {
  background-color: #a5d6a7;
  color: #1b5e20;
}

.deadline-soon {
  background-color: #ffe082;
  color: #f57f17;
}

.deadline-today {
  background-color: #ffab91;
  color: #bf360c;
}

.deadline-overdue {
  background-color: #ef9a9a;
  color: #c62828;
  font-weight: 600;
}

.deadline-unknown {
  background-color: #e0e0e0;
  color: #424242;
}

.pert-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  margin-top: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.detail-row.emphasized {
  background-color: rgba(212, 165, 116, 0.1);
  padding: 4px;
  border-radius: 3px;
}

.detail-label {
  font-weight: 600;
  color: #5d4037;
}

.detail-value {
  color: #3e2723;
}

.toggle-details {
  margin-top: 4px;
  color: #8d6e63;
}

.toggle-details:hover {
  color: #5d4037;
}
</style>
