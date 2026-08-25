<template>
  <v-dialog
    :model-value="isOpen"
    @update:model-value="handleDialogUpdate"
    max-width="600px"
    persistent
    :class="{ 'loot-drop-active': showLootDrop }"
  >
    <v-card class="completion-feedback-modal" elevation="12">
      <!-- Celebration Message Section -->
      <div v-if="loading.feedback" class="loading-section">
        <v-progress-circular indeterminate color="primary" size="48" />
        <p class="text-center mt-4">Gerando seu feedback...</p>
      </div>

      <template v-else-if="feedback">
        <!-- Header with Task Title -->
        <v-card-title class="modal-header">
          <div class="header-content">
            <span class="task-emoji">🎉</span>
            <div class="header-text">
              <h2>{{ feedback.celebration || "Tarefa Concluída!" }}</h2>
              <p class="subtitle">{{ task?.name }}</p>
            </div>
          </div>
        </v-card-title>

        <v-card-text class="modal-content">
          <!-- Validation Summary Section -->
          <section
            v-if="feedback.validation"
            class="section validation-summary"
          >
            <div class="section-header">
              <span class="section-icon">✓</span>
              <h3>Validação</h3>
            </div>
            <div class="validation-content">
              <p>{{ feedback.validation }}</p>
              <div v-if="validationMetrics" class="metrics-grid">
                <div class="metric-card">
                  <span class="metric-label">Checklist</span>
                  <span class="metric-value"
                    >{{ validationMetrics.checklistPercent }}%</span
                  >
                  <v-progress-linear
                    :value="validationMetrics.checklistPercent"
                    color="success"
                    height="4"
                    class="mt-1"
                  />
                </div>
                <div class="metric-card">
                  <span class="metric-label">Tempo Executado</span>
                  <span class="metric-value">{{
                    validationMetrics.actualTimeFormatted
                  }}</span>
                </div>
                <div class="metric-card">
                  <span class="metric-label">Tempo Esperado</span>
                  <span class="metric-value">{{
                    validationMetrics.expectedTimeFormatted
                  }}</span>
                </div>
                <div class="metric-card">
                  <span class="metric-label">Desempenho</span>
                  <span
                    class="metric-value"
                    :class="validationMetrics.performanceClass"
                  >
                    {{ validationMetrics.performance }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- Impediments Question Section -->
          <section v-if="feedback.question" class="section impediments-section">
            <div class="section-header">
              <span class="section-icon">❓</span>
              <h3>Impedimentos</h3>
            </div>
            <p class="question-text">{{ feedback.question }}</p>
            <div class="impediment-options">
              <div
                v-for="(opt, i) in impedimentOptions"
                :key="opt.key"
                class="impediment-pill"
                :class="{ selected: selectedImpedimentIndex === i }"
                @click="selectImpediment(i)"
              >
                {{ opt.label }}
              </div>
            </div>
            <v-textarea
              v-model="impedimentsAnswer"
              placeholder="Escreva aqui qualquer impedimento encontrado..."
              rows="3"
              variant="outlined"
              density="compact"
              hide-details
            />
          </section>

          <!-- Next Steps Suggestions Section -->
          <section
            v-if="suggestedSteps.length > 0"
            class="section next-steps-section"
          >
            <div class="section-header">
              <span class="section-icon">📋</span>
              <h3>Próximos Passos</h3>
            </div>
            <div class="suggestions-container">
              <div
                v-for="(step, idx) in suggestedSteps"
                :key="idx"
                class="suggestion-pill"
                :class="{ selected: selectedSteps.includes(idx) }"
                @click="toggleStep(idx)"
              >
                <span class="pill-title">{{ step.title }}</span>
                <span class="pill-description">{{ step.description }}</span>
              </div>
            </div>
          </section>

          <!-- Loot Drop Option -->
          <!-- <section v-if="!showLootDrop" class="section loot-option">
            <label class="loot-checkbox">
              <input v-model="includeLootDrop" type="checkbox" />
              <span>Incluir "loot drop" de celebração</span>
            </label>
          </section> -->
        </v-card-text>

        <!-- Loot Drop Animation -->
        <div v-if="showLootDrop" class="loot-drop-container">
          <div
            v-for="i in 15"
            :key="i"
            class="loot-drop"
            :style="getLootDropStyle(i)"
          />
        </div>

        <!-- Action Buttons -->
        <v-card-actions class="modal-actions">
          <v-btn variant="text" @click="handleClose" :disabled="saving">
            Fechar
          </v-btn>
          <v-spacer />
          <v-btn
            variant="elevated"
            color="primary"
            @click="handleConfirm"
            :loading="saving"
          >
            Confirmar conclusão + feedback
          </v-btn>
        </v-card-actions>
      </template>

      <!-- Error State -->
      <div v-else-if="error" class="error-section">
        <v-alert type="error" class="mb-4">{{ error }}</v-alert>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="handleClose">Fechar</v-btn>
        </v-card-actions>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useApiFetch } from "~/composables/useApiFetch";

interface Props {
  isOpen: boolean;
  task?: any;
}

interface Feedback {
  celebration: string;
  validation: string;
  question: string;
  suggestion?: string | SuggestedStep[];
}

interface SuggestedStep {
  title: string;
  description: string;
}

const props = defineProps<Props>();
const emit = defineEmits(["close", "confirmed"]);

const feedback = ref<Feedback | null>(null);
const suggestedSteps = ref<SuggestedStep[]>([]);
const impedimentsAnswer = ref("");
const impedimentOptions = ref([
  { key: "none", label: "Nenhum", text: "Nenhum impedimento", action: null },
  {
    key: "technical",
    label: "Técnico",
    text: "Problema técnico durante a execução",
    action: "raise-impediment",
  },
  {
    key: "dependency",
    label: "Dependência",
    text: "Aguardando dependência externa",
    action: "notify-dependency",
  },
  { key: "other", label: "Outro", text: "", action: null },
]);
const selectedImpedimentIndex = ref<number | null>(null);
const selectedSteps = ref<number[]>([]);
const includeLootDrop = ref(false);
const showLootDrop = ref(false);

const loading = ref({
  feedback: false,
});

const saving = ref(false);
const error = ref("");

const api = useApiFetch();

function toFeedbackResponse(payload: unknown): Feedback | null {
  if (!payload) return null;

  // Unwrap possible wrapper { feedback: '...string or object...' }
  let rawAny: unknown = payload;
  if (
    typeof payload === "object" &&
    "feedback" in (payload as Record<string, unknown>)
  ) {
    // @ts-ignore
    rawAny = (payload as Record<string, unknown>).feedback;
  }

  // If backend returned a JSON string (maybe double-encoded), try parsing up to 3 times
  if (typeof rawAny === "string") {
    let p: unknown = rawAny;
    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(p as string);
        if (typeof parsed === "string") {
          // still a string -> try again
          p = parsed;
          continue;
        }
        return toFeedbackResponse(parsed);
      } catch {
        // if parse fails on first attempt, try to unescape common patterns
        try {
          const unescaped = (p as string).replace(/\\"/g, '"');
          const parsed2 = JSON.parse(unescaped);
          if (typeof parsed2 === "string") {
            p = parsed2;
            continue;
          }
          return toFeedbackResponse(parsed2);
        } catch {
          // give up after attempts
        }
        return null;
      }
    }
    return null;
  }

  if (!rawAny || typeof rawAny !== "object") return null;

  const raw = rawAny as Record<string, unknown>;
  const celebration =
    typeof raw.celebration === "string" ? raw.celebration : "";
  const validation = typeof raw.validation === "string" ? raw.validation : "";
  const question = typeof raw.question === "string" ? raw.question : "";

  if (!celebration && !validation && !question) return null;

  const normalized: Feedback = {
    celebration,
    validation,
    question,
  };

  if (typeof raw.suggestion === "string") {
    normalized.suggestion = raw.suggestion;
  } else if (Array.isArray(raw.suggestion)) {
    normalized.suggestion = raw.suggestion as SuggestedStep[];
  }

  // Some responses may serialize inner JSON as a string in a single field (legacy). Try parse for main fields.
  if (!normalized.celebration && typeof raw === "object") {
    const combined = Object.values(raw).find(
      (v) => typeof v === "string" && /\{\s*"celebration"/.test(v),
    );
    if (combined && typeof combined === "string") {
      try {
        const parsedInner = JSON.parse(combined);
        return toFeedbackResponse(parsedInner);
      } catch {
        // ignore
      }
    }
  }

  return normalized;
}

// Calculate validation metrics
const validationMetrics = computed(() => {
  if (!props.task) return null;

  const checklist = props.task.checklist || [];
  const checklistPercent = Array.isArray(checklist)
    ? Math.round(
        (checklist.filter((item: any) =>
          typeof item === "object" ? item.completed : false,
        ).length /
          checklist.length) *
          100,
      ) || 0
    : 0;

  // Get actual time spent (from task tracking) - fallback to 0 if not available
  const actualTime = props.task.actualTimeSpent || 0;
  const expectedTime =
    props.task.pertExpectedMinutes || props.task.timeExpectedMinutes || 0;

  // Format times
  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  // Determine performance
  let performance = "Excelente";
  let performanceClass = "performance-excellent";

  if (expectedTime > 0) {
    const ratio = actualTime / expectedTime;
    if (ratio > 1.5) {
      performance = "Acima do esperado";
      performanceClass = "performance-slow";
    } else if (ratio > 1) {
      performance = "Um pouco acima";
      performanceClass = "performance-slightly-slow";
    } else if (ratio < 0.7) {
      performance = "Muito rápido!";
      performanceClass = "performance-fast";
    }
  }

  return {
    checklistPercent,
    actualTimeFormatted: formatMinutes(actualTime),
    expectedTimeFormatted: formatMinutes(expectedTime),
    performance,
    performanceClass,
  };
});

// Handle dialog open/close
function handleDialogUpdate(value: boolean) {
  if (!value) {
    emit("close");
  }
}

// Generate loot drop styles
function getLootDropStyle(index: number) {
  const angle = (index / 15) * Math.PI * 2;
  const distance = 100 + Math.random() * 150;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  const duration = 0.6 + Math.random() * 0.4;
  const delay = index * 0.05;

  return {
    "--x": `${x}px`,
    "--y": `${y}px`,
    "--duration": `${duration}s`,
    "--delay": `${delay}s`,
  } as any;
}

// Load feedback data
async function loadFeedback() {
  if (!props.task?._id) return;

  try {
    loading.value.feedback = true;
    error.value = "";

    // Call backend to generate feedback
    const response = await api.fetch<unknown>(
      `/tasks/${props.task._id}/completion-feedback`,
      {
        method: "POST",
        body: {
          checklistCompletion: validationMetrics.value?.checklistPercent || 0,
          timeSpent: props.task.actualTimeSpent || 0,
        },
      },
    );

    // Debug raw response for troubleshooting formats
    // eslint-disable-next-line no-console
    console.debug(
      "[CompletionFeedbackModal] raw completion-feedback response:",
      response,
    );

    const normalizedFeedback = toFeedbackResponse(response);

    if (normalizedFeedback) {
      feedback.value = normalizedFeedback;

      // If suggestion is a string, parse it or use as is
      if (normalizedFeedback.suggestion) {
        try {
          suggestedSteps.value = Array.isArray(normalizedFeedback.suggestion)
            ? normalizedFeedback.suggestion
            : typeof normalizedFeedback.suggestion === "string"
              ? JSON.parse(normalizedFeedback.suggestion)
              : [];
        } catch {
          suggestedSteps.value = [];
        }
      }
    } else {
      error.value = "Resposta de feedback em formato inválido.";
    }
  } catch (err) {
    error.value = "Erro ao gerar feedback. Tente novamente.";
    console.error("[CompletionFeedbackModal] Error loading feedback:", err);
  } finally {
    loading.value.feedback = false;
  }
}

// Toggle step selection
function toggleStep(index: number) {
  const idx = selectedSteps.value.indexOf(index);
  if (idx > -1) {
    selectedSteps.value.splice(idx, 1);
  } else {
    selectedSteps.value.push(index);
  }
}

function selectImpediment(index: number) {
  selectedImpedimentIndex.value = index;
  const opt = impedimentOptions.value[index];
  if (!opt) return;
  // If option has a predefined text, fill textarea; otherwise clear
  impedimentsAnswer.value = opt.text || "";
}

// Handle close
function handleClose() {
  resetModal();
  emit("close");
}

// Handle confirm
async function handleConfirm() {
  if (!props.task?._id) return;

  try {
    saving.value = true;

    // Persist feedback
    const feedbackPayload = {
      celebration: feedback.value?.celebration,
      validation: feedback.value?.validation,
      question: feedback.value?.question,
      impediments: impedimentsAnswer.value,
      impedimentType:
        selectedImpedimentIndex.value !== null
          ? impedimentOptions.value[selectedImpedimentIndex.value].key
          : "none",
      action:
        selectedImpedimentIndex.value !== null
          ? impedimentOptions.value[selectedImpedimentIndex.value].action
          : null,
      selectedSteps: suggestedSteps.value.filter((_, idx) =>
        selectedSteps.value.includes(idx),
      ),
    };

    await api.fetch(`/tasks/${props.task._id}/completion-feedback`, {
      method: "POST",
      body: feedbackPayload,
    });

    // Show loot drop if enabled
    if (includeLootDrop.value) {
      showLootDrop.value = true;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    emit("confirmed", feedbackPayload);
    resetModal();
  } catch (err) {
    error.value = "Erro ao salvar feedback.";
    console.error("[CompletionFeedbackModal] Error saving feedback:", err);
  } finally {
    saving.value = false;
  }
}

// Reset modal state
function resetModal() {
  feedback.value = null;
  suggestedSteps.value = [];
  impedimentsAnswer.value = "";
  selectedSteps.value = [];
  includeLootDrop.value = false;
  showLootDrop.value = false;
  error.value = "";
  loading.value.feedback = false;
}

// Watch for modal open
watch(
  () => props.isOpen,
  async (newVal) => {
    if (newVal) {
      await loadFeedback();
    } else {
      resetModal();
    }
  },
);

// Initial load
onMounted(() => {
  if (props.isOpen) {
    loadFeedback();
  }
});
</script>

<style scoped>
.completion-feedback-modal {
  background: linear-gradient(135deg, #f5f7fa 0%, #fafbfc 100%);
  border-radius: 16px;
  overflow: hidden;
}

.modal-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 24px !important;
  border: none;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.task-emoji {
  font-size: 32px;
  line-height: 1;
}

.header-text h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.header-text .subtitle {
  margin: 4px 0 0 0;
  font-size: 14px;
  opacity: 0.9;
}

.modal-content {
  padding: 24px;
  max-height: 500px;
  overflow-y: auto;
}

.section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
}

.section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-icon {
  font-size: 20px;
  line-height: 1;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

/* Validation Summary */
.validation-summary p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.metric-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  color: #999;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.performance-excellent {
  color: #10b981;
}

.performance-fast {
  color: #3b82f6;
}

.performance-slightly-slow {
  color: #f59e0b;
}

.performance-slow {
  color: #ef4444;
}

/* Impediments Section */
.impediments-section .question-text {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.impediments-section :deep(.v-textarea) {
  font-size: 13px;
}

.impediment-options {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.impediment-pill {
  padding: 6px 10px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
}

.impediment-pill.selected {
  background: linear-gradient(135deg, #667eea15, #764ba215);
  border-color: #667eea;
}

/* Next Steps Section */
.next-steps-section {
  margin-bottom: 16px;
}

.suggestions-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-pill {
  padding: 12px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 200ms ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.suggestion-pill:hover {
  border-color: #667eea;
  background: #f9fafb;
}

.suggestion-pill.selected {
  background: linear-gradient(135deg, #667eea15, #764ba215);
  border-color: #667eea;
}

.pill-title {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.pill-description {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

/* Loot Option */
.loot-option {
  margin-top: 16px;
}

.loot-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
}

.loot-checkbox input {
  cursor: pointer;
  width: 18px;
  height: 18px;
}

/* Loading & Error */
.loading-section,
.error-section {
  padding: 48px 24px;
  text-align: center;
}

.loading-section p {
  font-size: 16px;
  color: #666;
}

.error-section {
  padding: 24px;
}

/* Modal Actions */
.modal-actions {
  padding: 16px 24px;
  border-top: 1px solid rgba(102, 126, 234, 0.1);
  background: #fafbfc;
}

/* Loot Drop Container */
.loot-drop-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.loot-drop {
  position: absolute;
  width: 12px;
  height: 12px;
  background: radial-gradient(circle, #fbbf24, #f59e0b);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.6);
  animation: loot-fall var(--duration, 1s) ease-out var(--delay, 0s) forwards;
}

@keyframes loot-fall {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translate(var(--x, 0), var(--y, 0)) scale(0.3) rotate(360deg);
  }
}

/* Responsive */
@media (max-width: 600px) {
  .completion-feedback-modal {
    max-width: 100% !important;
  }

  .modal-header {
    padding: 16px !important;
  }

  .header-text h2 {
    font-size: 20px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .modal-content {
    max-height: 400px;
    padding: 16px;
  }
}

/* Dark mode support (if using Vuetify theme) */
:deep(.v-theme--dark) .completion-feedback-modal {
  background: linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%);
}

:deep(.v-theme--dark) .metric-card,
:deep(.v-theme--dark) .suggestion-pill {
  background: #2a2a3e;
  border-color: rgba(255, 255, 255, 0.1);
}

:deep(.v-theme--dark) .section-header h3,
:deep(.v-theme--dark) .metric-value,
:deep(.v-theme--dark) .pill-title {
  color: #f3f4f6;
}

:deep(.v-theme--dark) .validation-summary p,
:deep(.v-theme--dark) .question-text,
:deep(.v-theme--dark) .metric-label,
:deep(.v-theme--dark) .pill-description {
  color: #9ca3af;
}
</style>
