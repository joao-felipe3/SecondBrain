<template>
  <v-dialog v-model="isOpen" width="800" persistent>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>🤖 Planejamento com IA - {{ phaseTitle }}</span>
        <v-btn icon="mdi-close" variant="text" @click="handleClose" />
      </v-card-title>

      <v-card-text class="pa-6">
        <!-- Fase 1: Perguntas Catchball (uma por vez) -->
        <div v-if="phase === 1">
          <div v-if="questions.length > 0">
            <!-- Indicador de progresso -->
            <v-progress-linear
              :model-value="((currentQuestionIndex + 1) / questions.length) * 100"
              color="primary"
              height="6"
              class="mb-4"
            />
            <p class="text-caption text-medium-emphasis mb-4">
              Pergunta {{ currentQuestionIndex + 1 }} de {{ questions.length }}
            </p>

            <!-- Pergunta atual -->
            <div class="mb-4">
              <p class="font-weight-medium text-body-1 mb-3">
                {{ currentQuestionIndex + 1 }}. {{ questions[currentQuestionIndex] }}
              </p>
              
              <!-- Sugestão da IA (se disponível) -->
              <v-alert
                v-if="suggestedAnswer && !answerEdited"
                type="info"
                variant="tonal"
                class="mb-3"
              >
                <div class="d-flex align-center justify-space-between">
                  <div class="d-flex align-center flex-grow-1">
                    <v-icon class="mr-2">mdi-lightbulb-on</v-icon>
                    <div class="flex-grow-1">
                      <strong>Sugestão da IA:</strong>
                      <p class="mb-0 mt-1">{{ suggestedAnswer }}</p>
                    </div>
                  </div>
                  <v-btn
                    icon="mdi-refresh"
                    variant="text"
                    size="small"
                    @click="regenerateSuggestion"
                    :loading="loading"
                    title="Gerar nova sugestão"
                  />
                </div>
              </v-alert>

              <!-- Campo de resposta -->
              <v-textarea
                v-model="currentAnswer"
                label="Sua resposta"
                placeholder="Digite sua resposta ou edite a sugestão acima..."
                variant="outlined"
                rows="4"
                auto-grow
                @input="answerEdited = true"
              />
            </div>

            <!-- Botões de navegação -->
            <div class="d-flex justify-space-between">
              <v-btn
                v-if="currentQuestionIndex > 0"
                @click="previousQuestion"
                variant="text"
              >
                <v-icon start>mdi-arrow-left</v-icon>
                Anterior
              </v-btn>
              <v-spacer />
              <v-btn
                v-if="currentQuestionIndex < questions.length - 1"
                @click="nextQuestion"
                color="primary"
                :disabled="!currentAnswer.trim()"
              >
                Próxima
                <v-icon end>mdi-arrow-right</v-icon>
              </v-btn>
              <v-btn
                v-else
                @click="finishQuestions"
                color="primary"
                :disabled="!currentAnswer.trim()"
              >
                Gerar Objetivo SMART
                <v-icon end>mdi-check</v-icon>
              </v-btn>
            </div>
          </div>
        </div>

        <!-- Fase 2: Objetivo SMART -->
        <div v-if="phase === 2">
          <v-alert type="success" variant="tonal" class="mb-4">
            ✅ Objetivo SMART gerado com sucesso!
          </v-alert>

          <div v-if="smartObjective">
            <div class="smart-card mb-3">
              <div class="smart-label">📌 Resumo Executivo</div>
              <p class="smart-content">{{ smartObjective.summary }}</p>
            </div>

            <div class="smart-card mb-3">
              <div class="smart-label">🎯 Específico (Specific)</div>
              <p class="smart-content">{{ smartObjective.specific }}</p>
            </div>

            <div class="smart-card mb-3">
              <div class="smart-label">📊 Mensurável (Measurable)</div>
              <p class="smart-content">{{ smartObjective.measurable }}</p>
            </div>

            <div class="smart-card mb-3">
              <div class="smart-label">✅ Atingível (Achievable)</div>
              <p class="smart-content">{{ smartObjective.achievable }}</p>
            </div>

            <div class="smart-card mb-3">
              <div class="smart-label">💡 Relevante (Relevant)</div>
              <p class="smart-content">{{ smartObjective.relevant }}</p>
            </div>

            <div class="smart-card mb-3">
              <div class="smart-label">⏰ Temporal (Time-bound)</div>
              <p class="smart-content">{{ smartObjective.temporal }}</p>
            </div>

            <div v-if="smartObjective.risks && smartObjective.risks.length > 0" class="smart-card">
              <div class="smart-label">⚠️ Riscos Identificados</div>
              <ul class="risks-list">
                <li v-for="(risk, index) in smartObjective.risks" :key="index">
                  {{ risk }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="64" />
          <p class="mt-4 text-body-1">{{ loadingMessage }}</p>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          @click="handleClose"
          variant="text"
        >
          Cancelar
        </v-btn>
        <v-btn
          v-if="phase === 2"
          @click="saveAndClose"
          color="success"
          :disabled="loading"
        >
          Salvar e Concluir
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNuxtApp } from '#app'

interface SmartObjective {
  specific: string
  measurable: string
  achievable: string
  relevant: string
  temporal: string
  summary: string
  risks: string[]
}

interface Props {
  modelValue: boolean
  projectId: string
  projectName: string
  projectDescription: string
  shortTermGoal?: string
  midTermGoal?: string
  longTermGoal?: string
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'objective-generated', objective: SmartObjective): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const phase = ref(1)
const loading = ref(false)
const loadingMessage = ref('')

// Fase 1: Perguntas
const questions = ref<string[]>([])
const answers = ref<string[]>([])
const conversationId = ref('')
const currentQuestionIndex = ref(0)
const currentAnswer = ref('')
const suggestedAnswer = ref('')
const answerEdited = ref(false)

// Fase 2: Objetivo SMART (antes era Fase 3)
const smartObjective = ref<SmartObjective | null>(null)

// Carrega perguntas automaticamente quando o dialog abre
watch(() => props.modelValue, (newValue) => {
  if (newValue && phase.value === 1 && questions.value.length === 0) {
    generateQuestions()
  }
})

// Carrega sugestão de resposta quando muda de pergunta
watch(currentQuestionIndex, async (newIndex) => {
  if (newIndex >= 0 && newIndex < questions.value.length) {
    // Restaura resposta salva se existir
    currentAnswer.value = answers.value[newIndex] || ''
    answerEdited.value = !!answers.value[newIndex]
    
    // Gera sugestão se ainda não tem resposta
    if (!answers.value[newIndex]) {
      await loadSuggestedAnswer()
    } else {
      suggestedAnswer.value = ''
    }
  }
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const phaseTitle = computed(() => {
  switch (phase.value) {
    case 1: return 'Refinamento (Catchball)'
    case 2: return 'Objetivo SMART'
    default: return ''
  }
})

const canProceed = computed(() => {
  if (phase.value === 1) return currentAnswer.value.trim().length > 0
  return false
})

async function nextQuestion() {
  // Salva resposta atual
  answers.value[currentQuestionIndex.value] = currentAnswer.value
  
  // Avança para próxima pergunta
  if (currentQuestionIndex.value < questions.value.length - 1) {
    currentQuestionIndex.value++
  }
}

async function previousQuestion() {
  // Salva resposta atual
  answers.value[currentQuestionIndex.value] = currentAnswer.value
  
  // Volta para pergunta anterior
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  }
}

async function finishQuestions() {
  // Salva última resposta
  answers.value[currentQuestionIndex.value] = currentAnswer.value
  
  // Gera objetivo SMART
  await generateSmartObjective()
}

async function loadSuggestedAnswer() {
  loading.value = true
  loadingMessage.value = 'Gerando sugestão de resposta...'
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.projectId}/suggest-answer`, {
      conversationId: conversationId.value,
      questionIndex: currentQuestionIndex.value,
      question: questions.value[currentQuestionIndex.value],
      previousAnswers: answers.value.filter((a, i) => i < currentQuestionIndex.value && a)
    })
    
    suggestedAnswer.value = response.data.suggestedAnswer
    currentAnswer.value = response.data.suggestedAnswer
    answerEdited.value = false
  } catch (error) {
    console.error('Erro ao gerar sugestão:', error)
    suggestedAnswer.value = ''
  } finally {
    loading.value = false
  }
}

async function regenerateSuggestion() {
  // Re-gera a sugestão para a pergunta atual
  answerEdited.value = false
  await loadSuggestedAnswer()
}

async function nextPhase() {
  if (phase.value === 1) {
    await generateSmartObjective()
  }
}

function previousPhase() {
  if (phase.value > 1) {
    phase.value--
  }
}

async function generateQuestions() {
  loading.value = true
  loadingMessage.value = 'Gerando perguntas estratégicas...'

  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.projectId}/plan-with-ai`, {
      projectName: props.projectName,
      projectDescription: props.projectDescription,
      shortTermGoal: props.shortTermGoal,
      midTermGoal: props.midTermGoal,
      longTermGoal: props.longTermGoal
    })

    questions.value = response.data.questions
    conversationId.value = response.data.conversationId
    answers.value = new Array(questions.value.length).fill('')
    currentQuestionIndex.value = 0
    
    // Carrega sugestão para primeira pergunta
    await loadSuggestedAnswer()
  } catch (error) {
    console.error('Erro ao gerar perguntas:', error)
    alert('Erro ao gerar perguntas. Tente novamente.')
  } finally {
    loading.value = false
  }
}

async function generateSmartObjective() {
  loading.value = true
  loadingMessage.value = 'Gerando objetivo SMART...'

  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.projectId}/refine-objective`, {
      conversationId: conversationId.value,
      answers: answers.value
    })

    smartObjective.value = response.data.smart
    phase.value = 3
  } catch (error) {
    console.error('Erro ao gerar objetivo SMART:', error)
    alert('Erro ao gerar objetivo SMART. Tente novamente.')
  } finally {
    loading.value = false
  }
}

function saveAndClose() {
  if (smartObjective.value) {
    emit('objective-generated', smartObjective.value)
  }
  handleClose()
}

function handleClose() {
  // Reset
  phase.value = 1
  questions.value = []
  answers.value = []
  conversationId.value = ''
  smartObjective.value = null
  currentQuestionIndex.value = 0
  currentAnswer.value = ''
  suggestedAnswer.value = ''
  answerEdited.value = false
  isOpen.value = false
}
</script>

<style scoped>
.smart-card {
  background: #f8fafc;
  border-left: 4px solid #3b82f6;
  padding: 1rem;
  border-radius: 6px;
}

.smart-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: #1e293b;
  margin-bottom: 0.5rem;
}

.smart-content {
  margin: 0;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.6;
}

.risks-list {
  margin: 0;
  padding-left: 1.5rem;
  color: #475569;
  font-size: 0.9rem;
}

.risks-list li {
  margin-bottom: 0.5rem;
}
</style>
