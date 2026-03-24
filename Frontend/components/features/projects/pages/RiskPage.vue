<template>
  <v-sheet class="page-container" elevation="0" color="transparent" @click.stop>
    <v-sheet class="page left-page" elevation="0" color="transparent" @click.stop>
      <h3 class="page-title mb-4">⚠️ Registro de Riscos</h3>

      <RiskRegisterList
        v-if="project._id"
        :risks="risks"
        :assessing="assessing"
        @assess="assessRisks"
        @select-risk="selectRisk"
        @update-status="onUpdateStatus"
        @delete-risk="deleteRisk"
      />
    </v-sheet>

    <v-sheet class="page right-page" elevation="0" color="transparent" @click.stop>
      <h3 class="page-title mb-4">📊 EVM e Performance</h3>
      <EVMDashboard
        :project-id="project._id || 'default'"
        :planned-hours="project.plannedHours || 0"
      />
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import RiskRegisterList from '../sections/RiskRegisterList.vue'
import EVMDashboard from '../sections/EVMDashboard.vue'
import type { Project } from '~/models/Project'

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
  project: Project
  editing: boolean
}>()

const risks: Ref<Risk[]> = ref([])
const assessing = ref(false)
const savingPlan = ref(false)
const selectedRisk: Ref<Risk | null> = ref(null)
const mitigationPlan = ref('')

const loadRisks = async () => {
  if (!props.project?._id) return
  try {
    const response = await $fetch<Risk[]>(`/api/projects/${props.project._id}/risks`)
    risks.value = response || []

    if (selectedRisk.value) {
      const refreshedSelected = risks.value.find((risk) => risk._id === selectedRisk.value?._id) || null
      selectedRisk.value = refreshedSelected
      mitigationPlan.value = refreshedSelected?.mitigationPlan || ''
    }
  } catch (error) {
    console.error('Erro ao carregar riscos:', error)
  }
}

const assessRisks = async () => {
  if (!props.project?._id) return
  assessing.value = true
  try {
    const response = await $fetch<Risk[]>(`/api/projects/${props.project._id}/assess-risks`, {
      method: 'POST',
      body: {
        projectDescription: 'Analisar riscos do projeto utilizando LLM',
      },
    })
    risks.value = response || []
    if (risks.value.length > 0) {
      selectedRisk.value = risks.value[0]
      mitigationPlan.value = risks.value[0].mitigationPlan || ''
    }
  } catch (error) {
    console.error('Erro ao avaliar riscos:', error)
  } finally {
    assessing.value = false
  }
}

const selectRisk = (risk: Risk) => {
  selectedRisk.value = risk
  mitigationPlan.value = risk.mitigationPlan || ''
}

const saveMitigationPlan = async () => {
  if (!props.project?._id || !selectedRisk.value) return
  savingPlan.value = true
  try {
    await $fetch<void>(`/api/projects/${props.project._id}/risks/${selectedRisk.value._id}`, {
      method: 'PATCH',
      body: { mitigationPlan: mitigationPlan.value },
    })

    const index = risks.value.findIndex((risk) => risk._id === selectedRisk.value?._id)
    if (index !== -1) {
      risks.value[index].mitigationPlan = mitigationPlan.value
    }
    if (selectedRisk.value) {
      selectedRisk.value.mitigationPlan = mitigationPlan.value
    }
  } catch (error) {
    console.error('Erro ao salvar plano:', error)
  } finally {
    savingPlan.value = false
  }
}

const onUpdateStatus = async (payload: { riskId: string; status: string }) => {
  if (!props.project?._id) return
  try {
    await $fetch<void>(`/api/projects/${props.project._id}/risks/${payload.riskId}`, {
      method: 'PATCH',
      body: { status: payload.status },
    })

    const risk = risks.value.find((entry) => entry._id === payload.riskId)
    if (risk) {
      risk.status = payload.status as Risk['status']
    }
    if (selectedRisk.value?._id === payload.riskId) {
      selectedRisk.value.status = payload.status as Risk['status']
    }
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
  }
}

const deleteRisk = async (riskId: string) => {
  if (!props.project?._id) return
  try {
    await $fetch<void>(`/api/projects/${props.project._id}/risks/${riskId}`, {
      method: 'DELETE',
    })

    risks.value = risks.value.filter((risk) => risk._id !== riskId)
    if (selectedRisk.value?._id === riskId) {
      selectedRisk.value = risks.value[0] || null
      mitigationPlan.value = selectedRisk.value?.mitigationPlan || ''
    }
  } catch (error) {
    console.error('Erro ao deletar risco:', error)
  }
}

onMounted(() => {
  loadRisks()
})

watch(
  () => props.project?._id,
  () => {
    selectedRisk.value = null
    mitigationPlan.value = ''
    loadRisks()
  },
)
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
  align-items: flex-start;
}

.page {
  flex: 1;
  min-width: 0;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.left-page {
  border-right: 1px solid #e2e8f0;
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
</style>