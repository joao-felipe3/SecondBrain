<template>
  <!-- `scene`: kanban sobre os painéis pintados do mural (palco 16:9); `journal`: diário com abas -->
  <div class="task-main" :class="`main-${layout}`">
    <ClientOnly>
      <TaskKanbanBoard
        v-if="viewMode === 'kanban'"
        :layout="layout"
        :tasks="filteredTasks"
        :projects="projects"
        :project-filter="projectFilter"
        :type-filter="typeFilter"
        :priority-filter="priorityFilter"
        :is-refreshing="isRefreshing"
        :time-since-refresh="timeSinceRefresh"
        :initial-zoomed-task="initialZoomedTask"
        @zoom-in="$emit('zoom-in', $event)"
        @zoom-out="$emit('zoom-out')"
        @remove-last-task="$emit('remove-last-task', $event)"
        @task-moved="$emit('task-moved', $event)"
      />

      <TaskBoard
        v-else
        :tasks="tasks"
        :projects="projects"
        :showAllTasks="showAllTasks"
        @show-more-available="handleShowMoreAvailable"
        @zoom-in="$emit('zoom-in', $event)"
        @zoom-out="$emit('zoom-out')"
        @remove-last-task="$emit('remove-last-task', $event)"
        :initialZoomedTask="initialZoomedTask"
      />

      <template #fallback>
        <div style="width: 100%; height: 100%" />
      </template>
    </ClientOnly>

    <!-- botão de novo contrato sentado no trilho inferior do quadro (no diário fica na prancha da página) -->
    <transition name="fade" appear>
      <div v-if="!zoomed && layout === 'scene'" class="create-anchor">
        <!-- tábua de madeira com ferragens, no mesmo estilo do quadro -->
        <button type="button" class="create-plank" @click="$emit('task-created')">
          <span class="plank-label">Novo Contrato</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import TaskBoard from '../board/Board.vue';
import TaskKanbanBoard from '../kanban/KanbanBoard.vue';
import { useTaskStore } from '~/stores/task';
import { matchesTaskFilters } from '~/composables/features/taskFilters';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  zoomed: { type: Boolean, default: false },
  initialZoomedTask: { type: Object, default: null },
  allTasks: { type: Array, default: () => [] },
  isMobile: { type: Boolean, default: false },
  viewMode: { type: String, default: 'kanban' },
  projectFilter: { type: String, default: '' },
  typeFilter: { type: String, default: '' },
  priorityFilter: { type: String, default: '' },
  layout: { type: String, default: 'scene' },
  /** largura do botão "Novo Contrato" em px (a página calcula pela largura do palco) */
  createButtonWidth: { type: Number, default: 260 },
});
defineEmits(['zoom-in', 'zoom-out', 'remove-last-task', 'task-created', 'task-moved']);

const showMoreAvailable = ref(false);
const showAllTasks = ref(false);

// Filter state
const isRefreshing = ref(false);
const timeSinceRefresh = ref(0);
let refreshInterval = null;

const handleShowMoreAvailable = (available) => {
  showMoreAvailable.value = available;
};

const handleShowMoreClick = () => {
  showAllTasks.value = true;
};

// Apply filters to tasks (projeto, tipo e prioridade: ver composables/features/taskFilters.ts)
const filteredTasks = computed(() =>
  (props.allTasks || []).filter((task) => {
    // Hide recurring templates (recurringRule + isRecurringInstance=false).
    // Backend creates template + first occurrence; Kanban should show only occurrences.
    if (task?.recurringRule && task?.isRecurringInstance === false && !task?.parentRecurringId) {
      return false;
    }
    return matchesTaskFilters(task, {
      projectFilter: props.projectFilter,
      typeFilter: props.typeFilter,
      priorityFilter: props.priorityFilter,
    });
  }),
);

// Auto-refresh every 10s
onMounted(() => {
  refreshInterval = setInterval(async () => {
    timeSinceRefresh.value += 1;
    if (timeSinceRefresh.value >= 10) {
      await manualRefresh();
    }
  }, 1000);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});

async function manualRefresh() {
  if (isRefreshing.value) return;

  try {
    isRefreshing.value = true;
    const taskStore = useTaskStore();
    await taskStore.loadTasks();
    timeSinceRefresh.value = 0;
  } catch (err) {
    const error = err || {};
    const aborted =
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.message?.includes?.('aborted');

    if (!aborted) {
      console.error('Erro ao atualizar tarefas:', err);
    }
  } finally {
    isRefreshing.value = false;
  }
}
</script>

<style scoped>
.task-main {
  position: relative;
}

.main-scene {
  position: absolute;
  inset: 0;
}

.main-journal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* centro do trilho inferior do quadro (variáveis --rail-* do palco, em cqw/cqh) */
.create-anchor {
  position: absolute;
  left: calc(var(--rail-x) + var(--rail-w) / 2);
  top: calc(var(--rail-y) + var(--rail-h) * 0.5);
  transform: translate(-50%, -50%);
  z-index: 5;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));
}

.create-plank {
  position: relative;
  display: grid;
  place-items: center;
  /* tamanho em relação ao palco: ~1/5 da largura do quadro e uma tábua bem grossa */
  width: 19cqw;
  min-width: 220px;
  height: 6.2cqw;
  min-height: 56px;
  padding: 0 2.2cqw;
  /* aro de latão: destaca o botão da madeira do quadro */
  border: 4px solid hsl(42, 58%, 50%);
  border-radius: 10px;
  cursor: pointer;
  /* madeira amostrada do próprio quadro (hsl 14-18, sat ~72%, luz ~30%), com veios e brilho no topo */
  background:
    repeating-linear-gradient(
      180deg,
      transparent 0 0.9cqw,
      rgba(70, 22, 8, 0.38) 0.9cqw 1.05cqw,
      transparent 1.05cqw 2.1cqw
    ),
    linear-gradient(
      180deg,
      rgba(255, 190, 120, 0.22) 0%,
      rgba(255, 190, 120, 0) 22%,
      rgba(0, 0, 0, 0) 70%,
      rgba(30, 10, 4, 0.3) 100%
    ),
    linear-gradient(180deg, hsl(16, 70%, 37%) 0%, hsl(14, 72%, 30%) 55%, hsl(13, 70%, 24%) 100%);
  /* relevo de botão: aro claro por dentro, contorno escuro por fora e uma "borda de baixo" marcada */
  outline: 2px solid hsl(38, 55%, 26%);
  outline-offset: 0;
  box-shadow:
    inset 0 0 0 2px rgba(255, 236, 180, 0.45),
    inset 0 3px 0 rgba(255, 240, 200, 0.5),
    0 8px 0 hsl(14, 62%, 13%),
    0 13px 18px rgba(0, 0, 0, 0.55);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    filter 0.12s ease;
}

/* pregos de ferro nos cantos, como os do quadro */
.create-plank::before,
.create-plank::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 0.9cqw;
  min-width: 9px;
  min-height: 9px;
  height: 0.9cqw;
  transform: translateY(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #c9ccd1 0%, #4b5563 65%, #111827 100%);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
}

.create-plank::before {
  left: 0.9cqw;
}

.create-plank::after {
  right: 0.9cqw;
}

.create-plank:hover {
  filter: brightness(1.12);
}

.create-plank:active {
  transform: translateY(6px);
  box-shadow:
    inset 0 0 0 3px rgba(255, 200, 130, 0.12),
    inset 0 4px 8px rgba(20, 8, 2, 0.5),
    0 2px 0 hsl(14, 62%, 13%),
    0 4px 8px rgba(0, 0, 0, 0.5);
}

.create-plank:focus-visible {
  outline: 3px solid rgba(255, 205, 110, 0.85);
  outline-offset: 4px;
}

/* letreiro entalhado: fonte do título do quadro, com sombra escura e um realce claro embaixo */
.plank-label {
  font-family: 'Irish Grover', cursive;
  font-size: 2.1cqw;
  font-size: clamp(16px, 2.1cqw, 40px);
  line-height: 1;
  white-space: nowrap;
  color: hsl(42, 80%, 90%);
  text-shadow:
    0 2px 0 rgba(20, 10, 4, 0.9),
    0 0 6px rgba(20, 10, 4, 0.5),
    0 -1px 0 rgba(255, 230, 180, 0.15);
  letter-spacing: 0.04em;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
