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
        <template v-if="feedbackFields.length">
          <div class="feedback-fields">
            <div
              v-for="field in feedbackFields"
              :key="field.key"
              class="feedback-field"
              :class="{ 'feedback-field-next-step': field.key === 'suggestion' || field.key === 'nextStep' }"
            >
              <div class="feedback-field-label">{{ field.label }}</div>
              <div class="feedback-field-value">{{ field.value }}</div>
            </div>
          </div>
        </template>

        <template v-else>
          <p>{{ rawFeedbackText }}</p>
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

type FeedbackField = {
  key: string
  label: string
  value: string
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

const parseFeedbackObject = (input: string): Record<string, unknown> | null => {
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

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }

      if (typeof parsed === 'string') {
        try {
          const reparsed = JSON.parse(parsed)
          if (reparsed && typeof reparsed === 'object' && !Array.isArray(reparsed)) {
            return reparsed as Record<string, unknown>
          }
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

const feedbackObject = computed<Record<string, unknown> | null>(() => {
  return parseFeedbackObject(rawFeedbackText.value)
})

const labelMap: Record<string, string> = {
  celebration: 'Celebracao',
  validation: 'Validacao',
  question: 'Pergunta',
  suggestion: 'Proximo passo recomendado',
  praise: 'Reconhecimento',
  learning: 'Aprendizado',
  nextStep: 'Proximo passo recomendado',
  finalText: 'Resumo final',
}

const orderedKeys = [
  'celebration',
  'validation',
  'question',
  'suggestion',
  'praise',
  'learning',
  'nextStep',
  'finalText',
]

const humanizeKey = (key: string) => {
  if (!key) return 'Campo'
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

const formatFieldValue = (value: unknown): string => {
  if (typeof value === 'string') return normalizeValue(decodeEscapedText(value))
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const feedbackFields = computed<FeedbackField[]>(() => {
  const obj = feedbackObject.value
  if (!obj) return []

  const entries = Object.entries(obj)
  const priority = new Map(orderedKeys.map((k, i) => [k, i]))

  return entries
    .map(([key, value]) => {
      return {
        key,
        label: labelMap[key] || humanizeKey(key),
        value: formatFieldValue(value),
      }
    })
    .filter((field) => field.value)
    .sort((a, b) => {
      const aIdx = priority.has(a.key) ? (priority.get(a.key) as number) : Number.MAX_SAFE_INTEGER
      const bIdx = priority.has(b.key) ? (priority.get(b.key) as number) : Number.MAX_SAFE_INTEGER
      if (aIdx !== bIdx) return aIdx - bIdx
      return a.label.localeCompare(b.label)
    })
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
  padding: 1.25rem 1rem;
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
  max-height: 440px;
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
