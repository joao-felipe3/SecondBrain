<template>
  <v-card class="pert-estimation-card">
    <v-card-subtitle class="d-flex align-center pt-2">
      <v-icon class="mr-2" size="small" color="primary">mdi-chart-timeline-variant</v-icon>
      <span style="font-size: 0.95rem;">PERT (3 Pontos)</span>
      <v-spacer />
      <v-tooltip bottom>
        <template #activator="{ props }">
          <v-icon v-bind="props" size="x-small">mdi-information-outline</v-icon>
        </template>
        <div style="max-width: 280px; font-size: 0.85rem;">
          <strong>Fórmula:</strong> TE = (O + 4M + P) / 6<br>
          <strong>O:</strong> Otimista • <strong>M:</strong> Provável • <strong>P:</strong> Pessimista
        </div>
      </v-tooltip>
    </v-card-subtitle>

    <v-card-text class="pa-n2 mt-n2">
      <v-row dense>
        <!-- Otimista -->
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="optimisticHours"
            label="Otimista"
            type="number"
            min="0.1"
            step="0.5"
            suffix="h"
            density="compact"
            variant="outlined"
            color="success"
            :rules="[rules.positive, rules.order]"
            @update:model-value="calculateMetrics"
          >
            <template #prepend-inner>
              <v-icon size="x-small" color="success">mdi-thumb-up</v-icon>
            </template>
          </v-text-field>
        </v-col>

        <!-- Mais Provável -->
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="mostLikelyHours"
            label="Provável"
            type="number"
            min="0.1"
            step="0.5"
            suffix="h"
            density="compact"
            variant="outlined"
            color="primary"
            :rules="[rules.positive]"
            @update:model-value="calculateMetrics"
          >
            <template #prepend-inner>
              <v-icon size="x-small" color="primary">mdi-equal</v-icon>
            </template>
          </v-text-field>
        </v-col>

        <!-- Pessimista -->
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="pessimisticHours"
            label="Pessimista"
            type="number"
            min="0.1"
            step="0.5"
            suffix="h"
            density="compact"
            variant="outlined"
            color="error"
            :rules="[rules.positive, rules.order]"
            @update:model-value="calculateMetrics"
          >
            <template #prepend-inner>
              <v-icon size="x-small" color="error">mdi-thumb-down</v-icon>
            </template>
          </v-text-field>
        </v-col>
      </v-row>

      <!-- Alerta de Validação -->
      <v-alert
        v-if="!isValid"
        type="warning"
        variant="tonal"
        class="mb-2"
        density="compact"
        closable
      >
        ⚠️ Ordem inválida: O ≤ M ≤ P
      </v-alert>

      <!-- Resultados Compactos em Grid -->
      <div v-if="isValid && hasEstimates" class="results-grid">
        <div class="result-item primary">
          <div class="label">Tempo Esperado</div>
          <div class="value">{{ expectedTimeHours.toFixed(1) }}h</div>
          <div class="subtext">{{ expectedTimeMinutes }}min</div>
        </div>
        <div class="result-item info">
          <div class="label">Desvio (±)</div>
          <div class="value">{{ standardDeviationHours.toFixed(1) }}h</div>
          <div class="subtext">{{ uncertaintyLevel }}</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface Props {
  taskId?: string;
  optimisticMinutes?: number | null;
  mostLikelyMinutes?: number | null;
  pessimisticMinutes?: number | null;
  initialOptimistic?: number;
  initialMostLikely?: number;
  initialPessimistic?: number;
}

const props = withDefaults(defineProps<Props>(), {
  taskId: '',
  optimisticMinutes: null,
  mostLikelyMinutes: null,
  pessimisticMinutes: null,
  initialOptimistic: 0,
  initialMostLikely: 0,
  initialPessimistic: 0,
});

const emit = defineEmits<{
  (event: 'update:optimisticMinutes', value: number | undefined): void;
  (event: 'update:mostLikelyMinutes', value: number | undefined): void;
  (event: 'update:pessimisticMinutes', value: number | undefined): void;
  (event: 'error', error: string): void;
}>();

// Estado
const optimisticHours = ref(0);
const mostLikelyHours = ref(0);
const pessimisticHours = ref(0);

// Inicializar com valores passados (converter de minutos para horas)
watch(
  () => [
    props.optimisticMinutes ?? props.initialOptimistic,
    props.mostLikelyMinutes ?? props.initialMostLikely,
    props.pessimisticMinutes ?? props.initialPessimistic,
  ],
  ([rawO, rawM, rawP]) => {
    const o = Number(rawO || 0);
    const m = Number(rawM || 0);
    const p = Number(rawP || 0);

    if (o > 0) optimisticHours.value = o / 60;
    else optimisticHours.value = 0;

    if (m > 0) mostLikelyHours.value = m / 60;
    else mostLikelyHours.value = 0;

    if (p > 0) pessimisticHours.value = p / 60;
    else pessimisticHours.value = 0;
  },
  { immediate: true },
);

watch(
  [optimisticHours, mostLikelyHours, pessimisticHours],
  ([o, m, p]) => {
    const optimistic = Number.isFinite(o) && o > 0 ? Math.round(o * 60) : undefined;
    const mostLikely = Number.isFinite(m) && m > 0 ? Math.round(m * 60) : undefined;
    const pessimistic = Number.isFinite(p) && p > 0 ? Math.round(p * 60) : undefined;

    emit('update:optimisticMinutes', optimistic);
    emit('update:mostLikelyMinutes', mostLikely);
    emit('update:pessimisticMinutes', pessimistic);
  },
  { immediate: true },
);

// Validações
const rules = {
  positive: (v: number) => v > 0 || 'Deve ser maior que zero',
  order: () => isValid.value || 'Deve seguir a ordem O ≤ M ≤ P',
};

// Computed
const hasEstimates = computed(() => 
  optimisticHours.value > 0 && mostLikelyHours.value > 0 && pessimisticHours.value > 0
);

const isValid = computed(() => {
  if (!hasEstimates.value) return true;
  return (
    optimisticHours.value <= mostLikelyHours.value &&
    mostLikelyHours.value <= pessimisticHours.value
  );
});

// Cálculos PERT
const expectedTimeMinutes = computed(() => {
  if (!isValid.value || !hasEstimates.value) return 0;
  const o = optimisticHours.value * 60;
  const m = mostLikelyHours.value * 60;
  const p = pessimisticHours.value * 60;
  return Math.round((o + 4 * m + p) / 6);
});

const expectedTimeHours = computed(() => expectedTimeMinutes.value / 60);

const variance = computed(() => {
  if (!isValid.value || !hasEstimates.value) return 0;
  const range = (pessimisticHours.value - optimisticHours.value) * 60;
  return Math.pow(range / 6, 2);
});

const standardDeviationMinutes = computed(() => Math.sqrt(variance.value));
const standardDeviationHours = computed(() => standardDeviationMinutes.value / 60);

// Nível de incerteza baseado no coeficiente de variação
const coefficientOfVariation = computed(() => {
  if (expectedTimeMinutes.value === 0) return 0;
  return standardDeviationMinutes.value / expectedTimeMinutes.value;
});

const uncertaintyLevel = computed(() => {
  const cv = coefficientOfVariation.value;
  if (cv > 0.5) return 'Alta';
  if (cv > 0.3) return 'Moderada';
  return 'Baixa';
});


const recommendation = computed(() => {
  if (!isValid.value || !hasEstimates.value) return '';
  const cv = coefficientOfVariation.value;
  if (cv > 0.5) {
    return '⚠️ Alta incerteza detectada. Considere decompor esta tarefa em sub-tarefas menores para melhorar a precisão da estimativa.';
  }
  if (cv > 0.3) {
    return '⚡ Incerteza moderada. Monitore o progresso de perto e ajuste o plano conforme necessário.';
  }
  return '✅ Incerteza baixa. A estimativa é confiável e o risco de desvio é mínimo.';
});

const recommendationType = computed(() => {
  const cv = coefficientOfVariation.value;
  if (cv > 0.5) return 'warning';
  if (cv > 0.3) return 'info';
  return 'success';
});

// Métodos
function calculateMetrics() {
  // Os computed já recalculam automaticamente
}
</script>

<style scoped>
.pert-estimation-card {
  border-left: 4px solid rgb(var(--v-theme-primary));
  background-color: transparent;
  margin-top: 0.5rem;
}

.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: -1rem;
}

.result-item {
  padding: 0.5rem;
  border-radius: 6px;
  text-align: center;
  border-left: 3px solid;
}

.result-item.primary {
  background-color: rgba(63, 81, 181, 0.08);
  border-left-color: rgb(63, 81, 181);
}

.result-item.info {
  background-color: rgba(3, 155, 229, 0.08);
  border-left-color: rgb(3, 155, 229);
}

.result-item .label {
  font-size: 0.7rem;
  color: #999;
  margin-bottom: 0.1rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-item .value {
  font-size: 1.25rem;
  font-weight: bold;
  color: #222;
  line-height: 1;
}

.result-item .subtext {
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.1rem;
}

:deep(.v-expansion-panel) {
  background-color: transparent;
}

:deep(.v-expansion-panel__header) {
  padding: 0.5rem 0.75rem;
  min-height: auto;
}

:deep(.v-expansion-panel__content) {
  padding: 0.75rem;
}
</style>
