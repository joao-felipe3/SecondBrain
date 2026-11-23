<template>
  <div class="kanban-root" :class="[`layout-${layout}`, { locked: isLocked }]">
    <!-- Mobile/compacto: diário com abas de madeira, uma coluna por vez -->
    <FieldJournalMobile
      v-if="layout === 'journal'"
      v-show="!isLocked"
      class="kanban-journal-tabs"
      :active-tab="activeColumn"
      :todo-count="tasksByStatus.todo.length"
      :doing-count="tasksByStatus.doing.length"
      :done-count="tasksByStatus.done.length"
      @update:active-tab="selectColumn"
      @drop-on-tab="({ event, tab }) => onDropOnColumn(event, tab)"
    />

    <div class="kanban-columns" :class="{ 'kanban-columns-hidden': isLocked }">
      <section
        v-for="col in renderedColumns"
        :key="col.status"
        class="kanban-column"
        :class="{ 'is-drop-target': dragOverStatus === col.status }"
        :data-status="col.status"
        @dragenter.prevent="onDragOverColumn($event, col.status)"
        @dragover.prevent="onDragOverColumn($event, col.status)"
        @dragleave="onDragLeaveColumn($event, col.status)"
        @drop.prevent="onDropOnColumn($event, col.status)"
      >
        <!-- no layout em cena o cabeçalho é escrito sobre a placa rúnica pintada -->
        <header class="kanban-column-header">
          <span class="kanban-title">{{ col.label }}</span>
          <span class="kanban-count">{{ tasksByStatus[col.status].length }}</span>
        </header>

        <div
          class="kanban-column-body"
          :ref="(el) => setColumnBodyRef(col.status, el)"
          :style="columnBodyStyle(col.status)"
          @dragenter.prevent="onDragOverColumn($event, col.status)"
          @dragover.prevent="onDragOverColumn($event, col.status)"
          @drop.prevent="onDropOnColumn($event, col.status)"
        >
          <p v-if="!tasksByStatus[col.status].length" class="kanban-empty">{{ col.empty }}</p>

          <div
            v-for="(task, idx) in visibleTasksByStatus[col.status]"
            :key="task._id"
            class="kanban-card-wrapper"
            :class="{ dragging: draggingTaskId === task._id, moving: movingTaskId === task._id }"
            :data-task-id="task._id"
            :style="getCardJitterStyle(idx)"
            @click="openTask($event, task)"
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
                @habit-complete="handleHabitComplete"
                @habit-skip="handleHabitSkip"
              />
              <KanbanCardAccents :task="task" :column="col.status" />
            </div>
          </div>

          <!-- Sentinel: when it becomes visible, we render more tasks for this column -->
          <div class="kanban-sentinel" :ref="(el) => setSentinelRef(col.status, el)" />
        </div>
      </section>
    </div>

    <!-- Zoom overlay reutiliza o mesmo Paper/ZoomedContent existente.
         Vai para o <body>: o mural é posicionado sobre a cena e um ancestral com transform
         prenderia o `position: fixed` dentro dele. -->
    <Teleport to="body">
      <!-- véu escuro atrás da folha: entra junto com o zoom (zoomed) e sai junto com a volta (zoomed = false) -->
      <transition name="zoom-backdrop-fade">
        <div v-if="zoomed || zoomedTask" class="zoom-backdrop" aria-hidden="true" />
      </transition>
      <transition name="zoom-fade">
        <div v-if="zoomedTask" class="zoom-container">
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
            @habit-complete="handleHabitComplete"
            @habit-skip="handleHabitSkip"
          />
        </div>
      </transition>
    </Teleport>

    <!-- Completion Feedback Modal -->
    <CompletionFeedbackModal
      :is-open="completionModalOpen"
      :task="completionModalTask"
      @close="completionModalOpen = false"
      @confirmed="handleFeedbackConfirmed"
    />

    <ClientOnly>
      <v-snackbar v-model="snackbarOpen" :timeout="2600" location="top" color="surface">
        {{ snackbarText }}
      </v-snackbar>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Task } from '~/models/Task';
import TaskPaper from '../board/Paper.vue';
import CompletionFeedbackModal from '../modals/CompletionFeedbackModal.vue';
import FieldJournalMobile from './FieldJournalMobile.vue';
import KanbanCardAccents from './KanbanCardAccents.vue';
import { getProjectColors } from '~/composables/utils/useColor';
import { useZoomState } from '~/composables/ui/useZoomState';
import { useZoomController } from '~/composables/ui/useZoomController';
import { useTaskActions } from '~/composables/features/useTaskActions';
import { matchesTaskFilters } from '~/composables/features/taskFilters';
import { useGuildAudio } from '~/composables/ui/useGuildAudio';
import {
  paperLayoutForWidth,
  PAPER_SIZE,
  JOURNAL_PAPER_LAYOUT,
  SCENE_PAPER_LAYOUT,
} from '~/composables/ui/useTasksScene';
import { useTaskStore } from '~/stores/task';
import { useUiGuildStore } from '~/stores/uiGuild';

type KanbanColumnStatus = 'todo' | 'doing' | 'done';
type TaskStatus = 'todo' | 'doing' | 'review' | 'done';

interface Props {
  tasks: Task[];
  projects: any[];
  projectFilter?: string;
  typeFilter?: string;
  priorityFilter?: string;
  isRefreshing?: boolean;
  timeSinceRefresh?: number;
  initialZoomedTask?: Task | null;
  /**
   * `scene`: as 3 colunas ficam sobre os painéis pintados do mural (posições em variáveis CSS do
   * palco, ver useTasksScene). `journal`: diário com abas, uma coluna por vez (mobile/compacto).
   */
  layout?: 'scene' | 'journal';
}

const props = withDefaults(defineProps<Props>(), {
  projectFilter: '',
  typeFilter: '',
  priorityFilter: '',
  isRefreshing: false,
  timeSinceRefresh: 0,
  initialZoomedTask: null,
  layout: 'scene',
});

const emit = defineEmits([
  'zoom-in',
  'zoom-out',
  'remove-last-task',
  'task-moved',
  'refresh',
  'feedback-action',
  'habit-completed',
  'habit-skipped',
]);

// Filter state removed - now using props from parent

const columns: Array<{ status: KanbanColumnStatus; label: string; empty: string }> = [
  { status: 'todo', label: 'Contratos Abertos', empty: 'Nenhum contrato no mural.' },
  { status: 'doing', label: 'Em Andamento', empty: 'Nenhuma missão em andamento.' },
  { status: 'done', label: 'Missões Cumpridas', empty: 'Nenhuma vitória nas últimas 24 h.' },
];

// Diário mobile: a aba ativa vive na store para sobreviver ao remount do board (`:key` no Main).
const uiGuild = useUiGuildStore();
const activeColumn = computed<KanbanColumnStatus>(() => uiGuild.mobileTaskTab);
function selectColumn(tab: KanbanColumnStatus) {
  uiGuild.setMobileTaskTab(tab);
}
const renderedColumns = computed(() =>
  props.layout === 'journal' ? columns.filter((c) => c.status === activeColumn.value) : columns,
);

const { playParchmentDragSound, playWaxStampSound, playQuillScratchSound, playPaperTearSound } =
  useGuildAudio();

const zoomState = useZoomState();
const { zoomedTask, zoomed, create } = zoomState;

const { zoomIntoTask, zoomOutTask } = useZoomController({
  emit: (event: string, payload?: any) => emit(event as any, payload),
  state: zoomState,
});

// Abrir uma folha que já está no quadro nunca é criação. Sem isto, depois de criar um contrato o
// `create` ficava ligado: a próxima folha aberta mostrava "Create" e salvar duplicava a tarefa.
function openTask(event: MouseEvent, task: Task) {
  zoomState.create.value = false;
  return zoomIntoTask(event, task);
}

// Watch para abrir automaticamente tarefa recém-criada
watch(
  () => props.initialZoomedTask,
  (newTask) => {
    if (newTask) {
      nextTick(() => {
        zoomState.zoomedTask.value = newTask as any;
        zoomState.zoomed.value = true;
        // If the task has no id yet, it's a NEW task being created.
        // This flag is used by `useTaskActions.handleEdit` to decide between POST(create) and PATCH(update).
        zoomState.create.value = !(newTask as any)?._id;
        zoomState.createRef.value = true;
        emit('zoom-in');
      });
    }
  },
  { deep: true, immediate: true },
);

const taskActions = useTaskActions({
  emit: (event: string, payload?: any) => emit(event as any, payload),
  zoomOutTask,
  createRef: zoomState.createRef,
  create: zoomState.create,
});

// SFX do mural: pena ao salvar, folha rasgando ao excluir
async function handleEdit(task: Task) {
  playQuillScratchSound();
  return taskActions.handleEdit(task);
}

async function handleDelete(taskId: string) {
  playPaperTearSound();
  return taskActions.handleDelete(taskId);
}

function handleNavigateTask(taskId: string) {
  const nextTask = (props.tasks || []).find((task: any) => task?._id === taskId);
  if (!nextTask) return;

  zoomState.zoomedTask.value = nextTask as any;
  zoomState.zoomed.value = true;
  zoomState.create.value = false;
  zoomState.createRef.value = false;
  emit('zoom-in');
}

function handleNavigateContext(payload: any) {
  // Reuse Board's approach: if objective/project -> open /projects, if wbs -> set query
  const level = String(payload?.level || '');
  const project = props.projects.find((p) => p.name === payload.projectId);
  const projectId = String(project?._id || '');
  const wbsNodeId = String(payload?.wbsNodeId || '');

  if ((level === 'objective' || level === 'project') && projectId) {
    // open projects page with appropriate slide focus
    const focusParam = level === 'objective' ? 'objective' : 'project';
    window.location.href = `/projects?projectId=${encodeURIComponent(projectId)}&focus=${focusParam}&from=task-lineage`;
    return;
  }

  if (level === 'wbs' && wbsNodeId) {
    // Redirect to projects page with focus on WBS and include wbsNodeId
    // If we have projectId, include it; otherwise still redirect so projects page can handle wbs-only focus
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    params.set('wbsNodeId', wbsNodeId);
    params.set('focus', 'wbs');
    params.set('from', 'task-lineage');
    const url = `/projects?${params.toString()}`;
    window.location.href = url;
  }
}

const isLocked = computed(() => !!zoomed.value);

/**
 * Handlers para hábitos completados dentro do Kanban
 * (sem abrir zoom - ação rápida)
 */
async function handleHabitComplete(habitId: string) {
  const taskStore = useTaskStore();
  const habit = (props.tasks || []).find((t: any) => t?._id === habitId);
  if (!habit) return;

  // TODO: Chamar `taskStore.handleRecurringCompletion(habitId)`
  // Por enquanto, apenas mostrar mensagem
  showSnack('🎉 Hábito completado! Próxima ocorrência agendada.');
  emit('habit-completed', { habitId, completedAt: new Date() });
}

/**
 * Handlers para hábitos pulados dentro do Kanban
 * (sem abrir zoom - ação rápida)
 */
async function handleHabitSkip(habitId: string) {
  const taskStore = useTaskStore();
  const habit = (props.tasks || []).find((t: any) => t?._id === habitId);
  if (!habit) return;

  // TODO: Chamar `taskStore.skipRecurringTask(habitId)`
  // Por enquanto, apenas mostrar mensagem
  showSnack('⏭️ Hábito pulado! Streak não quebrada.');
  emit('habit-skipped', { habitId, skippedAt: new Date() });
}

const snackbarOpen = ref(false);
const snackbarText = ref('');
const completionModalOpen = ref(false);
const completionModalTask = ref<any>(null);

function showSnack(message: string) {
  snackbarText.value = message;
  snackbarOpen.value = true;
}

const getEffectiveStatus = (task: any): KanbanColumnStatus => {
  if (task?.isConcluded) return 'done';

  const status: TaskStatus | undefined = task?.status;
  if (status === 'done') return 'done';
  if (status === 'doing') return 'doing';
  if (status === 'review') return 'doing';
  if (status === 'todo') return 'todo';
  return 'todo';
};

function isDoneVisible(task: any): boolean {
  const updatedAt = task?.statusUpdatedAt || task?.updatedAt || task?.createdAt;
  if (!updatedAt) return true;

  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return true;

  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - updatedMs <= oneDayMs;
}

// Filter tasks based on props filters (projeto, tipo, prioridade 1..4 -> baixa/média/alta)
const filteredTasks = computed(() =>
  (props.tasks || []).filter((task: any) =>
    matchesTaskFilters(task, {
      projectFilter: props.projectFilter,
      typeFilter: props.typeFilter,
      priorityFilter: props.priorityFilter,
    }),
  ),
);

const tasksByStatus = computed<Record<KanbanColumnStatus, Task[]>>(() => {
  const grouped: Record<KanbanColumnStatus, Task[]> = {
    todo: [],
    doing: [],
    done: [],
  };

  for (const task of filteredTasks.value) {
    const status = getEffectiveStatus(task);
    if (status === 'done' && !isDoneVisible(task)) {
      continue;
    }
    grouped[status].push(task);
  }

  return grouped;
});

function getCardJitterStyle(idx: number) {
  // Deterministic “messy stack” offsets (stable between renders).
  const xPattern = [0, -8, 8, 2, -6, 3];
  const yPattern = [0, 10, -2, -12, 1, -14];
  const rPattern = [0, -0.6, 0.4, -0.35, 0.55, -0.25];

  const jx = xPattern[idx % xPattern.length];
  const jy = yPattern[idx % yPattern.length];
  const jr = rPattern[idx % rPattern.length];

  return {
    '--jx': `${jx}px`,
    '--jy': `${jy}px`,
    '--jr': `${jr}deg`,
    zIndex: String(200 + idx),
  } as any;
}

// --- Lazy rendering / infinite scroll per column ---
const INITIAL_BATCH = 8;
const BATCH_SIZE = 8;

const visibleCountByStatus = ref<Record<KanbanColumnStatus, number>>({
  todo: INITIAL_BATCH,
  doing: INITIAL_BATCH,
  done: INITIAL_BATCH,
});

const visibleTasksByStatus = computed<Record<KanbanColumnStatus, Task[]>>(() => {
  return {
    todo: tasksByStatus.value.todo.slice(0, visibleCountByStatus.value.todo),
    doing: tasksByStatus.value.doing.slice(0, visibleCountByStatus.value.doing),
    done: tasksByStatus.value.done.slice(0, visibleCountByStatus.value.done),
  };
});

const columnBodyRefs = new Map<KanbanColumnStatus, HTMLElement>();
const sentinelRefs = new Map<KanbanColumnStatus, HTMLElement>();
const observers = new Map<KanbanColumnStatus, IntersectionObserver>();

function setColumnBodyRef(status: KanbanColumnStatus, el: unknown) {
  if (el instanceof HTMLElement) columnBodyRefs.set(status, el);
}

function setSentinelRef(status: KanbanColumnStatus, el: unknown) {
  if (el instanceof HTMLElement) sentinelRefs.set(status, el);
}

function clampVisibleCounts() {
  const maxTodo = tasksByStatus.value.todo.length;
  const maxDoing = tasksByStatus.value.doing.length;
  const maxDone = tasksByStatus.value.done.length;

  visibleCountByStatus.value = {
    todo: Math.min(visibleCountByStatus.value.todo, maxTodo),
    doing: Math.min(visibleCountByStatus.value.doing, maxDoing),
    done: Math.min(visibleCountByStatus.value.done, maxDone),
  };
}

function bump(status: KanbanColumnStatus) {
  const max = tasksByStatus.value[status].length;
  const current = visibleCountByStatus.value[status];
  if (current >= max) return;

  visibleCountByStatus.value = {
    ...visibleCountByStatus.value,
    [status]: Math.min(current + BATCH_SIZE, max),
  };
}

async function setupObservers() {
  await nextTick();

  for (const status of ['todo', 'doing', 'done'] as KanbanColumnStatus[]) {
    observers.get(status)?.disconnect();
    observers.delete(status);

    const root = columnBodyRefs.get(status);
    const sentinel = sentinelRefs.get(status);
    if (!root || !sentinel) continue;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) bump(status);
      },
      {
        root,
        rootMargin: '200px 0px 200px 0px',
        threshold: 0,
      },
    );

    obs.observe(sentinel);
    observers.set(status, obs);
  }
}

// --- Folhas por linha e escala, medidas pela largura real de cada painel ---
type PaperLayout = { perRow: number; scale: number };
const paperLayouts = ref<Partial<Record<KanbanColumnStatus, PaperLayout>>>({});
let resizeObserver: ResizeObserver | null = null;

function measureColumns() {
  const next: Partial<Record<KanbanColumnStatus, PaperLayout>> = {};
  const widths = new Map<KanbanColumnStatus, number>();
  for (const col of renderedColumns.value) {
    const el = columnBodyRefs.get(col.status);
    if (el?.isConnected) widths.set(col.status, el.clientWidth);
  }
  if (!widths.size) return;
  // na cena as 3 colunas usam a mesma escala (a do painel mais estreito): os painéis pintados têm
  // larguras um pouco diferentes e, sem isso, uma coluna podia ficar com 2 folhas pequenas por linha
  // e a vizinha com 1 folha grande
  const sceneWidth = Math.min(...widths.values());
  for (const [status, width] of widths) {
    next[status] =
      props.layout === 'journal'
        ? paperLayoutForWidth(width, JOURNAL_PAPER_LAYOUT)
        : paperLayoutForWidth(sceneWidth, SCENE_PAPER_LAYOUT);
  }
  paperLayouts.value = next;
}

async function observeColumnSizes() {
  await nextTick();
  if (typeof ResizeObserver === 'undefined') return;
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => measureColumns());
  for (const col of renderedColumns.value) {
    const el = columnBodyRefs.get(col.status);
    if (el?.isConnected) resizeObserver.observe(el);
  }
  measureColumns();
}

function columnBodyStyle(status: KanbanColumnStatus) {
  const layout = paperLayouts.value[status] ?? { perRow: 2, scale: 0.85 };
  const cardW = Math.round(PAPER_SIZE.width * layout.scale);
  // na cena as folhas da mesma linha se sobrepõem: a coluna da grade é mais estreita que a folha e o vão
  // some; a folha (centralizada na coluna) transborda metade da sobreposição para cada lado
  const overlap = props.layout === 'scene' && layout.perRow > 1 ? (SCENE_PAPER_LAYOUT.overlap ?? 0) : 0;
  const style: Record<string, string> = {
    '--paper-scale': String(layout.scale),
    '--card-w': `${cardW}px`,
    '--card-h': `${Math.round(PAPER_SIZE.height * layout.scale)}px`,
    gridTemplateColumns: `repeat(${layout.perRow}, ${Math.round(cardW * (1 - overlap))}px)`,
  };
  if (overlap > 0) style.columnGap = '0px';
  return style;
}

onMounted(() => {
  clampVisibleCounts();
  setupObservers();
  observeColumnSizes();
});

// trocar de aba no diário monta outra coluna: refaz observadores de rolagem e de tamanho
watch(renderedColumns, () => {
  setupObservers();
  observeColumnSizes();
});

onBeforeUnmount(() => {
  for (const obs of observers.values()) obs.disconnect();
  observers.clear();
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => [
    props.tasks?.length,
    tasksByStatus.value.todo.length,
    tasksByStatus.value.doing.length,
    tasksByStatus.value.done.length,
  ],
  () => {
    clampVisibleCounts();
    setupObservers();
  },
);

const draggingTaskId = ref<string | null>(null);
const draggingFromStatus = ref<KanbanColumnStatus | null>(null);
const movingTaskId = ref<string | null>(null);

function getMoveBlockReason(task: any, toStatus: KanbanColumnStatus) {
  const isHabit =
    task?.microTaskType === 'habit' || Boolean(task?.parentRecurringId) || Boolean(task?.recurringRule);

  // Mirror backend rule: concluded tasks must stay in 'done'.
  if (task?.isConcluded && toStatus !== 'done') {
    return 'Tarefa concluída não pode ser movida para fora de "Concluído".';
  }

  // Mirror backend rule: moving to done uses conclude flow.
  // Habits do not require checklist completion to be concluded.
  if (toStatus === 'done' && !isHabit) {
    const checklist = task?.checklist;
    if (Array.isArray(checklist) && checklist.length > 0) {
      // Checklist can be stored as `string[]` (legacy) or objects with { completed }.
      // Treat strings (and malformed entries) as incomplete items.
      let completed = 0;
      let total = 0;

      for (const entry of checklist) {
        total += 1;
        if (entry && typeof entry === 'object' && 'completed' in entry) {
          if (Boolean((entry as any).completed)) completed += 1;
        }
      }

      if (completed < total) {
        const pct = Math.round((completed / total) * 100);
        return `Checklist incompleto: ${completed}/${total} (${pct}%). Complete todos os itens antes de concluir.`;
      }
    }
  }

  return null;
}

/** clone do papel usado como imagem do arrasto; sai no dragend */
let dragPreviewEl: HTMLElement | null = null;

function onDragStart(e: DragEvent, task: any, fromStatus: KanbanColumnStatus) {
  if (isLocked.value) {
    e.preventDefault();
    return;
  }

  if (task?.isConcluded) {
    e.preventDefault();
    showSnack('Tarefa já concluída não pode ser movida.');
    return;
  }

  draggingTaskId.value = task?._id ?? null;
  draggingFromStatus.value = fromStatus;
  playParchmentDragSound();

  const handleEl = e.target instanceof HTMLElement ? e.target : null;
  const wrapper = handleEl?.closest?.('.kanban-card-wrapper') as HTMLElement | null;
  const scaleEl = (wrapper?.querySelector?.('.kanban-card-scale') as HTMLElement | null) ?? null;

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
    e.dataTransfer.setData('text/plain', String(task?._id ?? ''));

    // HTML5 DnD drag images are a one-time snapshot on dragstart.
    // Create an offscreen clone with tilt + shadow so the "hand" feels like grabbing the sheet,
    // without rotating the source card that stays in the column.
    if (scaleEl instanceof HTMLElement) {
      const preview = scaleEl.cloneNode(true) as HTMLElement;
      preview.classList.add('kanban-drag-preview');
      preview.style.position = 'absolute';
      preview.style.top = '-10000px';
      preview.style.left = '-10000px';
      preview.style.pointerEvents = 'none';

      document.body.appendChild(preview);
      // o navegador pode capturar a imagem do arrasto depois do dragstart (Edge): o clone só sai no dragend
      dragPreviewEl?.remove();
      dragPreviewEl = preview;

      const r = scaleEl.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(r.width / 2, 140));
      const offsetY = Math.max(0, Math.min(r.height / 3, 110));
      try {
        e.dataTransfer.setDragImage(preview, offsetX, offsetY);
      } catch {
        // ignore if browser refuses custom drag image
      }
    }
  }
}

function onDragEnd() {
  dragPreviewEl?.remove();
  dragPreviewEl = null;
  draggingTaskId.value = null;
  draggingFromStatus.value = null;
  dragOverStatus.value = null;
}

// coluna sob o cursor durante o arrasto (realce do painel)
const dragOverStatus = ref<KanbanColumnStatus | null>(null);

function onDragLeaveColumn(e: DragEvent, status: KanbanColumnStatus) {
  const section = e.currentTarget as HTMLElement | null;
  const to = e.relatedTarget as Node | null;
  if (section && to && section.contains(to)) return;
  if (dragOverStatus.value === status) dragOverStatus.value = null;
}

function onDragOverColumn(e: DragEvent, status: KanbanColumnStatus) {
  if (isLocked.value) return;
  if (draggingTaskId.value) dragOverStatus.value = status;
  if (e.dataTransfer) {
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  }
}

async function onDropOnColumn(e: DragEvent, toStatus: KanbanColumnStatus) {
  if (isLocked.value) return;

  const taskId = e.dataTransfer?.getData('text/plain') || draggingTaskId.value;
  if (!taskId) return;

  const task = (props.tasks || []).find((t: any) => t?._id === taskId);
  if (!task) return;

  const blockReason = getMoveBlockReason(task, toStatus);
  if (blockReason) {
    showSnack(blockReason);
    onDragEnd();
    return;
  }

  const fromStatus = draggingFromStatus.value ?? getEffectiveStatus(task);

  // Use store to move task status (calls backend API)
  const taskStore = useTaskStore();
  movingTaskId.value = taskId;
  const { success, error } = await taskStore.setTaskStatus(taskId, toStatus);
  movingTaskId.value = null;

  if (success) {
    // If moving to 'done', trigger completion feedback modal
    if (toStatus === 'done') {
      playWaxStampSound();
      completionModalTask.value = task;
      completionModalOpen.value = true;
    }

    emit('task-moved', {
      taskId,
      fromStatus,
      toStatus,
    });
  } else {
    showSnack(String(error || 'Não foi possível mover a tarefa.'));
    console.error('Erro ao mover tarefa:', error);
    // Optionally: emit error event for parent to display toast
    // emit('task-move-failed', { taskId, toStatus, error })
  }

  onDragEnd();
}

function handleFeedbackConfirmed(feedbackData: any) {
  // Close modal
  const taskId = completionModalTask.value?._id;
  completionModalOpen.value = false;
  completionModalTask.value = null;

  // Show success message
  showSnack('✓ Feedback registrado! Tarefa concluída com sucesso.');

  // Emit event for parent component if needed
  if (taskId) {
    emit('task-moved', {
      taskId,
      toStatus: 'done',
      feedback: feedbackData,
    });

    const action = feedbackData?.action;
    if (action) {
      emit('feedback-action', {
        taskId,
        action,
        payload: feedbackData,
      });

      if (action === 'raise-impediment') {
        showSnack('Impedimento registrado no feedback.');
      } else if (action === 'notify-dependency') {
        showSnack('Dependência marcada no feedback.');
      }
    }
  }
}
</script>

<style scoped>
.kanban-root {
  position: relative;
  width: 100%;
  z-index: 3;
}

.kanban-columns {
  transition: opacity 0.2s ease;
}

.kanban-columns-hidden {
  opacity: 0;
  pointer-events: none;
}

.kanban-column {
  position: relative;
  box-sizing: border-box;
}

.kanban-column-body {
  display: grid;
  justify-content: center;
  align-content: start;
  column-gap: 8px;
  row-gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(240, 210, 160, 0.45) transparent;
}

.kanban-empty {
  grid-column: 1 / -1;
  margin: 1.2rem 0.5rem;
  text-align: center;
  font-family: var(--font-guild-title, 'Irish Grover', cursive);
  font-size: 0.95rem;
  color: rgba(245, 225, 190, 0.75);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.kanban-sentinel {
  height: 1px;
  width: 100%;
  grid-column: 1 / -1;
}

/* ===================== LAYOUT EM CENA (desktop/tablet deitado) =====================
   As variáveis --col-*, --plaque-* vêm do palco (useTasksScene.boardCssVars) em cqw/cqh. */
.layout-scene {
  position: absolute;
  inset: 0;
}

.layout-scene .kanban-columns {
  position: absolute;
  inset: 0;
}

.layout-scene .kanban-column {
  position: absolute;
  left: var(--cx);
  top: var(--cy);
  width: var(--cw);
  height: var(--ch);
  /* sombra interna leve: as folhas destacam das tábuas sem esconder a madeira pintada */
  background: radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.22) 100%);
  transition: box-shadow 0.15s ease;
}

.layout-scene .kanban-column[data-status='todo'] {
  --cx: var(--col-todo-x);
  --cy: var(--col-todo-y);
  --cw: var(--col-todo-w);
  --ch: var(--col-todo-h);
  --px: var(--plaque-todo-x);
  --py: var(--plaque-todo-y);
  --pw: var(--plaque-todo-w);
  --ph: var(--plaque-todo-h);
}

.layout-scene .kanban-column[data-status='doing'] {
  --cx: var(--col-doing-x);
  --cy: var(--col-doing-y);
  --cw: var(--col-doing-w);
  --ch: var(--col-doing-h);
  --px: var(--plaque-doing-x);
  --py: var(--plaque-doing-y);
  --pw: var(--plaque-doing-w);
  --ph: var(--plaque-doing-h);
}

.layout-scene .kanban-column[data-status='done'] {
  --cx: var(--col-done-x);
  --cy: var(--col-done-y);
  --cw: var(--col-done-w);
  --ch: var(--col-done-h);
  --px: var(--plaque-done-x);
  --py: var(--plaque-done-y);
  --pw: var(--plaque-done-w);
  --ph: var(--plaque-done-h);
}

/* luz da cena sobre as folhas: o papel é HTML e ficaria igualmente claro em qualquer ponto do quadro.
   Esta camada (multiply, sem cliques) acompanha a luz da arte, que é quente e ampla como no saguão:
   só um leve sombreado para longe da tocha mais próxima e a sombra da viga das placas no topo. */
.layout-scene .kanban-column::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 600;
  pointer-events: none;
  mix-blend-mode: multiply;
  background:
    linear-gradient(to bottom, rgba(70, 40, 20, 0.18) 0%, rgba(70, 40, 20, 0) 12%),
    var(--scene-shade, none);
}

.layout-scene .kanban-column[data-status='todo'] {
  --scene-shade: linear-gradient(to right, rgba(255, 245, 230, 0) 0%, rgba(90, 55, 30, 0.1) 100%);
}

.layout-scene .kanban-column[data-status='doing'] {
  --scene-shade: radial-gradient(
    ellipse at 50% 45%,
    rgba(90, 55, 30, 0) 0%,
    rgba(90, 55, 30, 0.08) 100%
  );
}

.layout-scene .kanban-column[data-status='done'] {
  --scene-shade: linear-gradient(to left, rgba(255, 245, 230, 0) 0%, rgba(90, 55, 30, 0.1) 100%);
}

.layout-scene .kanban-column.is-drop-target {
  box-shadow:
    inset 0 0 0 3px rgba(255, 205, 110, 0.7),
    inset 0 0 48px rgba(255, 190, 80, 0.28);
}

/* rótulo de pergaminho pregado sobre a placa rúnica pintada (cobre as runas para ler bem) */
.layout-scene .kanban-column-header {
  position: absolute;
  left: calc(var(--px) - var(--cx) + var(--pw) * 0.06);
  top: calc(var(--py) - var(--cy) + var(--ph) * 0.14);
  width: calc(var(--pw) * 0.88);
  height: calc(var(--ph) * 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  padding: 0 0.75em;
  box-sizing: border-box;
  /* ~21 px em 1920 (era ~19): lido de longe sobre o quadro, sem cortar "Contratos Abertos" */
  font-size: clamp(12px, 1.1cqw, 25px);
  border-radius: 3px;
  /* pergaminho envelhecido, creme neutro (sem tom laranja): o creme claro (L ~230) virava uma faixa quase branca no
     topo do quadro e dava a impressão de luz estourada; o saguão nunca passa de L ~200 */
  background: radial-gradient(ellipse at 50% 40%, hsl(40, 36%, 79%) 0%, hsl(36, 28%, 66%) 100%);
  box-shadow:
    inset 0 0 14px rgba(95, 55, 25, 0.55),
    0 2px 5px rgba(0, 0, 0, 0.55);
  clip-path: polygon(1% 6%, 99% 0, 100% 92%, 0 100%);
}

/* cravos de ferro prendendo o rótulo */
.layout-scene .kanban-column-header::before,
.layout-scene .kanban-column-header::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 0.42em;
  height: 0.42em;
  transform: translateY(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #c9ccd1 0%, #4b5563 65%, #111827 100%);
}

.layout-scene .kanban-column-header::before {
  left: 0.35em;
}

.layout-scene .kanban-column-header::after {
  right: 0.35em;
}

.layout-scene .kanban-title {
  font-family: var(--font-guild-title, 'Irish Grover', cursive);
  /* tinta quase preta + leve realce claro embaixo: contraste alto sobre o pergaminho envelhecido */
  color: hsl(20, 45%, 9%);
  text-shadow: 0 1px 0 rgba(255, 240, 210, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.1;
}

.layout-scene .kanban-count {
  flex-shrink: 0;
  min-width: 1.6em;
  padding: 0.15em 0.4em;
  border-radius: 999px;
  font-family: var(--font-guild-title, 'Irish Grover', cursive);
  font-size: 0.8em;
  text-align: center;
  color: hsl(42, 90%, 88%);
  background: radial-gradient(circle at 35% 30%, hsl(8, 55%, 42%) 0%, hsl(0, 60%, 26%) 100%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.layout-scene .kanban-column[data-status='doing'] .kanban-count {
  background: radial-gradient(circle at 35% 30%, hsl(205, 60%, 45%) 0%, hsl(210, 70%, 26%) 100%);
}

.layout-scene .kanban-column[data-status='done'] .kanban-count {
  background: radial-gradient(circle at 35% 30%, hsl(145, 45%, 38%) 0%, hsl(150, 55%, 20%) 100%);
}

/* a área das folhas avança ~1.4% do palco sobre os postes de cada lado (papéis pregados por cima da
   moldura): os postes têm ~5.7% do palco, então as folhas de painéis vizinhos nunca se encostam */
.layout-scene .kanban-column-body {
  position: absolute;
  inset: 0 -1.4cqw;
  /* espaço no topo: a estampa do projeto sai um pouco acima do papel e a rolagem cortaria */
  padding: 30px 2px 14px;
}

/* ===================== LAYOUT DIÁRIO (mobile/compacto) ===================== */
.layout-journal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.layout-journal .kanban-columns {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  padding-top: 8px;
}

.layout-journal .kanban-column {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 3px solid hsl(22, 42%, 18%);
  /* tábuas horizontais escuras, como os painéis do mural */
  background:
    radial-gradient(ellipse at 50% 30%, rgba(255, 200, 140, 0.08) 0%, rgba(0, 0, 0, 0.35) 100%),
    repeating-linear-gradient(
      180deg,
      hsl(22, 40%, 24%) 0 70px,
      hsl(20, 42%, 16%) 70px 73px,
      hsl(23, 38%, 27%) 73px 140px,
      hsl(20, 42%, 16%) 140px 143px
    );
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.55),
    0 6px 16px rgba(0, 0, 0, 0.55);
}

.layout-journal .kanban-column.is-drop-target {
  border-color: hsl(40, 80%, 60%);
}

/* no diário as abas já dizem a coluna e a contagem */
.layout-journal .kanban-column-header {
  display: none;
}

.layout-journal .kanban-column-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 6px 16px;
}

/* ===================== FOLHAS ===================== */
.kanban-card-wrapper {
  position: relative;
  width: var(--card-w, 136px);
  height: calc(var(--card-h, 170px) + 6px);
  cursor: pointer;
  justify-self: center;
  transform: translate(var(--jx, 0px), var(--jy, 0px)) rotate(var(--jr, 0deg));
}

.kanban-card-scale {
  position: absolute;
  left: 0;
  top: 0;
  width: 160px;
  height: 200px;
  --paper-tilt: 0deg;
  --paper-lift: 0px;
  transform: scale(var(--paper-scale, 0.85)) rotate(var(--paper-tilt)) translateY(var(--paper-lift));
  transform-origin: top left;
  transition:
    transform 140ms ease,
    filter 140ms ease;
}

/* preview do papel na cena: a folha tem 160 px de projeto (escalada depois), então o texto precisa ser maior
   e a margem menor para caber. O `px-5` do preview é !important (utilitário do Vuetify), por isso também aqui. */
.layout-scene .kanban-card-scale :deep(.card-content) {
  padding-top: 12px !important;
  padding-inline: 17px !important;
  font-size: 14px;
  line-height: 1.3;
}

.layout-scene .kanban-card-scale :deep(.title) {
  font-size: 16px;
  line-height: 1.2;
  margin-top: 0;
}

.layout-scene .kanban-card-scale :deep(.description) {
  -webkit-line-clamp: 1;
  line-clamp: 1;
  margin-bottom: 0;
  font-size: 13px;
}

.layout-scene .kanban-card-scale :deep(.pert-summary),
.layout-scene .kanban-card-scale :deep(.checklist) {
  font-size: 12px;
  margin-left: 0;
}

/* "Checklist: 0/0" numa linha só (com a margem maior ele quebrava em duas) */
.layout-scene .kanban-card-scale :deep(.checklist) {
  white-space: nowrap;
}

.layout-scene .kanban-card-scale :deep(.pert-summary) {
  padding: 2px 0;
  margin-bottom: 0;
}

/* folhas sobrepostas na cena: a que está sob o mouse/foco vem para a frente da vizinha */
.layout-scene .kanban-card-wrapper:hover,
.layout-scene .kanban-card-wrapper:focus-within {
  z-index: 20;
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
  z-index: 430;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 245, 225, 0.75);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  cursor: grab;
  font-family: 'Irish Grover', cursive;
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
}

/* em telas de toque o arrasto HTML5 não funciona: a alça só confundiria */
@media (hover: none) {
  .kanban-drag-handle {
    display: none;
  }
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

/* véu escuro com vinheta: escurece a cena sem apagar tudo (as tochas e as bordas continuam visíveis) */
.zoom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1999;
  background: radial-gradient(ellipse at center, rgba(20, 11, 5, 0.6) 0%, rgba(8, 4, 2, 0.9) 100%);
  pointer-events: none;
}

.zoom-backdrop-fade-enter-active,
.zoom-backdrop-fade-leave-active {
  transition: opacity 0.75s ease;
}

.zoom-backdrop-fade-enter-from,
.zoom-backdrop-fade-leave-to {
  opacity: 0;
}

/* a folha ampliada fica acima do véu (o véu é só o fundo) */
.zoom-container > .zoomed-task-paper {
  position: relative;
  z-index: 1;
}

@media (max-width: 480px) {
  .zoom-container {
    max-width: 95vw;
    max-height: 95vh;
    border-radius: 0;
  }
}
</style>
