<template>
  <div class="feedback-tab">
    <div v-if="!task?.isConcluded" class="feedback-section">
      <div class="feedback-header">
        <h1>Feedback de Conclusao</h1>
        <span class="feedback-badge badge-disabled">Bloqueado</span>
      </div>
      <div class="feedback-empty">
        <p>Tarefa deve estar concluida para gerar feedback</p>
      </div>
    </div>

    <div v-else-if="feedback?.feedback" class="feedback-section">
      <div class="feedback-header">
        <h1>Feedback de Conclusao</h1>
        <span class="feedback-badge">Gerado</span>
      </div>

      <div class="feedback-content">
        <template v-if="structuredFeedback">
          <p class="feedback-final">{{ displayFinalText }}</p>

          <div class="feedback-fields">
            <div v-if="structuredFeedback.praise" class="feedback-field">
              <div class="feedback-field-label">Reconhecimento</div>
              <div class="feedback-field-value">{{ structuredFeedback.praise }}</div>
            </div>
            <div v-if="structuredFeedback.learning" class="feedback-field">
              <div class="feedback-field-label">Aprendizado</div>
              <div class="feedback-field-value">{{ structuredFeedback.learning }}</div>
            </div>
            <div v-if="structuredFeedback.nextStep" class="feedback-field feedback-field-next-step">
              <div class="feedback-field-label">Proximo passo recomendado</div>
              <div class="feedback-field-value">{{ structuredFeedback.nextStep }}</div>
            </div>
          </div>
        </template>

        <template v-else>
          <p>{{ displayFinalText }}</p>
        </template>
      </div>

      <div class="feedback-footer">
        <p>{{ formatDate(feedback.createdAt) }}</p>
        <button @click="regenerateFeedback" :disabled="generating" class="btn-regenerate">
          {{ generating ? 'Gerando...' : 'Gerar Novo' }}
        </button>
      </div>
    </div>

    <div v-else class="feedback-section">
      <div class="feedback-header">
        <h1>Feedback de Conclusao</h1>
        <span class="feedback-badge badge-pending">Pendente</span>
      </div>
      <div class="feedback-empty">
        <p>Nenhum feedback gerado ainda para esta tarefa</p>
        <button @click="generateFeedback" :disabled="generating" class="btn-generate">
          {{ generating ? 'Gerando...' : 'Gerar Feedback' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="feedback-error">
      <p>{{ error }}</p>
    </div>

    <div v-if="loading" class="feedback-loading">
      <p>Carregando feedback...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '~/composables/api/useApi'

interface Props {
  task?: any
  projects?: any[]
}

type StructuredFeedback = {
  praise?: string
  learning?: string
  nextStep?: string
  finalText?: string
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})

const loading = ref(false)
const generating = ref(false)
const error = ref<string | null>(null)
const feedback = ref<any>(null)

const rawFeedbackText = computed(() => String(feedback.value?.feedback ?? ''))

const normalizeValue = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const decodeEscapedText = (value: string): string => {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()
}

const extractEmbeddedFields = (value: string): Partial<StructuredFeedback> => {
  const src = String(value ?? '')
  if (!src) return {}

  const nextStepMatch = src.match(/"nextStep"\s*:\s*"([\s\S]*?)"\s*,\s*"finalText"/i)
  const finalTextMatch = src.match(/"finalText"\s*:\s*"([\s\S]*?)"\s*}\s*$/i)

  const nextStep = nextStepMatch?.[1] ? decodeEscapedText(nextStepMatch[1]) : ''
  const finalText = finalTextMatch?.[1] ? decodeEscapedText(finalTextMatch[1]) : ''

  return {
    nextStep: normalizeValue(nextStep),
    finalText: normalizeValue(finalText),
  }
}

const parseStructuredFeedback = (input: string): StructuredFeedback | null => {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  const candidates: string[] = []
  candidates.push(raw)

  const withoutFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (withoutFence && withoutFence !== raw) candidates.push(withoutFence)

  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1).trim())
  }

  const toStructured = (obj: any): StructuredFeedback | null => {
    if (!obj || typeof obj !== 'object') return null
    const praise = normalizeValue(obj.praise)
    const learning = normalizeValue(obj.learning)
    let nextStep = normalizeValue(obj.nextStep)
    let finalText = normalizeValue(obj.finalText)

    // Some legacy payloads serialize an inner pseudo-JSON inside finalText.
    if ((!nextStep || !finalText) && finalText.includes('"nextStep"')) {
      const embedded = extractEmbeddedFields(finalText)
      nextStep = nextStep || normalizeValue(embedded.nextStep)
      finalText = normalizeValue(embedded.finalText) || finalText
    }

    // If finalText still looks like raw key/value noise, keep only message lines.
    if (finalText.includes('"finalText"') || finalText.includes('"nextStep"')) {
      const embedded = extractEmbeddedFields(finalText)
      nextStep = nextStep || normalizeValue(embedded.nextStep)
      finalText = normalizeValue(embedded.finalText) || finalText
    }

    if (!praise && !learning && !nextStep && !finalText) return null
    return { praise, learning, nextStep, finalText }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const structured = toStructured(parsed)
      if (structured) return structured

      if (typeof parsed === 'string') {
        try {
          const reparsed = JSON.parse(parsed)
          const restructured = toStructured(reparsed)
          if (restructured) return restructured
        } catch {
          // ignore and continue
        }
      }
    } catch {
      // ignore and continue
    }
  }

  return null
}

const structuredFeedback = computed<StructuredFeedback | null>(() => {
  return parseStructuredFeedback(rawFeedbackText.value)
})

const displayFinalText = computed(() => {
  if (structuredFeedback.value?.finalText) return structuredFeedback.value.finalText
  return rawFeedbackText.value
})

const formatDate = (date: Date | string | undefined) => {
  if (!date) return 'Data desconhecida'
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR')
}

const loadFeedback = async () => {
  if (!props.task?._id || !props.task.isConcluded) {
    feedback.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const { get } = useApi(`/tasks/${props.task._id}/completion-feedback`)
    const { data, error: apiError } = await get()

    if (apiError) {
      if (apiError.statusCode !== 404) {
        error.value = apiError.message || 'Falha ao carregar feedback'
      }
      return
    }

    feedback.value = data
  } catch (err: any) {
    error.value = err?.message || 'Erro desconhecido'
  } finally {
    loading.value = false
  }
}

const generateFeedback = async () => {
  if (!props.task?._id) return

  generating.value = true
  error.value = null

  try {
    const { post } = useApi(`/tasks/${props.task._id}/completion-feedback`)
    const { error: apiError } = await post({})

    if (apiError) {
      error.value = apiError.message || 'Falha ao gerar feedback'
      return
    }

    await loadFeedback()
  } catch (err: any) {
    error.value = err?.message || 'Erro desconhecido'
  } finally {
    generating.value = false
  }
}

const regenerateFeedback = async () => {
  await generateFeedback()
}

watch(
  () => props.task?._id,
  () => {
    loadFeedback()
  },
)

onMounted(() => {
  loadFeedback()
})
</script>

<style scoped>
.feedback-tab {
  width: 100%;
  height: 100%;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
  gap: 10px;
}

.feedback-section {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  margin-top: 0.5rem;
}

.feedback-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.feedback-header h1 {
  font-size: 22px;
  margin: 0;
  line-height: 1;
}

.feedback-badge {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 6px;
  background: #a6794a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.feedback-badge.badge-pending {
  background: #d4a574;
}

.feedback-badge.badge-disabled {
  background: #9f8b78;
}

.feedback-empty {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.feedback-content {
  padding: 12px 14px;
  max-height: 280px;
  overflow-y: auto;
}

.feedback-content p,
.feedback-field-value {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.35;
  font-size: 15px;
}

.feedback-final {
  margin-bottom: 10px;
}

.feedback-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feedback-field {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.76);
  padding: 8px 10px;
}

.feedback-field-next-step {
  border-color: rgba(166, 121, 74, 0.45);
  background: rgba(212, 165, 116, 0.16);
}

.feedback-field-label {
  font-size: 11px;
  color: #a6794a;
  margin-bottom: 4px;
}

.feedback-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.feedback-footer p {
  margin: 0;
  color: #a6794a;
  font-size: 13px;
}

.feedback-error {
  padding: 10px 12px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 6px;
  background: rgba(254, 242, 242, 0.9);
}

.feedback-error p {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.feedback-loading {
  padding: 8px 2px;
}

.feedback-loading p {
  margin: 0;
  color: #a6794a;
  font-size: 13px;
}

.btn-generate,
.btn-regenerate {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-family: 'Irish Grover', cursive;
  font-size: 13px;
  background: #a6794a;
  color: #fff;
  transition: background 0.12s ease;
}

.btn-generate:hover:not(:disabled),
.btn-regenerate:hover:not(:disabled) {
  background: #b8934a;
}

.btn-generate:disabled,
.btn-regenerate:disabled {
  background: #d1c0a3;
  cursor: not-allowed;
}

.feedback-content::-webkit-scrollbar,
.feedback-tab::-webkit-scrollbar {
  width: 6px;
}

.feedback-content::-webkit-scrollbar-track,
.feedback-tab::-webkit-scrollbar-track {
  background: transparent;
}

.feedback-content::-webkit-scrollbar-thumb,
.feedback-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.feedback-content::-webkit-scrollbar-thumb:hover,
.feedback-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
