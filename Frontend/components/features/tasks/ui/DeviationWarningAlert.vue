<template>
  <v-alert
    v-if="deviation.isDeviated"
    type="warning"
    variant="tonal"
    class="deviation-alert"
    closable
    @close="dismissed = true"
  >
    <div class="deviation-content">
      <div class="deviation-header">
        <v-icon icon="mdi-alert-outline" size="large" />
        <div class="deviation-title">
          <strong>Desvio de tempo detectado</strong>
          <span class="deviation-percent">+{{ Math.round(deviation.percentOver) }}% acima da estimativa</span>
        </div>
      </div>

      <div class="deviation-details">
        <div class="time-comparison">
          <div class="time-item">
            <span class="label">Estimado:</span>
            <span class="value">{{ deviation.expectedMinutes }} min</span>
          </div>
          <v-icon icon="mdi-arrow-right" />
          <div class="time-item actual">
            <span class="label">Gasto:</span>
            <span class="value">{{ deviation.actualMinutes }} min</span>
          </div>
        </div>

        <p v-if="deviation.message" class="deviation-message">
          {{ deviation.message }}
        </p>

        <p v-if="deviation.recommendation" class="deviation-recommendation">
          <strong>Sugestão:</strong> {{ deviation.recommendation }}
        </p>

        <div class="deviation-actions">
          <v-btn
            variant="outlined"
            color="primary"
            size="small"
            @click="openAdjustDialog"
            :loading="adjusting"
          >
            <v-icon icon="mdi-pencil" start />
            Ajustar estimativa
          </v-btn>
        </div>
      </div>
    </div>
  </v-alert>

  <!-- Dialog para ajustar PERT -->
  <v-dialog v-model="showAdjustDialog" persistent max-width="600px">
    <v-card>
      <v-card-title>Ajustar Estimativa PERT</v-card-title>
      <v-divider />

      <v-card-text class="py-6">
        <div class="adjust-form">
          <div class="info-box">
            <p>
              Esta tarefa demorou <strong>{{ deviation.actualMinutes }} minutos</strong>,
              enquanto foi estimada em <strong>{{ deviation.expectedMinutes }} minutos</strong>.
            </p>
            <p class="mt-2">
              Ajuste as estimativas PERT para refletir melhor futuras tarefas similares:
            </p>
          </div>

          <v-form ref="adjustForm" v-model="formValid">
            <v-text-field
              v-model.number="newPert.optimistic"
              label="Tempo Otimista (min)"
              type="number"
              outlined
              dense
              :rules="[v => v > 0 || 'Deve ser maior que 0', v => v <= newPert.likely || 'Deve ser <= Provável']"
              class="mb-3"
            />

            <v-text-field
              v-model.number="newPert.likely"
              label="Tempo Provável (min)"
              type="number"
              outlined
              dense
              :rules="[
                v => v > 0 || 'Deve ser maior que 0',
                v => v >= newPert.optimistic || 'Deve ser >= Otimista',
                v => v <= newPert.pessimistic || 'Deve ser <= Pessimista'
              ]"
              class="mb-3"
            />

            <v-text-field
              v-model.number="newPert.pessimistic"
              label="Tempo Pessimista (min)"
              type="number"
              outlined
              dense
              :rules="[v => v > 0 || 'Deve ser maior que 0', v => v >= newPert.likely || 'Deve ser >= Provável']"
              class="mb-3"
            />

            <v-divider class="my-4" />

            <div class="calculated-values">
              <p>
                <strong>TE (Tempo Esperado):</strong>
                {{ calculateTE(newPert.optimistic, newPert.likely, newPert.pessimistic).toFixed(1) }} min
              </p>
              <p>
                <strong>Desvio Padrão:</strong>
                {{ calculateStdDev(newPert.optimistic, newPert.pessimistic).toFixed(1) }} min
              </p>
            </div>
          </v-form>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="default" @click="showAdjustDialog = false">Cancelar</v-btn>
        <v-btn color="primary" @click="submitAdjustment" :loading="adjusting" :disabled="!formValid">
          Salvar estimativa
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useApi } from '~/composables/api/useApi'

interface Props {
  taskId?: string
}

const props = defineProps<Props>()

interface DeviationData {
  isDeviated: boolean
  percentOver: number
  actualMinutes: number
  expectedMinutes: number
  message?: string
  recommendation?: string
}

const deviation = reactive<DeviationData>({
  isDeviated: false,
  percentOver: 0,
  actualMinutes: 0,
  expectedMinutes: 0,
})

const dismissed = ref(false)
const showAdjustDialog = ref(false)
const adjusting = ref(false)
const formValid = ref(false)

const newPert = reactive({
  optimistic: 0,
  likely: 0,
  pessimistic: 0,
})

async function loadDeviation() {
  if (!props.taskId || dismissed.value) {
    return
  }

  try {
    const { get } = useApi(`/tasks/${props.taskId}/check-deviation`)
    const { data, error } = await get()

    if (!error && data) {
      Object.assign(deviation, data)
    }
  } catch (err) {
    // Silent fail - deviation is optional
  }
}

const calculateTE = (o: number, m: number, p: number): number => {
  return (o + 4 * m + p) / 6
}

const calculateStdDev = (o: number, p: number): number => {
  return (p - o) / 6
}

const openAdjustDialog = () => {
  // Inicializar com os valores atuais
  const currentTe = deviation.expectedMinutes
  newPert.likely = Math.round(currentTe)
  newPert.optimistic = Math.round(currentTe * 0.7)
  newPert.pessimistic = Math.round(currentTe * 1.5)

  showAdjustDialog.value = true
}

const submitAdjustment = async () => {
  if (!formValid.value || !props.taskId) return

  adjusting.value = true
  try {
    const api = useApi(`/tasks/${props.taskId}/pert`)
    const result = await api.patch({
      pertOptimistic: newPert.optimistic,
      pertMostLikely: newPert.likely,
      pertPessimistic: newPert.pessimistic,
    })

    if (!result.error) {
      showAdjustDialog.value = false
      // Recarregar desvio
      await loadDeviation()
    }
  } catch (err) {
    console.error('Erro ao atualizar PERT:', err)
  } finally {
    adjusting.value = false
  }
}

onMounted(loadDeviation)
</script>

<style scoped>
.deviation-alert {
  margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.1));
  border-left: 4px solid #ffc107;
}

.deviation-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deviation-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.deviation-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.deviation-title strong {
  font-size: 15px;
}

.deviation-percent {
  color: #ff6f00;
  font-weight: 600;
  font-size: 14px;
}

.deviation-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-left: 40px;
}

.time-comparison {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

.time-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.time-item.actual {
  color: #d32f2f;
}

.time-item .label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}

.time-item .value {
  font-size: 16px;
  font-weight: 600;
}

.deviation-message {
  margin: 0;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.7);
}

.deviation-recommendation {
  margin: 0;
  padding: 8px 12px;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 4px;
  font-size: 14px;
  border-left: 3px solid #4caf50;
}

.deviation-actions {
  display: flex;
  gap: 8px;
}

.info-box {
  padding: 12px;
  background: rgba(33, 150, 243, 0.05);
  border-radius: 4px;
  border-left: 3px solid #2196f3;
  font-size: 14px;
}

.info-box p {
  margin: 8px 0;
}

.adjust-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.calculated-values {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
  font-size: 13px;
}

.calculated-values p {
  margin: 4px 0;
}
</style>
