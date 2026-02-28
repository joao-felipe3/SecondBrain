<template>
  <v-dialog v-model="isOpen" max-width="900" persistent scrollable style="height: 95vh;">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>🔄 Geração Interativa de Micro-Tarefas</span>
        <v-btn icon="mdi-close" size="small" variant="text" @click="handleCancel" />
      </v-card-title>

      <v-divider />

      <ConversionProgressHeader
        :current-index="currentIndex"
        :total-leafs="totalLeafs"
        :accumulated-hours="accumulatedHours"
        :total-budget-hours="totalBudgetHours"
        :progress-percentage="progressPercentage"
        :status-color="statusColor"
        :status-text="statusText"
      />

      <v-divider />

      <div class="main-content-wrapper">
        <v-expand-transition>
          <div v-if="currentLeaf" class="px-4">
            <WBSTreeVisualization
              :leaf-nodes="leafNodes"
              :current-index="currentIndex"
              @leaf-clicked="openLeafDetailDialog"
              @task-clicked="openMicroTaskDialog"
            />
          </div>
        </v-expand-transition>

        <v-divider class="my-4" />

        <div class="content-grid px-4 pb-4">
          <LeafNodesList :leaf-nodes="leafNodes" :current-index="currentIndex" />
          <LeafDetailsPanel
            :current-leaf="currentLeaf"
            :current-generated-result="currentGeneratedResult"
            :difference-percentage="differencePercentage"
            :difference-class="differenceClass"
            :budget-alert-type="budgetAlertType"
            @task-clicked="openMicroTaskDialog"
          />
        </div>
      </div>

      <v-divider />

      <ConversionActions
        :current-generated-result="currentGeneratedResult"
        :is-last-leaf="isLastLeaf"
        :processing="processing"
        :difference-percentage="differencePercentage"
        :approved-tasks-count="approvedTasks.length"
        @cancel="handleCancel"
        @regenerate="handleRegenerate"
        @open-model-selection="modelSelectionDialogOpen = true"
        @open-resolution="resolutionDialogOpen = true"
        @approve-and-continue="handleApproveAndContinue"
        @save-all="handleSaveAll"
      />

      <ModelSelectionDialog
        v-model="modelSelectionDialogOpen"
        :processing="processing"
        @regenerate="regenerateWithModel"
      />

      <ResolutionDialog
        v-model="resolutionDialogOpen"
        :project-id="project._id"
        :current-leaf="currentLeaf"
        :current-generated-result="currentGeneratedResult"
        :difference-percentage="differencePercentage"
        @resolved="handleResolution"
      />

      <MicroTaskPaperDialog v-model="microTaskDialogOpen" :task="selectedMicroTask" />
      <LeafNodePaperDialog  v-model="leafDetailDialogOpen" :leaf-node="selectedLeafNode" />
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { useNuxtApp } from '#app'
import type { LeafNode, ResolutionPayload } from '~/composables/features/useConversionHelpers'
import WBSTreeVisualization   from '~/components/features/projects/visualization/WBSTreeVisualization.vue'
import ConversionProgressHeader from './conversion/ConversionProgressHeader.vue'
import LeafNodesList            from './conversion/LeafNodesList.vue'
import LeafDetailsPanel         from './conversion/LeafDetailsPanel.vue'
import ConversionActions        from './conversion/ConversionActions.vue'
import ModelSelectionDialog     from './conversion/ModelSelectionDialog.vue'
import ResolutionDialog         from './conversion/ResolutionDialog.vue'
import MicroTaskPaperDialog     from './conversion/MicroTaskPaperDialog.vue'
import LeafNodePaperDialog      from './conversion/LeafNodePaperDialog.vue'

type WBSNode = {
  _id?: string
  name: string
  description?: string
  level: number
  estimatedHours: number
  children?: WBSNode[]
}

const props = defineProps({
  modelValue:  { type: Boolean, default: false },
  project:     { type: Object as PropType<any>, default: null },
  wbsNodes:    { type: Array as PropType<WBSNode[]>, default: () => [] },
  preferences: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'complete', 'cancel'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// State
const leafNodes              = ref<LeafNode[]>([])
const currentIndex           = ref(0)
const currentGeneratedResult = ref<any>(null)
const processing             = ref(false)
const approvedTasks          = ref<any[]>([])
const accumulatedHours       = ref(0)

const modelSelectionDialogOpen = ref(false)
const resolutionDialogOpen     = ref(false)
const microTaskDialogOpen      = ref(false)
const selectedMicroTask        = ref<any>(null)
const leafDetailDialogOpen     = ref(false)
const selectedLeafNode         = ref<any>(null)

const wbsUpdates = ref<
  Array<{ nodeId?: string; path: string; oldEstimatedHours: number; newEstimatedHours: number; reason: string }>
>([])

// Computed
const totalLeafs         = computed(() => leafNodes.value.length)
const currentLeaf        = computed(() => leafNodes.value[currentIndex.value])
const isLastLeaf         = computed(() => currentIndex.value === totalLeafs.value - 1)
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
  if (currentIndex.value === totalLeafs.value) return 'Concluido'
  if (currentIndex.value === 0) return 'Pronto para comecar'
  return 'Em progresso'
})
const differencePercentage = computed(() => {
  if (!currentGeneratedResult.value || !currentLeaf.value) return 0
  const budget    = currentLeaf.value.node.estimatedHours
  const generated = currentGeneratedResult.value.generatedHours
  return budget > 0 ? ((generated - budget) / budget) * 100 : 0
})
const differenceClass = computed(() => {
  const d = differencePercentage.value
  if (d > 50) return 'text-error font-weight-bold text-h6'
  if (d > 20) return 'text-error font-weight-bold'
  if (d > 10) return 'text-warning'
  if (d < -10) return 'text-info'
  return 'text-success'
})
const budgetAlertType = computed(() => {
  const d = differencePercentage.value
  if (d > 50) return 'error'
  if (d > 20) return 'warning'
  return 'info'
})

// Task de-dupe / prune helpers
function summarizeTasks(tasks: any[]) {
  const pomodoros = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 1), 0)
  return { pomodoros, hours: pomodoros * 0.5 }
}
function roundToHalfHour(hours: number) { return Math.max(0, Math.round(hours * 2) / 2) }
function pruneByPriority(tasks: any[], targetPomodoros: number) {
  const working = [...tasks].map((t) => ({ ...t }))
  working.sort((a, b) => {
    const pa = Number(a.priority) || 4; const pb = Number(b.priority) || 4
    if (pa !== pb) return pb - pa
    return (Number(b.pomodorosPlanned) || 1) - (Number(a.pomodorosPlanned) || 1)
  })
  let total = summarizeTasks(working).pomodoros
  if (total <= targetPomodoros) return { tasks: working, changed: false, reason: 'Dentro do orcamento' }
  let idx = 0
  while (total > targetPomodoros && working.length > 0) {
    const task = working[idx % working.length]
    if ((task.pomodorosPlanned || 1) > 1) { task.pomodorosPlanned -= 1; total -= 1; idx++; continue }
    if (working.length > 1) { total -= task.pomodorosPlanned || 1; working.splice(idx % working.length, 1) } else break
  }
  return { tasks: working, changed: true, reason: 'Podado pelas menores prioridades' }
}
function normalizeTaskKey(name: string): string {
  const raw = String(name || '').trim().toLowerCase()
  const hasDuolingo = /\bduolingo\b/.test(raw)
  if (hasDuolingo) {
    const r = raw.match(/li[c][o]es\s*(\d+)\s*[-]\s*(\d+)/i)
    if (r) return `duolingo:lessons:${r[1]}-${r[2]}`
    const u = raw.match(/unidade\s*(\d+)/i); if (u) return `duolingo:unit:${u[1]}`
    const g = raw.match(/\b(\d+)\s*li[c][o]es\b/i); if (g) return `duolingo:lessons:count:${g[1]}`
  }
  return raw.replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g,'').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b\d+\b/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()
}
function dedupeRepeatedTasks(tasks: any[]) {
  const kept: any[] = []; const byKey = new Map<string, any>(); let removed = 0
  const rankType = (type: any) =>
    ({ practice:5, produce:4, test:3, consolidate:2, prepare:1 } as Record<string, number>)[String(type||'').trim().toLowerCase()] ?? 0
  for (const t of tasks || []) {
    const key = normalizeTaskKey(String(t?.name || ''))
    if (!key) { kept.push(t); continue }
    const existing = byKey.get(key)
    if (!existing) { const clone = { ...t }; byKey.set(key, clone); kept.push(clone); continue }
    removed += 1
    if (Number(t?.priority ?? 4) < Number(existing?.priority ?? 4)) existing.priority = t.priority
    existing.pomodorosPlanned = Math.max(1, Math.min(6, Math.max(Number(existing?.pomodorosPlanned ?? 1), Number(t?.pomodorosPlanned ?? 1))))
    if (rankType(t?.microTaskType) > rankType(existing?.microTaskType)) existing.microTaskType = t?.microTaskType
  }
  return { tasks: kept, removed }
}

// Mutation helpers
function applyRebaseline(newHours: number, reason: string) {
  if (!currentLeaf.value) return
  const oldHours = Number(currentLeaf.value.node.estimatedHours || 0)
  const rounded  = roundToHalfHour(newHours)
  currentLeaf.value.node.estimatedHours = rounded
  leafNodes.value[currentIndex.value].node.estimatedHours = rounded
  wbsUpdates.value.push({ nodeId: currentLeaf.value.node._id, path: currentLeaf.value.path, oldEstimatedHours: oldHours, newEstimatedHours: rounded, reason })
}
function applyDedupeOnly() {
  if (!currentGeneratedResult.value) return
  const deduped = dedupeRepeatedTasks(currentGeneratedResult.value.tasks || [])
  const summary = summarizeTasks(deduped.tasks)
  currentGeneratedResult.value = { ...currentGeneratedResult.value, tasks: deduped.tasks, generatedHours: summary.hours, pomodorosGenerated: summary.pomodoros, dedupeRemoved: deduped.removed }
  leafNodes.value[currentIndex.value].generatedTasks = deduped.tasks
  leafNodes.value[currentIndex.value].generatedHours = summary.hours
}
function applySimplifyToBudget() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  const targetPomodoros = Math.round(Number(currentLeaf.value.node.estimatedHours || 0) * 2)
  const deduped = dedupeRepeatedTasks(currentGeneratedResult.value.tasks || [])
  const adjusted = pruneByPriority(deduped.tasks, targetPomodoros)
  const summary  = summarizeTasks(adjusted.tasks)
  currentGeneratedResult.value = { ...currentGeneratedResult.value, tasks: adjusted.tasks, generatedHours: summary.hours, pomodorosGenerated: summary.pomodoros, dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + deduped.removed }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summary.hours
}
function applySimplifyToTargetHours(targetHours: number, estimateUpdateReason?: string) {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  const hours    = Math.max(0, Number(targetHours || 0))
  const deduped  = dedupeRepeatedTasks(currentGeneratedResult.value.tasks || [])
  const adjusted = pruneByPriority(deduped.tasks, Math.round(hours * 2))
  const summary  = summarizeTasks(adjusted.tasks)
  currentGeneratedResult.value = { ...currentGeneratedResult.value, tasks: adjusted.tasks, generatedHours: summary.hours, pomodorosGenerated: summary.pomodoros, dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + deduped.removed }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summary.hours
  if (estimateUpdateReason) applyRebaseline(hours, estimateUpdateReason)
}

// Resolution dispatcher
function handleResolution(payload: ResolutionPayload) {
  switch (payload.type) {
    case 'rebaseline':                     applyRebaseline(payload.hours, payload.reason); break
    case 'dedupe':                          applyDedupeOnly(); break
    case 'simplify-to-budget':             applySimplifyToBudget(); break
    case 'simplify-to-target':             applySimplifyToTargetHours(payload.targetHours, payload.reason); break
    case 'dedupe-then-rebaseline':         applyDedupeOnly(); applyRebaseline(payload.hours, payload.reason); break
    case 'dedupe-then-simplify-to-target': applyDedupeOnly(); applySimplifyToTargetHours(payload.targetHours, payload.reason); break
    case 'dedupe-then-simplify-to-budget': applyDedupeOnly(); applySimplifyToBudget(); break
  }
}

// API
async function initializeLeafNodes() {
  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/leaf-nodes`, { nodes: props.wbsNodes })
    leafNodes.value = response.data.leafNodes
    currentIndex.value = 0; approvedTasks.value = []; accumulatedHours.value = 0
    console.log(`Pacotes identificados: ${leafNodes.value.length}`)
    await generateCurrentLeaf()
  } catch (error: any) {
    console.error('Erro ao inicializar leafs:', error)
    alert('Erro ao preparar conversao interativa')
  } finally { processing.value = false }
}
async function generateCurrentLeaf() {
  if (!currentLeaf.value) return
  processing.value = true; currentGeneratedResult.value = null
  try {
    const { $api } = useNuxtApp() as any
    const prefetchLeafs = leafNodes.value
      .slice(currentIndex.value + 1, currentIndex.value + 3)
      .map((l) => ({ leafNode: l.node, nodePath: l.path }))
    const response = await $api.post(`/projects/${props.project._id}/wbs/generate-tasks-for-leaf`, {
      leafNode: currentLeaf.value.node,
      nodePath: currentLeaf.value.path,
      preferences: props.preferences,
      saveTasks: false,
      prefetchLeafs,
    })
    currentGeneratedResult.value = response.data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    console.log(`Tasks geradas: ${response.data.tasks.length} para "${currentLeaf.value.node.name}"`)
  } catch (error: any) {
    console.error('Erro ao gerar tasks:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
  } finally { processing.value = false }
}
async function regenerateWithModel(model: string) {
  if (!currentLeaf.value) return
  processing.value = true; currentGeneratedResult.value = null
  try {
    const { $api } = useNuxtApp() as any
    const prefetchLeafs = leafNodes.value
      .slice(currentIndex.value + 1, currentIndex.value + 3)
      .map((l) => ({ leafNode: l.node, nodePath: l.path }))
    const response = await $api.post(`/projects/${props.project._id}/wbs/generate-tasks-for-leaf`, {
      leafNode: currentLeaf.value.node, nodePath: currentLeaf.value.path,
      preferences: { ...props.preferences, modelOverride: model },
      saveTasks: false,
      prefetchLeafs,
    })
    currentGeneratedResult.value = response.data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    console.log(`Tasks geradas com ${model}: ${response.data.tasks.length}`)
    modelSelectionDialogOpen.value = false
  } catch (error: any) {
    console.error('Erro ao gerar tasks com modelo:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
    modelSelectionDialogOpen.value = false
  } finally { processing.value = false }
}

// User actions
async function handleRegenerate() {
  if (!confirm('Regenerar as micro-tarefas para este pacote?')) return
  await generateCurrentLeaf()
}
async function handleApproveAndContinue() {
  if (!currentGeneratedResult.value) return
  approvedTasks.value.push(...currentGeneratedResult.value.tasks)
  accumulatedHours.value += currentGeneratedResult.value.generatedHours
  const nextIndex = currentIndex.value + 1
  currentGeneratedResult.value = null

  // Generate next leaf as long as it exists (fixes skipping the last leaf).
  if (nextIndex < totalLeafs.value) {
    currentIndex.value = nextIndex
    await generateCurrentLeaf()
    return
  }

  // Completed all leafs.
  currentIndex.value = totalLeafs.value
}
async function handleSaveAll() {
  if (approvedTasks.value.length === 0) { alert('Nenhuma task aprovada para salvar'); return }
  const totalApprovedHours = accumulatedHours.value + (currentGeneratedResult.value?.generatedHours || 0)
  const budgetExceeded = totalApprovedHours - totalBudgetHours.value
  const exceedPct = totalBudgetHours.value > 0 ? (budgetExceeded / totalBudgetHours.value) * 100 : 0
  const confirmMsg = [
    `Salvar todas as ${approvedTasks.value.length} micro-tarefas aprovadas?`,
    `\nOrcamento WBS: ${totalBudgetHours.value.toFixed(1)}h`,
    `Horas aprovadas: ${totalApprovedHours.toFixed(1)}h`,
    `Diferenca: ${budgetExceeded >= 0 ? '+' : ''}${budgetExceeded.toFixed(1)}h (${exceedPct >= 0 ? '+' : ''}${exceedPct.toFixed(0)}%)`,
    exceedPct > 20 ? '\nATENCAO: Extrapolacao significativa do orcamento!' : '',
  ].join('\n').trim()
  if (!confirm(confirmMsg)) return
  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    const projectId = props.project?._id
    const finalTasks = [...approvedTasks.value]
    if (currentGeneratedResult.value) finalTasks.push(...currentGeneratedResult.value.tasks)

    const payloadTasks = finalTasks.map((taskData: any) => ({
      ...taskData,
      project: taskData?.project ?? taskData?.projectId ?? projectId,
    }))

    const bulkResp = await $api.post('/tasks/bulk', {
      tasks: payloadTasks,
      autoDependencies: {
        mode: 'heuristic-phases',
        relationship: 'FINISH_TO_START',
        reason: 'Auto: sequência WBS (InteractiveConversionDialog saveAll)',
      },
    })

    console.log(
      `Tasks salvas: ${bulkResp?.data?.insertedCount ?? finalTasks.length} | deps auto: ${bulkResp?.data?.autoDependenciesCreatedOrUpdated ?? 0}`,
    )
    emit('complete', { totalTasks: finalTasks.length, totalHours: totalApprovedHours, budgetHours: totalBudgetHours.value, wbsUpdates: wbsUpdates.value })
    isOpen.value = false
  } catch (error: any) {
    console.error('Erro ao salvar tasks:', error)
    alert(`Erro ao salvar tasks: ${error?.response?.data?.message || error.message}`)
  } finally { processing.value = false }
}
function handleCancel() {
  if (approvedTasks.value.length > 0 && !confirm(`Cancelar? ${approvedTasks.value.length} tasks aprovadas serao descartadas.`)) return
  emit('cancel'); isOpen.value = false
}
function openMicroTaskDialog(task: any)      { selectedMicroTask.value = task;     microTaskDialogOpen.value  = true }
function openLeafDetailDialog(leafNode: any) { selectedLeafNode.value  = leafNode; leafDetailDialogOpen.value = true }

watch(isOpen, (val) => { if (val) initializeLeafNodes() })
</script>

<style scoped>
.main-content-wrapper {
  max-height: calc(100vh - 340px);
  overflow-y: auto;
  overflow-x: hidden;
}
.content-grid {
  display: grid;
  grid-template-columns: 0.6fr 1.4fr;
  gap: 2rem;
  align-items: start;
}
@media (max-width: 1400px) { .content-grid { grid-template-columns: 0.5fr 1.5fr; } }
@media (max-width: 1200px) {
  .content-grid { grid-template-columns: 1fr; gap: 1.5rem; }
  .main-content-wrapper { max-height: calc(100vh - 300px); }
}
</style>