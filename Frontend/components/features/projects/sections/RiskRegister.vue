<template>
  <v-sheet class="risk-register" elevation="0" color="transparent">
    <div class="section-header">
      <h4 class="section-title">⚠️ Registro de Riscos</h4>
      <v-btn
        size="small"
        variant="outlined"
        @click="assessRisks"
        :loading="loading"
      >
        Avaliar Riscos
      </v-btn>
    </div>

    <!-- Tabela de Riscos -->
    <v-data-table
      v-if="risks.length > 0"
      :headers="headers"
      :items="risks"
      class="risk-table"
      density="compact"
      item-key="_id"
    >
      <!-- Severidade (Prob × Impact) -->
      <template #item.severity="{ item }">
        <v-chip
          :class="getSeverityClass(item.severity)"
          size="small"
          label
        >
          {{ getSeverityLabel(item.severity) }}
        </v-chip>
      </template>

      <!-- Status -->
      <template #item.status="{ item }">
        <v-select
          :model-value="item.status"
          :items="['identificado', 'mitigando', 'resolvido', 'aceito']"
          density="compact"
          variant="outlined"
          size="small"
          @update:model-value="updateRiskStatus(item._id, $event)"
        />
      </template>

      <!-- Ações -->
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-pencil"
          size="x-small"
          variant="text"
          @click="editRisk(item)"
        />
        <v-btn
          icon="mdi-delete"
          size="x-small"
          variant="text"
          color="error"
          @click="deleteRisk(item._id)"
        />
      </template>
    </v-data-table>

    <!-- Sem riscos -->
    <v-empty-state
      v-else
      icon="mdi-shield-check"
      title="Nenhum risco identificado"
      text="Clique em 'Avaliar Riscos' para gerar uma análise automática"
      class="mt-4"
    />

    <!-- Dialog: Editar Plano de Mitigação -->
    <v-dialog v-model="editDialog" max-width="600">
      <v-card>
        <v-card-title>
          Plano de Mitigação
        </v-card-title>
        <v-card-text>
          <div class="risk-detail mb-4">
            <p class="font-weight-bold">{{ selectedRisk?.description }}</p>
            <p class="text-caption text-grey">
              Probabilidade: {{ selectedRisk?.probability }}% | 
              Impacto: {{ selectedRisk?.impact }}/5
            </p>
          </div>

          <v-textarea
            v-model="mitigationPlan"
            label="Plano de Mitigação"
            placeholder="Descreva como mitigar este risco..."
            rows="6"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancelar</v-btn>
          <v-btn
            variant="tonal"
            color="primary"
            @click="saveMitigationPlan"
            :loading="savingPlan"
          >
            Salvar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Ref } from 'vue'

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

const props = defineProps<{
  projectId: string
}>()

const risks: Ref<Risk[]> = ref([])
const loading = ref(false)
const editDialog = ref(false)
const savingPlan = ref(false)
const selectedRisk: Ref<Risk | null> = ref(null)
const mitigationPlan = ref('')

const headers = [
  { title: 'Risco', key: 'description', width: '35%' },
  { title: 'Prob %', key: 'probability', width: '12%' },
  { title: 'Impacto', key: 'impact', width: '12%' },
  { title: 'Severidade', key: 'severity', width: '15%' },
  { title: 'Status', key: 'status', width: '15%' },
  { title: 'Ações', key: 'actions', width: '11%', sortable: false },
]

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

const assessRisks = async () => {
  loading.value = true
  try {
    const response = await $fetch<Risk[]>(`/api/projects/${props.projectId}/assess-risks`, {
      method: 'POST',
      body: {
        projectDescription: 'Analisar riscos do projeto utilizando LLM',
      },
    })
    risks.value = response
  } catch (error) {
    console.error('Erro ao avaliar riscos:', error)
  } finally {
    loading.value = false
  }
}

const editRisk = (risk: Risk) => {
  selectedRisk.value = risk
  mitigationPlan.value = risk.mitigationPlan || ''
  editDialog.value = true
}

const saveMitigationPlan = async () => {
  if (!selectedRisk.value) return
  savingPlan.value = true
  try {
    await $fetch<void>(`/api/projects/${props.projectId}/risks/${selectedRisk.value._id}`, {
      method: 'PATCH',
      body: { mitigationPlan: mitigationPlan.value },
    })
    selectedRisk.value.mitigationPlan = mitigationPlan.value
    editDialog.value = false
  } catch (error) {
    console.error('Erro ao salvar plano:', error)
  } finally {
    savingPlan.value = false
  }
}

const updateRiskStatus = async (riskId: string, newStatus: string) => {
  try {
    await $fetch<void>(`/api/projects/${props.projectId}/risks/${riskId}`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    const risk = risks.value.find(r => r._id === riskId)
    if (risk) risk.status = newStatus as Risk['status']
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
  }
}

const deleteRisk = async (riskId: string) => {
  try {
    await $fetch<void>(`/api/projects/${props.projectId}/risks/${riskId}`, {
      method: 'DELETE',
    })
    risks.value = risks.value.filter(r => r._id !== riskId)
  } catch (error) {
    console.error('Erro ao deletar risco:', error)
  }
}

onMounted(async () => {
  try {
    const response = await $fetch<Risk[]>(`/api/projects/${props.projectId}/risks`)
    risks.value = response || []
  } catch (error) {
    console.error('Erro ao carregar riscos:', error)
  }
})
</script>

<style scoped>
.risk-register {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem;
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
  font-size: 0.85rem;
}

.risk-detail {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
}

.risk-detail p {
  margin: 0.25rem 0;
}
</style>
