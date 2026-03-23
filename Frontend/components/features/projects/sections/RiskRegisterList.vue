<template>
  <v-sheet class="risk-register-list" elevation="0" color="transparent">
    <div class="section-header">
      <v-btn
        size="small"
        variant="outlined"
        @click="$emit('assess')"
        :loading="assessing"
      >
        Avaliar Riscos
      </v-btn>
    </div>

    <div v-if="risks.length > 0" class="table-scroll">
      <v-data-table
        :headers="visibleHeaders"
        :items="risks"
        :items-per-page="5"
        class="risk-table"
        density="compact"
        item-key="_id"
        @click:row="handleRowClick"
      >
        <template #item.description="{ item }">
          <v-tooltip :text="item.description" location="top">
            <template #activator="{ props }">
              <button
                class="risk-link risk-description"
                type="button"
                v-bind="props"
                @click.stop="openRiskDetails(item)"
              >
                {{ item.description }}
              </button>
            </template>
          </v-tooltip>
        </template>

        <template #item.impact="{ item }">
          <span class="impact-value">{{ item.impact }}/5</span>
        </template>

        <template #item.severity="{ item }">
          <v-chip
            :class="getSeverityClass(item.severity)"
            size="x-small"
            label
          >
            {{ getSeverityLabel(item.severity) }}
          </v-chip>
        </template>
      </v-data-table>
    </div>

    <v-dialog v-model="detailsDialog" max-width="680">
      <v-card v-if="selectedRisk">
        <v-card-title class="d-flex align-center justify-space-between">
          <span class="text-subtitle-1">Detalhes do Risco</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="detailsDialog = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pt-4">
          <div class="detail-grid">
            <div class="detail-block detail-description">
              <p class="detail-label">Descrição</p>
              <p class="detail-value">{{ selectedRisk.description }}</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Probabilidade</p>
              <p class="detail-value">{{ selectedRisk.probability }}%</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Impacto</p>
              <p class="detail-value">{{ selectedRisk.impact }}/5</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Severidade</p>
              <v-chip :class="getSeverityClass(selectedRisk.severity)" size="small" label>
                {{ getSeverityLabel(selectedRisk.severity) }}
              </v-chip>
            </div>

            <div class="detail-block detail-status">
              <p class="detail-label">Status</p>
              <v-select
                :model-value="selectedRisk.status"
                :items="['identificado', 'mitigando', 'resolvido', 'aceito']"
                density="comfortable"
                variant="outlined"
                hide-details
                @update:model-value="updateStatusFromDialog"
              />
            </div>

            <div class="detail-block detail-mitigation">
              <p class="detail-label">Plano de Mitigação</p>
              <p class="detail-value">{{ selectedRisk.mitigationPlan || 'Sem plano definido' }}</p>
            </div>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" color="primary" @click="$emit('select-risk', selectedRisk)">
            Editar Mitigação
          </v-btn>
          <v-btn variant="text" color="error" @click="deleteFromDialog">
            Excluir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-empty-state
      v-if="risks.length === 0"
      icon="mdi-shield-check"
      title="Nenhum risco identificado"
      text="Clique em 'Avaliar Riscos' para gerar uma análise automática"
      class="mt-4"
    />
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'

interface Risk {
  _id: string
  projectId: string
  description: string
  probability: number
  impact: number
  severity: 'baixa' | 'média' | 'alta'
  mitigationPlan: string
  status: 'identificado' | 'mitigando' | 'resolvido' | 'aceito'
  createdAt: string
}

defineProps<{
  risks: Risk[]
  assessing: boolean
}>()

const emit = defineEmits<{
  assess: []
  'select-risk': [risk: Risk]
  'update-status': [payload: { riskId: string; status: string }]
  'delete-risk': [riskId: string]
}>()

const detailsDialog = ref(false)
const selectedRisk = ref<Risk | null>(null)


const compactHeaders = [
  { title: 'Risco', key: 'description', width: '60%' },
  { title: 'Impacto', key: 'impact', width: '20%' },
  { title: 'Severidade', key: 'severity', width: '20%' },
]

const visibleHeaders = computed(() => (compactHeaders))

const openRiskDetails = (risk: Risk) => {
  selectedRisk.value = risk
  detailsDialog.value = true
}

const handleRowClick = (_event: Event, context: any) => {
  const rowRisk = (context?.item?.raw || context?.item) as Risk | undefined
  if (!rowRisk) return
  openRiskDetails(rowRisk)
}

const updateStatusFromDialog = (status: string | null) => {
  if (!selectedRisk.value || !status) return
  selectedRisk.value.status = status as Risk['status']
  emit('update-status', { riskId: selectedRisk.value._id, status })
}

const deleteFromDialog = () => {
  if (!selectedRisk.value) return
  emit('delete-risk', selectedRisk.value._id)
  detailsDialog.value = false
}

const getSeverityClass = (severity: string) => {
  const map: Record<string, string> = {
    baixa: 'bg-success',
    média: 'bg-warning',
    alta: 'bg-error',
  }
  return map[severity] || 'bg-grey'
}

const getSeverityLabel = (severity: string) => {
  const map: Record<string, string> = {
    baixa: '🟢 Baixa',
    média: '🟡 Média',
    alta: '🔴 Alta',
  }
  return map[severity] || severity
}
</script>

<style scoped>
.risk-register-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
}

.risk-table {
  font-size: 0.75rem;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.risk-table :deep(table) {
  width: 100%;
  table-layout: auto;
}

.risk-table :deep(th),
.risk-table :deep(td) {
  white-space: nowrap;
  padding: 0.18rem 0.35rem !important;
}

.risk-table :deep(tbody tr) {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
  transform-origin: center;
}

.risk-table :deep(tbody tr:hover) {
  transform: scale(1.01);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  background-color: rgba(33, 150, 243, 0.04);
}

.risk-table :deep(th:first-child),
.risk-table :deep(td:first-child) {
  white-space: normal;
  max-width: 220px;
}

.risk-table :deep(th:nth-child(2)),
.risk-table :deep(td:nth-child(2)) {
  max-width: 90px;
}

.risk-table :deep(th:nth-child(3)),
.risk-table :deep(td:nth-child(3)) {
  max-width: 90px;
}

.status-select {
  min-width: 100px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.action-buttons :deep(.v-btn) {
  min-width: 24px;
  padding: 0.1rem 0.25rem;
}

.risk-link {
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  padding: 0;
  max-width: 190px;
  width: 100%;
}

.risk-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: normal;
  max-width: 190px;
}

.risk-link:hover {
  text-decoration: underline;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.detail-block {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 0.75rem;
}

.detail-description,
.detail-status,
.detail-mitigation {
  grid-column: span 2;
}

.detail-label {
  font-size: 0.78rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 0 0 0.35rem 0;
}

.detail-value {
  margin: 0;
  white-space: pre-wrap;
}
</style>
