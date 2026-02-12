<template>
  <v-dialog v-model="isOpen" max-width="900" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>🔄 Geração Interativa de Micro-Tarefas</span>
        <v-btn icon="mdi-close" size="small" variant="text" @click="handleCancel" />
      </v-card-title>

      <v-divider />

      <!-- Progress Overview -->
      <v-card-text class="pb-2">
        <div class="d-flex align-center justify-space-between mb-3">
          <div>
            <div class="text-subtitle-2">Progresso: {{ currentIndex }} / {{ totalLeafs }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ accumulatedHours.toFixed(1) }}h geradas de {{ totalBudgetHours.toFixed(1) }}h
            </div>
          </div>
          <v-chip :color="statusColor" size="small" variant="tonal">
            {{ statusText }}
          </v-chip>
        </div>

        <v-progress-linear
          :model-value="progressPercentage"
          :color="statusColor"
          height="8"
          rounded
          class="mb-3"
        />

        <!-- Leaf Nodes List -->
        <v-list density="compact" class="mb-3" style="max-height: 200px; overflow-y: auto;">
          <v-list-item
            v-for="(leaf, idx) in leafNodes"
            :key="idx"
            :class="{
              'bg-primary-lighten-5': idx === currentIndex,
              'bg-success-lighten-5': idx < currentIndex,
            }"
          >
            <template #prepend>
              <v-icon
                :icon="
                  idx < currentIndex
                    ? 'mdi-check-circle'
                    : idx === currentIndex
                    ? 'mdi-loading mdi-spin'
                    : 'mdi-circle-outline'
                "
                :color="
                  idx < currentIndex
                    ? 'success'
                    : idx === currentIndex
                    ? 'primary'
                    : 'grey-lighten-1'
                "
                size="small"
              />
            </template>
            <v-list-item-title class="text-caption">{{ leaf.path }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ leaf.node.estimatedHours }}h → 
              {{ leaf.generatedTasks ? leaf.generatedTasks.length : '?' }} tasks
              {{ leaf.generatedHours ? `(${leaf.generatedHours.toFixed(1)}h)` : '' }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-divider />

      <!-- Current Leaf Details -->
      <v-card-text v-if="currentLeaf && currentGeneratedResult" style="max-height: 400px; overflow-y: auto;">
        <div class="mb-3">
          <h3 class="text-subtitle-1 mb-1">📦 {{ currentLeaf.node.name }}</h3>
          <p class="text-caption text-medium-emphasis mb-2">{{ currentLeaf.path }}</p>
          
          <v-alert 
            :type="budgetAlertType" 
            density="compact" 
            variant="tonal" 
            class="mb-3"
            :prominent="differencePercentage > 50"
          >
            <div class="text-caption">
              <strong>Orçamento pacote:</strong> {{ currentLeaf.node.estimatedHours }}h<br>
              <strong>Horas geradas:</strong> {{ currentGeneratedResult.generatedHours.toFixed(1) }}h
              ({{ currentGeneratedResult.pomodorosGenerated }} pomodoros)<br>
              <strong>Diferença:</strong>
              <span :class="differenceClass">
                {{ ((currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours) >= 0 ? '+' : '') }}
                {{ (currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours).toFixed(1) }}h
                ({{ differencePercentage.toFixed(0) }}%)
              </span>
              <div v-if="differencePercentage > 20" class="mt-2 font-weight-bold">
                ⚠️ Detalhamento revelou discrepância de estimativa. Use "Resolver discrepância".
              </div>
            </div>
          </v-alert>

          <h4 class="text-subtitle-2 mb-2">Micro-tarefas geradas ({{ currentGeneratedResult.tasks.length }}):</h4>
          <v-list density="compact" class="task-preview-list">
            <v-list-item v-for="(task, idx) in currentGeneratedResult.tasks" :key="idx" class="mb-1">
              <template #prepend>
                <v-chip size="x-small" :color="getPriorityColor(task.priority)" class="mr-2">
                  P{{ task.priority }}
                </v-chip>
              </template>
              <v-list-item-title class="text-caption">{{ task.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ task.pomodorosPlanned }} 🍅 • {{ task.microTaskType }} • {{ task.cognitiveMode }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>

      <v-divider />

      <!-- Actions -->
      <v-card-actions class="justify-space-between pa-4">
        <v-btn
          variant="text"
          color="error"
          prepend-icon="mdi-close"
          @click="handleCancel"
          :disabled="processing"
        >
          Cancelar Tudo
        </v-btn>

        <div class="d-flex gap-2">
          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="outlined"
            color="warning"
            prepend-icon="mdi-refresh"
            @click="handleRegenerate"
            :disabled="processing"
          >
            Regenerar
          </v-btn>

          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="outlined"
            color="secondary"
            prepend-icon="mdi-lightning-bolt"
            @click="openModelSelectionDialog"
            :disabled="processing"
          >
            Modelo Forte
          </v-btn>

          <v-btn
            v-if="currentGeneratedResult && differencePercentage > 20 && !isLastLeaf"
            variant="flat"
            color="info"
            prepend-icon="mdi-scale-balance"
            @click="openResolutionDialog"
            :disabled="processing"
          >
            Resolver discrepância
          </v-btn>
          
          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-check"
            @click="handleApproveAndContinue"
            :loading="processing"
          >
            Aprovar e Continuar
          </v-btn>

          <v-btn
            v-if="isLastLeaf && currentGeneratedResult"
            variant="flat"
            color="success"
            prepend-icon="mdi-content-save"
            @click="handleSaveAll"
            :loading="processing"
          >
            Salvar Todas ({{ approvedTasks.length }} tasks)
          </v-btn>
        </div>
      </v-card-actions>
      <!-- Model Selection Dialog -->
      <v-dialog v-model="modelSelectionDialogOpen" max-width="500">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>⚡ Regenerar com Modelo Forte</span>
            <v-btn icon="mdi-close" size="small" variant="text" @click="modelSelectionDialogOpen = false" />
          </v-card-title>

          <v-divider />

          <v-card-text>
            <p class="text-caption text-medium-emphasis mb-4">
              Selecione um modelo mais forte para regenerar as micro-tarefas com melhor qualidade e precisão.
            </p>

            <v-radio-group v-model="selectedModel" density="compact">
              <v-radio
                value="gemini-2.5-flash"
                label="Gemini 2.5 Flash (⚡ Recomendado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-3">
                Modelo balanceado com boa qualidade e velocidade.
              </div>

              <v-radio
                value="gemini-3-flash-preview"
                label="Gemini 3 Flash Preview (🚀 Mais Avançado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-3">
                Novo modelo experimental com melhor compreensão.
              </div>

              <v-radio
                value="gemini-2.5-flash-lite"
                label="Gemini 2.5 Flash Lite (⚡ Rápido)"
              />
              <div class="text-caption text-medium-emphasis ml-7">
                Versão leve, mais rápida mas com menos capacidade.
              </div>
            </v-radio-group>
          </v-card-text>

          <v-divider />

          <v-card-actions class="justify-end pa-4">
            <v-btn variant="text" @click="modelSelectionDialogOpen = false" :disabled="processing">
              Cancelar
            </v-btn>

            <v-btn
              color="primary"
              variant="flat"
              :loading="processing"
              @click="regenerateWithModel"
            >
              Regenerar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <!-- Resolution Dialog (re-baseline / audit / simplify) -->
      <v-dialog v-model="resolutionDialogOpen" max-width="760">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>⚖️ Resolver discrepância</span>
            <v-btn icon="mdi-close" size="small" variant="text" @click="resolutionDialogOpen = false" />
          </v-card-title>

          <v-divider />

          <v-card-text>
            <div v-if="currentGeneratedResult && currentLeaf" class="text-caption">
              <div><strong>Pacote:</strong> {{ currentLeaf.node.name }}</div>
              <div><strong>Orçado (WBS):</strong> {{ currentLeaf.node.estimatedHours }}h</div>
              <div><strong>Detalhado (micro-tarefas):</strong> {{ currentGeneratedResult.generatedHours.toFixed(1) }}h ({{ currentGeneratedResult.pomodorosGenerated }} 🍅)</div>
              <div><strong>Diferença:</strong> {{ differencePercentage.toFixed(0) }}%</div>
            </div>

            <v-divider class="my-3" />

            <v-radio-group v-model="resolutionMode" density="compact">
              <v-radio
                value="rebaseline"
                label="Atualizar estimativa do pacote (re-baseline)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-2">
                Recomendado quando o detalhamento revelou complexidade real (bottom-up vence).
              </div>

              <v-radio
                value="audit"
                label="Auditar com IA (gold plating vs subestimado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-2">
                Pede à IA para justificar a discrepância e sugerir ação.
              </div>

              <v-radio
                value="simplify"
                label="Simplificar escopo para caber na estimativa atual"
              />
              <div class="text-caption text-medium-emphasis ml-7">
                Corta/reduz tarefas de menor prioridade até caber (mudança explícita de escopo).
              </div>
            </v-radio-group>

            <v-alert
              v-if="auditResult"
              type="info"
              variant="tonal"
              density="compact"
              class="mt-3"
            >
              <div class="text-caption">
                <strong>Diagnóstico:</strong> {{ auditResult.diagnosis }}<br>
                <strong>Justificativa:</strong> {{ auditResult.rationale }}<br>
                <strong>Sugestão:</strong> {{ auditResult.suggestedAction }}
                <span v-if="auditResult.suggestedEstimatedHours"> — {{ auditResult.suggestedEstimatedHours }}h</span>
              </div>
            </v-alert>
          </v-card-text>

          <v-divider />

          <v-card-actions class="justify-end pa-4">
            <v-btn variant="text" @click="resolutionDialogOpen = false" :disabled="resolutionProcessing">
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

            <v-btn
              color="success"
              variant="flat"
              :loading="resolutionProcessing"
              @click="applyResolution"
            >
              Aplicar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { useNuxtApp } from '#app'

type WBSNode = {
  _id?: string
  name: string
  description?: string
  level: number
  estimatedHours: number
  children?: WBSNode[]
}

type LeafNode = {
  node: WBSNode
  path: string
  level: number
  generatedTasks?: any[]
  generatedHours?: number
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object as PropType<any>, default: null },
  wbsNodes: { type: Array as PropType<WBSNode[]>, default: () => [] },
  preferences: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'complete', 'cancel'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const leafNodes = ref<LeafNode[]>([])
const currentIndex = ref(0)
const currentGeneratedResult = ref<any>(null)
const processing = ref(false)
const approvedTasks = ref<any[]>([])
const accumulatedHours = ref(0)

const resolutionDialogOpen = ref(false)
const resolutionMode = ref<'rebaseline' | 'audit' | 'simplify'>('rebaseline')
const resolutionProcessing = ref(false)
const auditResult = ref<any>(null)

const modelSelectionDialogOpen = ref(false)
const selectedModel = ref<string>('gemini-2.5-flash')

// When discrepancy is very large, run audit automatically.
const autoAuditThresholdPct = 60

const wbsUpdates = ref<
  Array<{ nodeId?: string; path: string; oldEstimatedHours: number; newEstimatedHours: number; reason: string }>
>([])

const totalLeafs = computed(() => leafNodes.value.length)
const currentLeaf = computed(() => leafNodes.value[currentIndex.value])
const isLastLeaf = computed(() => currentIndex.value === totalLeafs.value - 1)
const progressPercentage = computed(() => 
  totalLeafs.value > 0 ? (currentIndex.value / totalLeafs.value) * 100 : 0
)

const totalBudgetHours = computed(() => 
  leafNodes.value.reduce((sum, leaf) => sum + (leaf.node.estimatedHours || 0), 0)
)

const statusColor = computed(() => {
  if (processing.value) return 'primary'
  if (currentIndex.value === totalLeafs.value) return 'success'
  return 'info'
})

const statusText = computed(() => {
  if (processing.value) return 'Gerando...'
  if (currentIndex.value === totalLeafs.value) return 'Concluído'
  if (currentIndex.value === 0) return 'Pronto para começar'
  return 'Em progresso'
})

const differencePercentage = computed(() => {
  if (!currentGeneratedResult.value || !currentLeaf.value) return 0
  const budget = currentLeaf.value.node.estimatedHours
  const generated = currentGeneratedResult.value.generatedHours
  return budget > 0 ? ((generated - budget) / budget) * 100 : 0
})

const differenceClass = computed(() => {
  const diff = differencePercentage.value
  if (diff > 50) return 'text-error font-weight-bold text-h6'
  if (diff > 20) return 'text-error font-weight-bold'
  if (diff > 10) return 'text-warning'
  if (diff < -10) return 'text-info'
  return 'text-success'
})

const budgetAlertType = computed(() => {
  const diff = differencePercentage.value
  if (diff > 50) return 'error'
  if (diff > 20) return 'warning'
  return 'info'
})

function getPriorityColor(priority: number) {
  const colors = { 1: 'error', 2: 'warning', 3: 'info', 4: 'success' }
  return colors[priority as keyof typeof colors] || 'grey'
}

function summarizeTasks(tasks: any[]) {
  const pomodoros = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 1), 0)
  return {
    pomodoros,
    hours: pomodoros * 0.5,
  }
}

function roundToHalfHour(hours: number) {
  return Math.max(0, Math.round(hours * 2) / 2)
}

function pruneByPriority(tasks: any[], targetPomodoros: number) {
  const working = [...tasks].map((t) => ({ ...t }))
  working.sort((a, b) => {
    const pa = Number(a.priority) || 4
    const pb = Number(b.priority) || 4
    if (pa !== pb) return pb - pa // menor prioridade primeiro
    return (Number(b.pomodorosPlanned) || 1) - (Number(a.pomodorosPlanned) || 1)
  })

  let total = summarizeTasks(working).pomodoros
  if (total <= targetPomodoros) {
    return { tasks: working, changed: false, reason: 'Dentro do orçamento' }
  }

  let idx = 0
  while (total > targetPomodoros && working.length > 0) {
    const task = working[idx % working.length]
    if ((task.pomodorosPlanned || 1) > 1) {
      task.pomodorosPlanned -= 1
      total -= 1
      idx++
      continue
    }

    if (working.length > 1) {
      total -= task.pomodorosPlanned || 1
      working.splice(idx % working.length, 1)
    } else {
      break
    }
  }

  return { tasks: working, changed: true, reason: 'Podado pelas menores prioridades' }
}

function normalizeTaskKey(name: string): string {
  const raw = String(name || '').trim().toLowerCase()
  const hasDuolingo = /\bduolingo\b/.test(raw)

  if (hasDuolingo) {
    // Canonicalize Duolingo-style tasks so we can dedupe obvious repetitions like:
    // - "Completar Lições 1-5 do Duolingo" appearing with different pomodoros/types
    // - variants like "Revisar e Praticar Lições 6-10 do Duolingo"
    const duolingoRange = raw.match(/li[cç][oõ]es\s*(\d+)\s*[-–]\s*(\d+)/i)
    if (duolingoRange) {
      return `duolingo:lessons:${duolingoRange[1]}-${duolingoRange[2]}`
    }

    const duolingoUnit = raw.match(/unidade\s*(\d+)/i)
    if (duolingoUnit) {
      return `duolingo:unit:${duolingoUnit[1]}`
    }

    const genericLessons = raw.match(/\b(\d+)\s*li[cç][oõ]es\b/i)
    if (genericLessons) {
      return `duolingo:lessons:count:${genericLessons[1]}`
    }
  }

  // Remove common suffixes like "(1/3)", "(2/10)", etc.
  const withoutCounters = raw.replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g, '').trim()
  // Strip diacritics + punctuation, collapse whitespace
  const noMarks = withoutCounters.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Remove pure numbers to reduce near-duplicate variants like "Lições 1-5" vs "Lições 6-10"
  // ONLY for non-Duolingo keys (Duolingo already handled above).
  const noNumbers = noMarks.replace(/\b\d+\b/g, ' ')

  const cleaned = noNumbers.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned
}

function dedupeRepeatedTasks(tasks: any[]) {
  const kept: any[] = []
  const byKey = new Map<string, any>()
  let removed = 0

  for (const t of tasks || []) {
    const key = normalizeTaskKey(String(t?.name || ''))
    if (!key) {
      kept.push(t)
      continue
    }

    const existing = byKey.get(key)
    if (!existing) {
      const clone = { ...t }
      byKey.set(key, clone)
      kept.push(clone)
      continue
    }

    // Merge duplicates: keep the one with higher importance (lower priority number),
    // and keep the max pomodoros to avoid accidentally shrinking scope.
    removed += 1
    const pExisting = Number(existing?.priority ?? 4)
    const pIncoming = Number(t?.priority ?? 4)
    if (pIncoming < pExisting) {
      existing.priority = pIncoming
    }
    const pomExisting = Number(existing?.pomodorosPlanned ?? 1)
    const pomIncoming = Number(t?.pomodorosPlanned ?? 1)
    existing.pomodorosPlanned = Math.max(1, Math.min(6, Math.max(pomExisting, pomIncoming)))

    // Prefer more "actionable" microTaskType when duplicates collapse.
    const rankType = (type: any): number => {
      const v = String(type || '').trim().toLowerCase()
      // Higher rank wins
      if (v === 'practice') return 5
      if (v === 'produce') return 4
      if (v === 'test') return 3
      if (v === 'consolidate') return 2
      if (v === 'prepare') return 1
      return 0
    }
    const existingRank = rankType(existing?.microTaskType)
    const incomingRank = rankType(t?.microTaskType)
    if (incomingRank > existingRank) {
      existing.microTaskType = t?.microTaskType
    }
  }

  return { tasks: kept, removed }
}

async function openResolutionDialog() {
  // Regra de tolerância: <= 20% sugerir re-baseline
  resolutionMode.value = differencePercentage.value > 20 ? 'audit' : 'rebaseline'
  resolutionDialogOpen.value = true

  // Auto-audit for large discrepancies (no need for user to click).
  if (!auditResult.value && differencePercentage.value >= autoAuditThresholdPct) {
    await runAudit()
  }
}

async function runAudit() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  auditResult.value = null
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
      leafNode: currentLeaf.value.node,
      nodePath: currentLeaf.value.path,
      generatedHours: currentGeneratedResult.value.generatedHours,
      tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
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

function applyRebaseline(newHours: number, reason: string) {
  if (!currentLeaf.value || !currentGeneratedResult.value) return
  const oldHours = Number(currentLeaf.value.node.estimatedHours || 0)
  const rounded = roundToHalfHour(newHours)
  currentLeaf.value.node.estimatedHours = rounded
  leafNodes.value[currentIndex.value].node.estimatedHours = rounded

  wbsUpdates.value.push({
    nodeId: currentLeaf.value.node._id,
    path: currentLeaf.value.path,
    oldEstimatedHours: oldHours,
    newEstimatedHours: rounded,
    reason,
  })
}

function applyDedupeOnly() {
  if (!currentGeneratedResult.value) return
  const before = currentGeneratedResult.value.tasks || []
  const deduped = dedupeRepeatedTasks(before)
  const summaryAfter = summarizeTasks(deduped.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: deduped.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: deduped.removed,
  }
  leafNodes.value[currentIndex.value].generatedTasks = deduped.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours
}

async function applyAuditSuggestion() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  try {
    if (!auditResult.value) {
      await runAudit()
    }
    if (!auditResult.value) return

    // Explicit rule requested: when diagnosis is mixed => dedupe repeated tasks + re-baseline estimate.
    if (auditResult.value.diagnosis === 'mixed') {
      applyDedupeOnly()
      const suggested = Number(
        auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
      )
      const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
      const target = Math.max(suggested, bottomUp)
      applyRebaseline(target, 'Auditoria IA (mixed): dedupe + re-baseline')
      resolutionDialogOpen.value = false
      return
    }

    // For other diagnoses, follow suggestedAction.
    if (auditResult.value.suggestedAction === 'rebaseline') {
      const suggested = Number(
        auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
      )
      const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
      applyRebaseline(Math.max(suggested, bottomUp), `Auditoria IA: ${String(auditResult.value.diagnosis || 'n/a')}`)
      resolutionDialogOpen.value = false
      return
    }
    if (auditResult.value.suggestedAction === 'simplify') {
      const suggestedHours = Number(auditResult.value.suggestedEstimatedHours)
      if (Number.isFinite(suggestedHours) && suggestedHours > 0) {
        applySimplifyToTargetHours(suggestedHours, 'Auditoria IA: simplify (novo orçamento do pacote)')
      } else {
        applySimplifyToBudget()
      }
      resolutionDialogOpen.value = false
      return
    }
  } finally {
    resolutionProcessing.value = false
  }
}

function applySimplifyToBudget() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return

  const budgetHours = Number(currentLeaf.value.node.estimatedHours || 0)
  const targetPomodoros = Math.round(budgetHours * 2)
  const tasks = currentGeneratedResult.value.tasks || []

  // Always dedupe before pruning so we don't waste budget on repeated tasks.
  const deduped = dedupeRepeatedTasks(tasks)
  const adjusted = pruneByPriority(deduped.tasks, targetPomodoros)
  const summaryAfter = summarizeTasks(adjusted.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: adjusted.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + (deduped.removed || 0),
  }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours
}

function applySimplifyToTargetHours(targetHours: number, estimateUpdateReason?: string) {
  if (!currentGeneratedResult.value || !currentLeaf.value) return

  const hours = Math.max(0, Number(targetHours || 0))
  const targetPomodoros = Math.round(hours * 2)
  const tasks = currentGeneratedResult.value.tasks || []

  const deduped = dedupeRepeatedTasks(tasks)
  const adjusted = pruneByPriority(deduped.tasks, targetPomodoros)
  const summaryAfter = summarizeTasks(adjusted.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: adjusted.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + (deduped.removed || 0),
  }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours

  if (estimateUpdateReason) {
    applyRebaseline(hours, estimateUpdateReason)
  }
}

async function applyResolution() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  try {
    if (resolutionMode.value === 'rebaseline') {
      applyRebaseline(currentGeneratedResult.value.generatedHours, 'Re-baseline (bottom-up)')
      resolutionDialogOpen.value = false
      return
    }

    if (resolutionMode.value === 'audit') {
      if (!auditResult.value) {
        await runAudit()
      }
      if (!auditResult.value) return

      // If audit says mixed, apply dedupe of repeated tasks first (gold plating symptom)
      if (auditResult.value.diagnosis === 'mixed') {
        applyDedupeOnly()
      }

      if (auditResult.value.suggestedAction === 'rebaseline') {
        const suggested = Number(
          auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
        )
        // Keep estimate at least as big as the (possibly deduped) bottom-up total
        const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
        const target = Math.max(suggested, bottomUp)
        applyRebaseline(target, `Auditoria IA: ${String(auditResult.value.diagnosis || 'n/a')}`)
        resolutionDialogOpen.value = false
        return
      }

      if (auditResult.value.suggestedAction === 'simplify') {
        // For mixed+simple, keep dedupe if applied above, then simplify.
        const suggestedHours = Number(auditResult.value.suggestedEstimatedHours)
        if (Number.isFinite(suggestedHours) && suggestedHours > 0) {
          applySimplifyToTargetHours(suggestedHours, 'Auditoria IA: simplify (novo orçamento do pacote)')
        } else {
          applySimplifyToBudget()
        }
        resolutionDialogOpen.value = false
        return
      }

      // fallback: apenas fechar
      resolutionDialogOpen.value = false
      return
    }

    if (resolutionMode.value === 'simplify') {
      applySimplifyToBudget()
      resolutionDialogOpen.value = false
      return
    }
  } finally {
    resolutionProcessing.value = false
  }
}

async function initializeLeafNodes() {
  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/leaf-nodes`, {
      nodes: props.wbsNodes,
    })
    
    leafNodes.value = response.data.leafNodes
    currentIndex.value = 0
    approvedTasks.value = []
    accumulatedHours.value = 0
    
    console.log(`📋 ${leafNodes.value.length} pacotes identificados`)
    
    // Auto-start first generation
    await generateCurrentLeaf()
  } catch (error: any) {
    console.error('Erro ao inicializar leafs:', error)
    alert('Erro ao preparar conversão interativa')
  } finally {
    processing.value = false
  }
}

async function generateCurrentLeaf() {
  if (!currentLeaf.value) return

  processing.value = true
  currentGeneratedResult.value = null
  auditResult.value = null
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(
      `/projects/${props.project._id}/wbs/generate-tasks-for-leaf`,
      {
        leafNode: currentLeaf.value.node,
        nodePath: currentLeaf.value.path,
        preferences: props.preferences,
        saveTasks: false, // Preview only
      }
    )

    currentGeneratedResult.value = response.data
    
    // Update leaf with generated data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    
    console.log(`✅ ${response.data.tasks.length} tasks geradas para "${currentLeaf.value.node.name}"`)

    // Auto-audit when discrepancy is big.
    if (differencePercentage.value >= autoAuditThresholdPct) {
      try {
        const auditResp = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
          leafNode: currentLeaf.value.node,
          nodePath: currentLeaf.value.path,
          generatedHours: currentGeneratedResult.value.generatedHours,
          tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
            name: t.name,
            pomodorosPlanned: t.pomodorosPlanned,
            priority: t.priority,
            microTaskType: t.microTaskType,
            themeTag: t.themeTag,
            contextTag: t.contextTag,
            cognitiveMode: t.cognitiveMode,
          })),
        })
        auditResult.value = auditResp.data
      } catch (e) {
        console.warn('Auto-auditoria falhou:', e)
      }
    }
  } catch (error: any) {
    console.error('Erro ao gerar tasks:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
  } finally {
    processing.value = false
  }
}

async function handleRegenerate() {
  if (!confirm('Regenerar as micro-tarefas para este pacote?')) return
  await generateCurrentLeaf()
}

function openModelSelectionDialog() {
  modelSelectionDialogOpen.value = true
}

async function regenerateWithModel() {
  if (!currentLeaf.value) return

  processing.value = true
  currentGeneratedResult.value = null
  auditResult.value = null
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(
      `/projects/${props.project._id}/wbs/generate-tasks-for-leaf`,
      {
        leafNode: currentLeaf.value.node,
        nodePath: currentLeaf.value.path,
        preferences: {
          ...props.preferences,
          modelOverride: selectedModel.value,
        },
        saveTasks: false, // Preview only
      }
    )

    currentGeneratedResult.value = response.data
    
    // Update leaf with generated data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    
    console.log(`✅ ${response.data.tasks.length} tasks geradas com ${selectedModel.value}`)

    modelSelectionDialogOpen.value = false

    // Auto-audit quando discrepância é grande
    if (differencePercentage.value >= autoAuditThresholdPct) {
      try {
        const auditResp = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
          leafNode: currentLeaf.value.node,
          nodePath: currentLeaf.value.path,
          generatedHours: currentGeneratedResult.value.generatedHours,
          tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
            name: t.name,
            pomodorosPlanned: t.pomodorosPlanned,
            priority: t.priority,
            microTaskType: t.microTaskType,
            themeTag: t.themeTag,
            contextTag: t.contextTag,
            cognitiveMode: t.cognitiveMode,
          })),
        })
        auditResult.value = auditResp.data
      } catch (e) {
        console.warn('Auto-auditoria falhou:', e)
      }
    }
  } catch (error: any) {
    console.error('Erro ao gerar tasks com modelo:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
    modelSelectionDialogOpen.value = false
  } finally {
    processing.value = false
  }
}

async function handleApproveAndContinue() {
  if (!currentGeneratedResult.value) return

  // Add to approved list
  approvedTasks.value.push(...currentGeneratedResult.value.tasks)
  accumulatedHours.value += currentGeneratedResult.value.generatedHours

  // Move to next
  currentIndex.value++
  currentGeneratedResult.value = null

  // Generate next if not last
  if (!isLastLeaf.value) {
    await generateCurrentLeaf()
  }
}

async function handleSaveAll() {
  if (approvedTasks.value.length === 0) {
    alert('Nenhuma task aprovada para salvar')
    return
  }

  const totalApprovedHours = accumulatedHours.value + (currentGeneratedResult.value?.generatedHours || 0)
  const budgetExceeded = totalApprovedHours - totalBudgetHours.value
  const exceedPercentage = totalBudgetHours.value > 0 ? (budgetExceeded / totalBudgetHours.value) * 100 : 0

  const confirmMsg = `
Salvar todas as ${approvedTasks.value.length} micro-tarefas aprovadas?

💰 Orçamento WBS: ${totalBudgetHours.value.toFixed(1)}h
✅ Horas aprovadas: ${totalApprovedHours.toFixed(1)}h
📊 Diferença: ${budgetExceeded >= 0 ? '+' : ''}${budgetExceeded.toFixed(1)}h (${exceedPercentage >= 0 ? '+' : ''}${exceedPercentage.toFixed(0)}%)

${exceedPercentage > 20 ? '⚠️ ATENÇÃO: Extrapolação significativa do orçamento!' : ''}
  `.trim()

  if (!confirm(confirmMsg)) return

  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    
    // Approve last leaf tasks if exists
    const finalTasks = [...approvedTasks.value]
    if (currentGeneratedResult.value) {
      finalTasks.push(...currentGeneratedResult.value.tasks)
    }

    // Save all approved tasks
    const savePromises = finalTasks.map((taskData: any) =>
      $api.post(`/tasks`, taskData)
    )

    await Promise.all(savePromises)

    console.log(`✅ ${finalTasks.length} tasks salvas com sucesso`)
    
    emit('complete', {
      totalTasks: finalTasks.length,
      totalHours: totalApprovedHours,
      budgetHours: totalBudgetHours.value,
      wbsUpdates: wbsUpdates.value,
    })
    
    isOpen.value = false
  } catch (error: any) {
    console.error('Erro ao salvar tasks:', error)
    alert(`Erro ao salvar tasks: ${error?.response?.data?.message || error.message}`)
  } finally {
    processing.value = false
  }
}

function handleCancel() {
  if (approvedTasks.value.length > 0) {
    if (!confirm(`Cancelar? ${approvedTasks.value.length} tasks aprovadas serão descartadas.`)) {
      return
    }
  }
  
  emit('cancel')
  isOpen.value = false
}

watch(isOpen, (newVal) => {
  if (newVal) {
    initializeLeafNodes()
  }
})
</script>

<style scoped>
.task-preview-list {
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: 4px;
  padding: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.05);
}
</style>
