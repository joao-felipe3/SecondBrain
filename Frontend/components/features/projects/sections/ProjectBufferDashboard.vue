<template>
  <v-card elevation="1" class="mb-4">
    <v-card-title class="d-flex align-center gap-2" style="font-size: 1rem; font-weight: 500">
      <v-icon>mdi-shield-check</v-icon>
       Buffer do Projeto
    </v-card-title>

    <v-card-text v-if="!loading">
      <!-- Empty State -->
      <div v-if="!bufferStatus || bufferStatus.total === 0" class="text-center py-4">
        <v-icon size="48" color="grey">mdi-information</v-icon>
        <p class="text-medium-emphasis mt-2">
          Nenhum buffer calculado ainda. Crie um caminho crítico primeiro.
        </p>
      </div>

      <!-- Buffer Visualization -->
      <div v-else class="buffer-container">
        <!-- Progress Bar -->
        <div class="mb-4">
          <div class="d-flex justify-space-between align-center mb-2">
            <span class="text-subtitle-2 font-weight-bold">Consumo de Buffer</span>
            <span class="text-subtitle-2 font-weight-bold" :class="bufferColorClass">
              {{ bufferStatus.percentageUsed }}%
            </span>
          </div>

          <v-progress-linear
            :value="bufferStatus.percentageUsed"
            :color="bufferColor"
            height="24"
            striped
            class="buffer-progress"
          >
            <template #default="{ value }">
              <span class="text-caption font-weight-bold" style="color: #1a1a1a; text-shadow: 0 1px 2px rgba(255,255,255,0.5)">
                {{ bufferStatus.consumed }}h / {{ bufferStatus.total }}h
              </span>
            </template>
          </v-progress-linear>
        </div>

        <!-- Statistics Cards -->
        <v-row class="mb-1 mt-1">
          <v-col cols="6" class="py-0">
            <v-card variant="tonal" color="primary" class="stat-card">
              <v-card-text style="padding: 0.5rem; justify-items: center;">
                <div style="font-size: 0.65rem; color: #777">Buffer Total</div>
                <div class="text-body2 font-weight-bold">{{ bufferStatus.total }}h</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="6" class="py-0">
            <v-card
              variant="tonal"
              :color="consumedCardColor"
              class="stat-card"
            >
              <v-card-text style="padding: 0.5rem; justify-items: center;">
                <div style="font-size: 0.65rem; color: #777">Consumido</div>
                <div class="text-body2 font-weight-bold">{{ bufferStatus.consumed }}h</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="6">
            <v-card
              variant="tonal"
              :color="remainingCardColor"
              class="stat-card"
            >
              <v-card-text style="padding: 0.5rem; justify-items: center;">
                <div style="font-size: 0.65rem; color: #777">Restante</div>
                <div class="text-body2 font-weight-bold">{{ bufferStatus.remaining }}h</div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="6">
            <v-card variant="tonal" color="info" class="stat-card">
              <v-card-text style="padding: 0.5rem; justify-items: center;">
                <div style="font-size: 0.65rem; color: #777">Duração Crítica</div>
                <div class="text-body2 font-weight-bold">{{ criticalPathDuration }}h</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Alerts -->
        <div v-if="bufferAlerts.length > 0" class="mb-4">
          <div class="text-subtitle-2 font-weight-bold mb-2">⚠️ Alertas</div>
          <v-alert
            v-for="alert in bufferAlerts"
            :key="alert.message"
            :type="alert.severity === 'critical' ? 'error' : 'warning'"
            variant="tonal"
            class="mb-2"
            closable
          >
            <div class="font-weight-bold mb-1">{{ alert.message }}</div>
            <div class="text-caption">{{ alert.recommendation }}</div>
          </v-alert>
        </div>

        <!-- Health Indicator -->
        <v-card variant="outlined" class="mb-4">
          <v-card-text>
            <div class="d-flex align-center gap-2 mb-2">
              <v-icon :color="healthIndicatorColor" size="28">
                {{ healthIndicatorIcon }}
              </v-icon>
              <div>
                <div class="text-caption text-medium-emphasis">Status do Buffer</div>
                <div class="font-weight-bold">{{ healthStatus }}</div>
              </div>
            </div>

            <v-divider class="my-2" />

            <div class="text-caption">
              <p v-if="bufferStatus.percentageUsed < 50" class="text-success mb-0">
                ✓ Projeto com margem confortável. Continue monitorando.
              </p>
              <p v-else-if="bufferStatus.percentageUsed < 75" class="text-warning mb-0">
                ⚠ Buffer em ponto crítico. Tarefas restantes precisam ser priorizadas.
              </p>
              <p v-else class="text-error mb-0">
                🚨 Buffer crítico! AÇÃO IMEDIATA NECESSÁRIA.
              </p>
            </div>
          </v-card-text>
        </v-card>

        <!-- Buffer Details -->
        <v-expansion-panels>
          <v-expansion-panel title="📊 Detalhes do Cálculo">
            <template #text>
              <v-table density="compact">
                <tbody>
                  <tr>
                    <td class="text-caption font-weight-bold">Duração Caminho Crítico</td>
                    <td class="text-right">{{ criticalPathDuration }}h</td>
                  </tr>
                  <tr>
                    <td class="text-caption font-weight-bold">Variância Total</td>
                    <td class="text-right">{{ totalVariance }}</td>
                  </tr>
                  <tr>
                    <td class="text-caption font-weight-bold">Desvio Padrão</td>
                    <td class="text-right">{{ standardDeviation }}h</td>
                  </tr>
                  <tr>
                    <td class="text-caption font-weight-bold">Buffer Calculado (50%)</td>
                    <td class="text-right">
                      {{ (criticalPathDuration * 0.5).toFixed(1) }}h
                    </td>
                  </tr>
                  <tr>
                    <td class="text-caption font-weight-bold">Limiar de Alerta</td>
                    <td class="text-right">75%</td>
                  </tr>
                </tbody>
              </v-table>

              <v-divider class="my-3" />

              <div class="text-caption text-medium-emphasis">
                <strong>Como funciona:</strong>
                <ul class="mt-2">
                  <li>Buffer = 50% da duração do caminho crítico</li>
                  <li>Consolidado no fim do projeto (Critical Chain)</li>
                  <li>Alerta em 50%, Crítico em 75%+</li>
                  <li>
                    Monitore consumo real vs. planejado para antecipar atrasos
                  </li>
                </ul>
              </div>
            </template>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Actions -->
        <v-card-actions class="mt-4">
          <v-spacer />
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-refresh"
            @click="recalculateBuffer"
            :loading="recalculating"
          >
            Recalcular
          </v-btn>
        </v-card-actions>
      </div>
    </v-card-text>

    <!-- Loading -->
    <v-card-text v-else class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
      <p class="text-medium-emphasis mt-2">Carregando dados do buffer...</p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '~/composables/api';

interface BufferStatus {
  total: number;
  consumed: number;
  remaining: number;
  percentageUsed: number;
  isAlert: boolean;
  alerts: Array<{
    severity: 'warning' | 'critical';
    message: string;
    recommendation: string;
    percentageUsed: number;
  }>;
}

const props = defineProps<{
  projectId: string;
  criticalPathDuration?: number;
  totalVariance?: number;
  standardDeviation?: number;
}>();

const emit = defineEmits<{
  'buffer-consumed': [hours: number];
  'buffer-alert': [alert: string];
}>();

// State
const loading = ref(false);
const recalculating = ref(false);
const bufferStatus = ref<BufferStatus | null>(null);
const bufferAlerts = ref<BufferStatus['alerts']>([]);

// Computed
const bufferColor = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct >= 75) return 'error';
  if (pct >= 50) return 'warning';
  return 'success';
});

const bufferColorClass = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct >= 75) return 'text-error';
  if (pct >= 50) return 'text-warning';
  return 'text-success';
});

const consumedCardColor = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct >= 75) return 'error';
  if (pct >= 50) return 'warning';
  return 'success';
});

const remainingCardColor = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct >= 75) return 'error';
  if (pct >= 50) return 'warning';
  return 'success';
});

const healthIndicatorIcon = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct < 50) return 'mdi-check-circle';
  if (pct < 75) return 'mdi-alert-circle';
  return 'mdi-alert-octagon';
});

const healthIndicatorColor = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct < 50) return 'success';
  if (pct < 75) return 'warning';
  return 'error';
});

const healthStatus = computed(() => {
  const pct = bufferStatus.value?.percentageUsed || 0;
  if (pct < 50) return '✓ Saudável';
  if (pct < 75) return '⚠ Atenção';
  return '🚨 Crítico';
});

const criticalPathDuration = computed(() => {
  return props.criticalPathDuration || 0;
});

const totalVariance = computed(() => {
  return props.totalVariance ? props.totalVariance.toFixed(2) : 'N/A';
});

const standardDeviation = computed(() => {
  return props.standardDeviation ? props.standardDeviation.toFixed(1) : 'N/A';
});

// Methods
const loadBufferStatus = async () => {
  if (!props.projectId) return;

  loading.value = true;
  try {
    const { get } = useApi(`/buffers/projects/${props.projectId}/status`);
    const { data, error } = await get();

    if (error) {
      console.error('Erro ao carregar buffer:', error);
      return;
    }

    if (data && data.status) {
      bufferStatus.value = data.status;
      bufferAlerts.value = data.status.alerts || [];

      // Emitir alerta se necessário
      if (bufferStatus.value?.isAlert) {
        emit('buffer-alert', `Buffer em risco: ${bufferStatus.value?.percentageUsed}%`);
      }
    }
  } catch (err) {
    console.error('Erro buscando status do buffer:', err);
  } finally {
    loading.value = false;
  }
};

const recalculateBuffer = async () => {
  if (!props.projectId) return;

  recalculating.value = true;
  try {
    const { post } = useApi(`/buffers/projects/${props.projectId}/calculate`);
    const { data, error } = await post({});

    if (error) {
      console.error('Erro recalculando buffer:', error);
      return;
    }

    // Recarregar status
    await loadBufferStatus();
  } catch (err) {
    console.error('Erro recalculando buffer:', err);
  } finally {
    recalculating.value = false;
  }
};

const consumeBuffer = async (hours: number) => {
  if (!props.projectId) return;

  try {
    const { post } = useApi(`/buffers/projects/${props.projectId}/consume`);
    const { data, error } = await post({ hoursUsed: hours });

    if (error) {
      console.error('Erro consumindo buffer:', error);
      return;
    }

    // Atualizar status
    if (data && data.status) {
      bufferStatus.value = data.status;
      emit('buffer-consumed', hours);
    }
  } catch (err) {
    console.error('Erro consumindo buffer:', err);
  }
};

// Lifecycle
onMounted(() => {
  loadBufferStatus();
});

// Watchers
watch(() => props.projectId, () => {
  loadBufferStatus();
});

// Expose for parent
defineExpose({
  loadBufferStatus,
  consumeBuffer,
  recalculateBuffer,
});
</script>

<style scoped>
.buffer-container {
  padding: 1rem 0;
}

.buffer-progress {
  border-radius: 8px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 1.8rem;
}
</style>
