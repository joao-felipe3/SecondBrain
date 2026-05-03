<template>
  <div class="kanban-root" :class="{ locked: isLocked }">
    <div class="kanban-columns" :class="{ 'kanban-columns-hidden': isLocked }">
      <section
        v-for="col in columns"
        :key="col.status"
        class="kanban-column"
        :data-status="col.status"
        @dragenter.prevent="onDragOverColumn($event, col.status)"
        @dragover.prevent="onDragOverColumn($event, col.status)"
        @drop.prevent="onDropOnColumn($event, col.status)"
      >
        <header class="kanban-column-header">
          <span class="kanban-title">{{ col.label }}</span>
          <span class="kanban-count">{{ tasksByStatus[col.status].length }}</span>
        </header>

        <div
          class="kanban-column-body"
          :ref="(el) => setColumnBodyRef(col.status, el)"
          @dragenter.prevent="onDragOverColumn($event, col.status)"
          @dragover.prevent="onDragOverColumn($event, col.status)"
          @drop.prevent="onDropOnColumn($event, col.status)"
        >
          <div
            v-for="(task, idx) in visibleTasksByStatus[col.status]"
            :key="task._id"
            class="kanban-card-wrapper"
            :class="{ dragging: draggingTaskId === task._id, moving: movingTaskId === task._id }"
            :data-task-id="task._id"
            :style="getCardJitterStyle(idx)"
            @click="zoomIntoTask($event, task)"
          >
            <button
              class="kanban-drag-handle"
              type="button"
              aria-label="Arrastar tarefa"
              title="Arrastar"
              :draggable="!isLocked && !task.isConcluded"
              @click.stop
              @pointerdown.stop
              @mousedown.stop
              @dragstart="onDragStart($event, task, col.status)"
              @dragend="onDragEnd"
            >
              ⋮⋮
            </button>

            <!-- Reusa o visual/preview atual de task (papel antigo + preview) -->
            <div class="kanban-card-scale">
              <TaskPaper
                :task="task"
                :tasks="props.tasks"
                :positionStyle="{}"
                :projects="projects"
                :zoomed="false"
                :create="false"
                :colors="getProjectColors(task.project || '', projects)"
              />
            </div>
          </div>

          <!-- Sentinel: when it becomes visible, we render more tasks for this column -->
          <div class="kanban-sentinel" :ref="(el) => setSentinelRef(col.status, el)" />
        </div>
      </section>
    </div>

    <!-- Zoom overlay reutiliza o mesmo Paper/ZoomedContent existente -->
    <transition name="zoom-fade">
      <div v-if="zoomedTask" class="zoom-container" ref="zoomTarget">
        <TaskPaper
          class="zoomed-task-paper"
          :key="zoomed ? 'edit' : 'view'"
          :task="zoomedTask"
          :tasks="props.tasks"
          :positionStyle="{}"
          :projects="projects"
          :zoomed="zoomed"
          :create="create"
          :colors="getProjectColors((zoomedTask as any)?.project || '', projects)"
          @close="zoomOutTask"
          @close-zoom="zoomOutTask"
          @edit-task="handleEdit"
          @delete-task="handleDelete"
          @navigate-task="handleNavigateTask"
          @navigate-context="(p) => handleNavigateContext(p)"
        />
      </div>
    </transition>

    <!-- Completion Feedback Modal -->
    <CompletionFeedbackModal
      :is-open="completionModalOpen"
      :task="completionModalTask"
      @close="completionModalOpen = false"
      @confirmed="handleFeedbackConfirmed"
    />

    <ClientOnly>
      <v-snackbar
        v-model="snackbarOpen"
        :timeout="2600"
        location="top"
        color="surface"
      >
        {{ snackbarText }}
      </v-snackbar>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task } from '~/models/Task'
import TaskPaper from '../board/Paper.vue'
import CompletionFeedbackModal from '../modals/CompletionFeedbackModal.vue'
import { getProjectColors } from '~/composables/utils/useColor'
import { useZoomState } from '~/composables/ui/useZoomState'
import { useZoomController } from '~/composables/ui/useZoomController'
import { useTaskActions } from '~/composables/features/useTaskActions'
import { useTaskStore } from '~/stores/task'

type KanbanColumnStatus = 'todo' | 'doing' | 'done'
type TaskStatus = 'todo' | 'doing' | 'review' | 'done'

interface Props {
  tasks: Task[]
  projects: any[]
}

const props = defineProps<Props>()
const emit = defineEmits([
  'zoom-in',
  'zoom-out',
  'remove-last-task',
  'task-moved',
])

const columns: Array<{ status: KanbanColumnStatus; label: string }> = [
  { status: 'todo', label: 'ToDo' },
  { status: 'doing', label: 'Fazendo' },
  { status: 'done', label: 'Concluído' },
]

const zoomState = useZoomState()
const { zoomedTask, zoomed, create } = zoomState

const { zoomIntoTask, zoomOutTask } = useZoomController({
  emit: (event: string, payload?: any) => emit(event as any, payload),
  state: zoomState,
})

const { handleEdit, handleDelete } = useTaskActions({
  emit: (event: string, payload?: any) => emit(event as any, payload),
  zoomOutTask,
  createRef: zoomState.createRef,
  create: zoomState.create,
})

function handleNavigateTask(taskId: string) {
  const nextTask = (props.tasks || []).find((task: any) => task?._id === taskId)
  if (!nextTask) return

  zoomState.zoomedTask.value = nextTask as any
  zoomState.zoomed.value = true
  zoomState.create.value = false
  zoomState.createRef.value = false
  emit('zoom-in')
}

function handleNavigateContext(payload: any) {
  // Reuse Board's approach: if objective/project -> open /projects, if wbs -> set query
  const level = String(payload?.level || '')
  const project = props.projects.find((p) => p.name === payload.projectId)
  const projectId = String(project?._id || '')
  const wbsNodeId = String(payload?.wbsNodeId || '')

  if ((level === 'objective' || level === 'project') && projectId) {
    // open projects page with appropriate slide focus
    const focusParam = level === 'objective' ? 'objective' : 'project'
    window.location.href = `/projects?projectId=${encodeURIComponent(projectId)}&focus=${focusParam}&from=task-lineage`
    return
  }

  if (level === 'wbs' && wbsNodeId) {
    // Redirect to projects page with focus on WBS and include wbsNodeId
    // If we have projectId, include it; otherwise still redirect so projects page can handle wbs-only focus
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    params.set('wbsNodeId', wbsNodeId)
    params.set('focus', 'wbs')
    params.set('from', 'task-lineage')
    const url = `/projects?${params.toString()}`
    window.location.href = url
  }
}

const isLocked = computed(() => !!zoomed.value)

const snackbarOpen = ref(false)
const snackbarText = ref('')
const completionModalOpen = ref(false)
const completionModalTask = ref<any>(null)

function showSnack(message: string) {
  snackbarText.value = message
  snackbarOpen.value = true
}

const getEffectiveStatus = (task: any): KanbanColumnStatus => {
  if (task?.isConcluded) return 'done'

  const status: TaskStatus | undefined = task?.status
  if (status === 'done') return 'done'
  if (status === 'doing') return 'doing'
  if (status === 'review') return 'doing'
  if (status === 'todo') return 'todo'
  return 'todo'
}

const tasksByStatus = computed<Record<KanbanColumnStatus, Task[]>>(() => {
  const grouped: Record<KanbanColumnStatus, Task[]> = {
    todo: [],
    doing: [],
    done: [],
  }

  for (const task of props.tasks || []) {
    grouped[getEffectiveStatus(task)].push(task)
  }

  return grouped
})

function getCardJitterStyle(idx: number) {
  // Deterministic “messy stack” offsets (stable between renders).
  const xPattern = [0, -8, 8, 2, -6, 3]
  const yPattern = [0, 10, -2, -12, 1, -14]
  const rPattern = [0, -0.6, 0.4, -0.35, 0.55, -0.25]

  const jx = xPattern[idx % xPattern.length]
  const jy = yPattern[idx % yPattern.length]
  const jr = rPattern[idx % rPattern.length]

  return {
    '--jx': `${jx}px`,
    '--jy': `${jy}px`,
    '--jr': `${jr}deg`,
    zIndex: String(200 + idx),
  } as any
}

// --- Lazy rendering / infinite scroll per column ---
const INITIAL_BATCH = 8
const BATCH_SIZE = 8

const visibleCountByStatus = ref<Record<KanbanColumnStatus, number>>({
  todo: INITIAL_BATCH,
  doing: INITIAL_BATCH,
  done: INITIAL_BATCH,
})

const visibleTasksByStatus = computed<Record<KanbanColumnStatus, Task[]>>(() => {
  return {
    todo: tasksByStatus.value.todo.slice(0, visibleCountByStatus.value.todo),
    doing: tasksByStatus.value.doing.slice(0, visibleCountByStatus.value.doing),
    done: tasksByStatus.value.done.slice(0, visibleCountByStatus.value.done),
  }
})

const columnBodyRefs = new Map<KanbanColumnStatus, HTMLElement>()
const sentinelRefs = new Map<KanbanColumnStatus, HTMLElement>()
const observers = new Map<KanbanColumnStatus, IntersectionObserver>()

function setColumnBodyRef(status: KanbanColumnStatus, el: unknown) {
  if (el instanceof HTMLElement) columnBodyRefs.set(status, el)
}

function setSentinelRef(status: KanbanColumnStatus, el: unknown) {
  if (el instanceof HTMLElement) sentinelRefs.set(status, el)
}

function clampVisibleCounts() {
  const maxTodo = tasksByStatus.value.todo.length
  const maxDoing = tasksByStatus.value.doing.length
  const maxDone = tasksByStatus.value.done.length

  visibleCountByStatus.value = {
    todo: Math.min(visibleCountByStatus.value.todo, maxTodo),
    doing: Math.min(visibleCountByStatus.value.doing, maxDoing),
    done: Math.min(visibleCountByStatus.value.done, maxDone),
  }
}

function bump(status: KanbanColumnStatus) {
  const max = tasksByStatus.value[status].length
  const current = visibleCountByStatus.value[status]
  if (current >= max) return

  visibleCountByStatus.value = {
    ...visibleCountByStatus.value,
    [status]: Math.min(current + BATCH_SIZE, max),
  }
}

async function setupObservers() {
  await nextTick()

  for (const status of ['todo', 'doing', 'done'] as KanbanColumnStatus[]) {
    observers.get(status)?.disconnect()
    observers.delete(status)

    const root = columnBodyRefs.get(status)
    const sentinel = sentinelRefs.get(status)
    if (!root || !sentinel) continue

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) bump(status)
      },
      {
        root,
        rootMargin: '200px 0px 200px 0px',
        threshold: 0,
      }
    )

    obs.observe(sentinel)
    observers.set(status, obs)
  }
}

onMounted(() => {
  clampVisibleCounts()
  setupObservers()
})

onBeforeUnmount(() => {
  for (const obs of observers.values()) obs.disconnect()
  observers.clear()
})

watch(
  () => [props.tasks?.length, tasksByStatus.value.todo.length, tasksByStatus.value.doing.length, tasksByStatus.value.done.length],
  () => {
    clampVisibleCounts()
    setupObservers()
  }
)

const draggingTaskId = ref<string | null>(null)
const draggingFromStatus = ref<KanbanColumnStatus | null>(null)
const movingTaskId = ref<string | null>(null)

function getMoveBlockReason(task: any, toStatus: KanbanColumnStatus) {
  // Mirror backend rule: concluded tasks must stay in 'done'.
  if (task?.isConcluded && toStatus !== 'done') {
    return 'Tarefa concluída não pode ser movida para fora de "Concluído".'
  }

  // Mirror backend rule: moving to done uses conclude flow, which requires 100% checklist if checklist exists.
  if (toStatus === 'done') {
    const checklist = task?.checklist
    if (Array.isArray(checklist) && checklist.length > 0) {
      // Checklist can be stored as `string[]` (legacy) or objects with { completed }.
      // Treat strings (and malformed entries) as incomplete items.
      let completed = 0
      let total = 0

      for (const entry of checklist) {
        total += 1
        if (entry && typeof entry === 'object' && 'completed' in entry) {
          if (Boolean((entry as any).completed)) completed += 1
        }
      }

      if (completed < total) {
        const pct = Math.round((completed / total) * 100)
        return `Checklist incompleto: ${completed}/${total} (${pct}%). Complete todos os itens antes de concluir.`
      }
    }
  }

  return null
}

function onDragStart(e: DragEvent, task: any, fromStatus: KanbanColumnStatus) {
  if (isLocked.value) {
    e.preventDefault()
    return
  }

  if (task?.isConcluded) {
    e.preventDefault()
    showSnack('Tarefa já concluída não pode ser movida.')
    return
  }

  draggingTaskId.value = task?._id ?? null
  draggingFromStatus.value = fromStatus

  const handleEl = e.target instanceof HTMLElement ? e.target : null
  const wrapper = handleEl?.closest?.('.kanban-card-wrapper') as HTMLElement | null
  const scaleEl = (wrapper?.querySelector?.('.kanban-card-scale') as HTMLElement | null) ?? null

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.dropEffect = 'move'
    } catch {
      // ignore
    }
    e.dataTransfer.setData('text/plain', String(task?._id ?? ''))

    // HTML5 DnD drag images are a one-time snapshot on dragstart.
    // Create an offscreen clone with tilt + shadow so the "hand" feels like grabbing the sheet,
    // without rotating the source card that stays in the column.
    if (scaleEl instanceof HTMLElement) {
      const preview = scaleEl.cloneNode(true) as HTMLElement
      preview.classList.add('kanban-drag-preview')
      preview.style.position = 'absolute'
      preview.style.top = '-10000px'
      preview.style.left = '-10000px'
      preview.style.pointerEvents = 'none'

      document.body.appendChild(preview)

      const r = scaleEl.getBoundingClientRect()
      const offsetX = Math.max(0, Math.min(r.width / 2, 140))
      const offsetY = Math.max(0, Math.min(r.height / 3, 110))
      try {
        e.dataTransfer.setDragImage(preview, offsetX, offsetY)
      } catch {
        // ignore if browser refuses custom drag image
      }

      // Cleanup preview element after the drag image is captured.
      setTimeout(() => preview.remove(), 0)
    }
  }
}

function onDragEnd() {
  draggingTaskId.value = null
  draggingFromStatus.value = null
}

function onDragOverColumn(e: DragEvent, _status: KanbanColumnStatus) {
  if (isLocked.value) return
  if (e.dataTransfer) {
    try {
      e.dataTransfer.dropEffect = 'move'
    } catch {
      // ignore
    }
  }
}

async function onDropOnColumn(e: DragEvent, toStatus: KanbanColumnStatus) {
  if (isLocked.value) return

  const taskId = e.dataTransfer?.getData('text/plain') || draggingTaskId.value
  if (!taskId) return

  const task = (props.tasks || []).find((t: any) => t?._id === taskId)
  if (!task) return

  const blockReason = getMoveBlockReason(task, toStatus)
  if (blockReason) {
    showSnack(blockReason)
    onDragEnd()
    return
  }

  const fromStatus = draggingFromStatus.value ?? getEffectiveStatus(task)

  // Use store to move task status (calls backend API)
  const taskStore = useTaskStore()
  movingTaskId.value = taskId
  const { success, error } = await taskStore.setTaskStatus(taskId, toStatus)
  movingTaskId.value = null

  if (success) {
    // If moving to 'done', trigger completion feedback modal
    if (toStatus === 'done') {
      completionModalTask.value = task
      completionModalOpen.value = true
    }

    emit('task-moved', {
      taskId,
      fromStatus,
      toStatus,
    })
  } else {
    showSnack(String(error || 'Não foi possível mover a tarefa.'))
    console.error('Erro ao mover tarefa:', error)
    // Optionally: emit error event for parent to display toast
    // emit('task-move-failed', { taskId, toStatus, error })
  }

  onDragEnd()
}

function handleFeedbackConfirmed(feedbackData: any) {
  // Close modal
  const taskId = completionModalTask.value?._id
  completionModalOpen.value = false
  completionModalTask.value = null

  // Show success message
  showSnack('✓ Feedback registrado! Tarefa concluída com sucesso.')

  // Emit event for parent component if needed
  if (taskId) {
    emit('task-moved', {
      taskId,
      toStatus: 'done',
      feedback: feedbackData,
    })
  }
}
</script>

<style scoped>
.kanban-root {
  position: relative;
  width: 100%;
  height: 65.5vh;
  overflow: visible;
  z-index: 3;
}

.kanban-columns {
  height: 100%;
  display: flex;
  gap: 0.45rem;
  padding: 0.75rem;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: stretch;
  transition: opacity 0.2s ease;
}

.kanban-columns-hidden {
  opacity: 0;
  pointer-events: none;
}

.kanban-column {
  flex: 0 0 32%;
  min-width: 292px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0rem;
  box-sizing: border-box;
  padding: 0.15rem;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.34);
  background: transparent;
  position: relative;
  overflow: hidden;
  --kanban-tint: rgba(var(--v-theme-primary), 0.15);
}

.kanban-column[data-status="todo"] {
  --kanban-tint: rgba(var(--v-theme-primary), 0.15);
}

.kanban-column[data-status="doing"] {
  --kanban-tint: rgba(var(--v-theme-warning), 0.15);
}

.kanban-column[data-status="review"] {
  --kanban-tint: rgba(var(--v-theme-info), 0.16);
}

.kanban-column[data-status="done"] {
  --kanban-tint: rgba(var(--v-theme-success), 0.15);
}

.kanban-column::before {
  content: '';
  position: absolute;
  inset: 0;  
  opacity: 0.55;
  z-index: 0;
  pointer-events: none;
}

.kanban-column::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--kanban-tint);
  z-index: 1;
  pointer-events: none;
}

.kanban-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'Irish Grover', cursive;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.28);
  background: rgba(var(--v-theme-surface), 0.40);
  position: relative;
  z-index: 2;
}

.kanban-column-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
  background: var(--kanban-accent-strong);
  opacity: 0.95;
}

.kanban-title {
  font-size: 20px;
}

.kanban-count {
  font-size: 16px;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.22);
  background: rgba(var(--v-theme-surface), 0.42);
}

.kanban-column-body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.1rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 0.35rem;
  row-gap: 0rem;
  align-content: start;
  position: relative;
  z-index: 2;
}

.kanban-sentinel {
  height: 1px;
  width: 100%;
  grid-column: 1 / -1;
}

.kanban-card-wrapper {
  position: relative;
  width: 100%;
  cursor: pointer;
  margin-top: -2px; 
  justify-self: center;
  transform: translate(var(--jx, 0px), var(--jy, 0px)) rotate(var(--jr, 0deg));
}

.kanban-card-scale {
  display: inline-block;
  --paper-scale: 0.85;
  --paper-tilt: 0deg;
  --paper-lift: 0px;
  transform: scale(var(--paper-scale)) rotate(var(--paper-tilt)) translateY(var(--paper-lift));
  transform-origin: top left;
  transition: transform 140ms ease, filter 140ms ease;
}

.kanban-card-wrapper.dragging {
  opacity: 0.35;
}

.kanban-card-wrapper.moving {
  opacity: 0.82;
}

.kanban-drag-preview {
  --paper-tilt: -7deg;
  --paper-lift: -8px;
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.35));
}

.kanban-drag-handle {
  position: absolute;
  z-index: 10;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.65);
  cursor: grab;
  font-family: 'Irish Grover', cursive;
  font-size: 18px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.kanban-root.locked .kanban-drag-handle {
  cursor: not-allowed;
  opacity: 0.55;
}

.zoom-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.zoom-fade-enter-active,
.zoom-fade-leave-active {
  transition: opacity 0.75s ease;
}

.zoom-fade-enter-from,
.zoom-fade-leave-to {
  opacity: 0;
}
</style>
