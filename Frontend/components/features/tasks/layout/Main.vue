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
        @zoom-in="$emit('zoom-in')"
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
        @zoom-in="$emit('zoom-in')"
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
        <SvgButton
          label="Novo Contrato"
          @click="$emit('task-created')"
          :disabled="false"
          :width="createButtonWidth"
          :height="Math.round(createButtonWidth / 4.4)"
          :labelSize="Math.round(createButtonWidth / 15)"
          style="font-family: 'Irish Grover', cursive"
        />
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import TaskBoard from '../board/Board.vue';
import TaskKanbanBoard from '../kanban/KanbanBoard.vue';
import SvgButton from '../../../ui/svg/Button.vue';
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

.create-anchor :deep(.button-label) {
  white-space: nowrap;
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
