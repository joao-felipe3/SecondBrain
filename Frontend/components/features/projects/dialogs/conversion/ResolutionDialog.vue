<template>
  <v-dialog :model-value="modelValue" max-width="760" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>⚖️ Resolver discrepância</span>
        <v-btn icon="mdi-close" size="small" variant="text" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <div v-if="currentGeneratedResult && currentLeaf" class="text-caption mb-2">
          <div><strong>Pacote:</strong> {{ currentLeaf.node.name }}</div>
          <div><strong>Orçado (WBS):</strong> {{ currentLeaf.node.estimatedHours }}h</div>
          <div>
            <strong>Detalhado (micro-tarefas):</strong>
            {{ currentGeneratedResult.generatedHours.toFixed(1) }}h
            ({{ currentGeneratedResult.pomodorosGenerated }} 🍅)
          </div>
          <div><strong>Diferença:</strong> {{ differencePercentage.toFixed(0) }}%</div>
        </div>

        <v-divider class="my-3" />

        <v-radio-group v-model="resolutionMode" density="compact">
          <v-radio value="rebaseline" label="Atualizar estimativa do pacote (re-baseline)" />
          <div class="text-caption text-medium-emphasis ml-7 mb-2">
            Recomendado quando o detalhamento revelou complexidade real (bottom-up vence).
          </div>

          <v-radio value="audit" label="Auditar com IA (gold plating vs subestimado)" />
          <div class="text-caption text-medium-emphasis ml-7 mb-2">
            Pede à IA para justificar a discrepância e sugerir ação.
          </div>

          <v-radio value="simplify" label="Simplificar escopo para caber na estimativa atual" />
          <div class="text-caption text-medium-emphasis ml-7">
            Corta/reduz tarefas de menor prioridade até caber (mudança explícita de escopo).
          </div>
        </v-radio-group>

        <v-alert v-if="auditResult" type="info" variant="tonal" density="compact" class="mt-3">
          <div class="text-caption">
            <strong>Diagnóstico:</strong> {{ auditResult.diagnosis }}<br />
            <strong>Justificativa:</strong> {{ auditResult.rationale }}<br />
            <strong>Sugestão:</strong> {{ auditResult.suggestedAction }}
            <span v-if="auditResult.suggestedEstimatedHours"> — {{ auditResult.suggestedEstimatedHours }}h</span>
          </div>
        </v-alert>
      </v-card-text>

      <v-divider />

      <v-card-actions class="justify-end pa-4">
        <v-btn variant="text" :disabled="resolutionProcessing" @click="emit('update:modelValue', false)">
          Cancelar
        </v-btn>

        <v-btn
          v-if="resolutionMode === 'audit'"
          color="primary"
          variant="tonal"
          :loading="resolutionProcessing"
          @click="runAudit"
        >
          Rodar auditoria
        </v-btn>

        <v-btn
          v-if="resolutionMode === 'audit' && auditResult"
          color="info"
          variant="flat"
          :loading="resolutionProcessing"
          @click="applyAuditSuggestion"
        >
          Aplicar sugestão da auditoria
        </v-btn>

        <v-btn color="success" variant="flat" :loading="resolutionProcessing" @click="applyResolution">
          Aplicar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PropType } from 'vue'
import { useNuxtApp } from '#app'
import type { LeafNode, ResolutionPayload } from '~/composables/features/useConversionHelpers'

const AUTO_AUDIT_THRESHOLD_PCT = 60

const props = defineProps({
  modelValue:             { type: Boolean, required: true },
  projectId:              { type: String, required: true },
  currentLeaf:            { type: Object as PropType<LeafNode | null>, default: null },
  currentGeneratedResult: { type: Object as PropType<any | null>, default: null },
  differencePercentage:   { type: Number, required: true },
})

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'resolved': [payload: ResolutionPayload]
}>()

const resolutionMode = ref<'rebaseline' | 'audit' | 'simplify'>('rebaseline')
const resolutionProcessing = ref(false)
const auditResult = ref<any>(null)

watch(() => props.modelValue, (opened) => {
  if (opened) {
    resolutionMode.value = props.differencePercentage > 20 ? 'audit' : 'rebaseline'
    auditResult.value = null
    if (props.differencePercentage >= AUTO_AUDIT_THRESHOLD_PCT) {
      runAudit()
    }
  }
})

async function runAudit() {
  if (!props.currentGeneratedResult || !props.currentLeaf) return
  resolutionProcessing.value = true
  auditResult.value = null
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.projectId}/wbs/audit-leaf-discrepancy`, {
      leafNode: props.currentLeaf.node,
      nodePath: props.currentLeaf.path,
      generatedHours: props.currentGeneratedResult.generatedHours,
      tasks: (props.currentGeneratedResult.tasks || []).map((t: any) => ({
        name: t.name,
        pomodorosPlanned: t.pomodorosPlanned,
        priority: t.priority,
        microTaskType: t.microTaskType,
        themeTag: t.themeTag,
        contextTag: t.contextTag,
        cognitiveMode: t.cognitiveMode,
      })),
    })
    auditResult.value = response.data
  } catch (error: any) {
    console.error('Erro ao auditar discrepância:', error)
    alert(`Erro ao auditar: ${error?.response?.data?.message || error.message}`)
  } finally {
    resolutionProcessing.value = false
  }
}

function buildAuditResolution(): ResolutionPayload | null {
  if (!auditResult.value || !props.currentGeneratedResult) return null

  const genHours = Number(props.currentGeneratedResult.generatedHours || 0)
  const suggested = Number(auditResult.value.suggestedEstimatedHours || genHours)
  const finalHours = Math.max(suggested, genHours)
  const diagReason = `Auditoria IA: ${String(auditResult.value.diagnosis || 'n/a')}`

  if (auditResult.value.diagnosis === 'mixed') {
    const action = auditResult.value.suggestedAction
    if (action === 'simplify' && Number.isFinite(suggested) && suggested > 0) {
      return { type: 'dedupe-then-simplify-to-target', targetHours: suggested, reason: 'Auditoria IA (mixed): dedupe + simplify' }
    }
    return { type: 'dedupe-then-rebaseline', hours: finalHours, reason: 'Auditoria IA (mixed): dedupe + re-baseline' }
  }

  if (auditResult.value.suggestedAction === 'rebaseline') {
    return { type: 'rebaseline', hours: finalHours, reason: diagReason }
  }

  if (auditResult.value.suggestedAction === 'simplify') {
    if (Number.isFinite(suggested) && suggested > 0) {
      return { type: 'simplify-to-target', targetHours: suggested, reason: 'Auditoria IA: simplify' }
    }
    return { type: 'simplify-to-budget' }
  }

  return null
}

async function applyAuditSuggestion() {
  resolutionProcessing.value = true
  try {
    if (!auditResult.value) await runAudit()
    if (!auditResult.value) return
    const resolution = buildAuditResolution()
    if (resolution) {
      emit('resolved', resolution)
      emit('update:modelValue', false)
    }
  } finally {
    resolutionProcessing.value = false
  }
}

async function applyResolution() {
  if (!props.currentGeneratedResult || !props.currentLeaf) return
  resolutionProcessing.value = true
  try {
    const genHours = Number(props.currentGeneratedResult.generatedHours || 0)

    if (resolutionMode.value === 'rebaseline') {
      emit('resolved', { type: 'rebaseline', hours: genHours, reason: 'Re-baseline (bottom-up)' })
      emit('update:modelValue', false)
      return
    }

    if (resolutionMode.value === 'simplify') {
      emit('resolved', { type: 'simplify-to-budget' })
      emit('update:modelValue', false)
      return
    }

    if (resolutionMode.value === 'audit') {
      if (!auditResult.value) await runAudit()
      if (!auditResult.value) return
      const resolution = buildAuditResolution()
      if (resolution) {
        emit('resolved', resolution)
        emit('update:modelValue', false)
      }
    }
  } finally {
    resolutionProcessing.value = false
  }
}
</script>
