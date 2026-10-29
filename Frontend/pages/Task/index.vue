<template>
  <div class="tasks-page-viewport diegetic-stone-wall">
    <!-- BARRA SUPERIOR DIEGÉTICA DE NAVEGAÇÃO -->
    <header class="diegetic-header-bar">
      <NuxtLink to="/" class="diegetic-btn-back">
        <span class="btn-icon">🏛️</span>
        <span class="btn-text">Retornar ao Saguão</span>
      </NuxtLink>

      <div class="header-title-container">
        <h1 class="header-main-title">⚔️ Mural de Missões da Guilda</h1>
        <p class="header-subtitle">Quadro de avisos, contratos de trabalho e expedições ativas</p>
      </div>

      <div class="header-status-badge">
        <span class="status-count">{{ allTasks.length }} Missões</span>
      </div>
    </header>

    <main class="tasks-main-content">
      <v-row
        dense
        class="fill-height"
        :class="{ 'ml-n8': !isMobile, 'ma-0': isMobile }"
        style="height: 100%"
      >
        <TaskMain
          :tasks="tasks"
          :allTasks="allTasks"
          :projects="projects"
          :project-filter="selectedProjectFilter"
          :type-filter="selectedTypeFilter"
          :priority-filter="selectedPriorityFilter"
          :view-mode="viewMode"
          :zoomed="zoomed"
          :initialZoomedTask="newlyCreatedTask"
          :isMobile="isMobile"
          @zoom-in="onZoomStart"
          @zoom-out="onZoomEnd"
          @remove-last-task="removeLastTask"
          @task-moved="handleTaskMoved"
          @task-created="handleTaskCreated"
        />
        <TaskSidebar
          v-if="!isMobile && !zoomed"
          :projects="projects"
          :project-filter="selectedProjectFilter"
          :type-filter="selectedTypeFilter"
          :priority-filter="selectedPriorityFilter"
          :due-today-count="habitsDueTodayCount"
          @update:projectFilter="selectedProjectFilter = $event"
          @update:typeFilter="selectedTypeFilter = $event"
          @update:priorityFilter="selectedPriorityFilter = $event"
          @request-habit-notifications="enableHabitNotifications"
        />
      </v-row>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTaskStore } from '~/stores/task';
import useTaskHelpers from '~/composables/features/useTaskHelpers';
import { useApiResource } from '~/composables/api';
import TaskMain from '../../components/features/tasks/layout/Main.vue';
import TaskSidebar from '../../components/features/tasks/layout/Sidebar.vue';

// Route
const route = useRoute();

// Responsive
const MOBILE_BREAKPOINT = 960;
const isMobile = ref(false);
const viewMode = ref('kanban');

function checkMobile() {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
}

// Estado local
const zoomed = ref(false);
const activeIcon = ref('goal');
const newlyCreatedTask = ref(null); // Garante que o Board nunca inicie com zoom
const silenceHabitNotifications = ref(false);
const notificationPermission = ref('default');
const habitNotificationStateKey = 'secondbrain:habit-notifications:sent';
const habitSilenceStateKey = 'secondbrain:habit-notifications:silenced';

// Store
const taskStore = useTaskStore();
const tasks = ref([]);
const allTasks = ref([]); // All tasks including completed ones
const selectedProjectFilter = ref('');
const selectedTypeFilter = ref('');
const selectedPriorityFilter = ref('');

const habitsDueToday = computed(() => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return taskStore.tasks.filter((task) => {
    if (task?.microTaskType !== 'habit') return false;
    if (task?.isConcluded || task?.status === 'done') return false;
    if (!task?.deadline) return false;

    const deadline = new Date(task.deadline);
    if (Number.isNaN(deadline.getTime())) return false;
    deadline.setHours(0, 0, 0, 0);

    return deadline.getTime() === startOfToday.getTime();
  });
});

const habitsDueTodayCount = computed(() => {
  return taskStore.habitsDashboard?.dueTodayCount ?? habitsDueToday.value.length;
});

function loadHabitNotificationPreferences() {
  if (typeof window === 'undefined') return;

  silenceHabitNotifications.value = window.localStorage.getItem(habitSilenceStateKey) === 'true';

  if ('Notification' in window) {
    notificationPermission.value = Notification.permission;
  }
}

watch(silenceHabitNotifications, (value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(habitSilenceStateKey, String(value));

  if (!value) {
    sendHabitBrowserNotifications();
  }
});

function readHabitNotificationLog() {
  if (typeof window === 'undefined') {
    return { date: '', ids: [] as string[] };
  }

  try {
    const raw = window.localStorage.getItem(habitNotificationStateKey);
    if (!raw) return { date: '', ids: [] as string[] };
    const parsed = JSON.parse(raw);
    return {
      date: String(parsed?.date || ''),
      ids: Array.isArray(parsed?.ids) ? parsed.ids.map((id: any) => String(id)) : [],
    };
  } catch {
    return { date: '', ids: [] as string[] };
  }
}

function saveHabitNotificationLog(state: { date: string; ids: string[] }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(habitNotificationStateKey, JSON.stringify(state));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function canSendBrowserNotifications() {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted' && !silenceHabitNotifications.value;
}

function sendHabitBrowserNotifications() {
  if (!canSendBrowserNotifications()) return;

  const dueHabits = habitsDueToday.value;
  if (!dueHabits.length) return;

  const todayKey = getTodayKey();
  const state = readHabitNotificationLog();
  const nextState = state.date === todayKey ? { ...state } : { date: todayKey, ids: [] as string[] };
  let changed = false;

  for (const habit of dueHabits) {
    const habitId = String(habit._id || '');
    if (!habitId || nextState.ids.includes(habitId)) continue;

    try {
      new Notification('Lembrete de hábito', {
        body: `${habit.name || 'Hábito'} vence hoje.`,
        tag: `habit-${habitId}-${todayKey}`,
      });
      nextState.ids.push(habitId);
      changed = true;
    } catch (error) {
      console.error('Falha ao criar notificação do hábito:', error);
    }
  }

  if (changed) {
    saveHabitNotificationLog(nextState);
  }
}

async function refreshHabitsDashboard() {
  await taskStore.loadHabitsDashboard(selectedProjectFilter.value || undefined);
  sendHabitBrowserNotifications();
}

async function enableHabitNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  const permission = await Notification.requestPermission();
  notificationPermission.value = permission;
  if (permission === 'granted') {
    sendHabitBrowserNotifications();
  }
}

onMounted(() => {
  newlyCreatedTask.value = null; // Garante que o Board nunca inicie com zoom
  loadHabitNotificationPreferences();
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile);
});

async function loadInitialTasks() {
  await taskStore.loadTasks();
  // Copy arrays to ensure Vue updates even when Pinia mutates items in-place.
  allTasks.value = taskStore.tasks.slice(); // Keep all tasks
  tasks.value = taskStore.tasks
    .slice()
    .filter((task) => task.isConcluded !== true)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
}

function handleTaskMoved() {
  // Kanban updates the store; resync local refs so props passed down update immediately.
  allTasks.value = taskStore.tasks.slice();
  tasks.value = taskStore.tasks
    .slice()
    .filter((task) => task.isConcluded !== true)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  void refreshHabitsDashboard();
}

// Manipulação de zoom
const onZoomStart = () => (zoomed.value = true);
const onZoomEnd = () => {
  zoomed.value = false;
  newlyCreatedTask.value = null;
};

// Helpers
const { createNewTask } = useTaskHelpers();

function handleTaskCreated() {
  const task = createNewTask();
  tasks.value.push(task);
  newlyCreatedTask.value = task;
  void refreshHabitsDashboard();
}

function removeLastTask(taskId) {
  tasks.value = tasks.value.filter((task) => task._id !== taskId);
}

// Projetos mockados
const projects = ref([]);
const api = useApiResource('/projects');

onMounted(async () => {
  // Load tasks first as before
  newlyCreatedTask.value = null;
  await loadInitialTasks();
  await refreshHabitsDashboard();

  // Deep link de tarefa (?taskId=...): localizar a tarefa correspondente em allTasks e abrir no zoom
  if (route.query.taskId) {
    const targetId = String(route.query.taskId);
    const taskList = allTasks.value.length > 0 ? allTasks.value : taskStore.tasks;
    const match = taskList.find((t: any) => String(t._id || t.id) === targetId);
    if (match) {
      newlyCreatedTask.value = match;
      zoomed.value = true;
    }
  }

  // Then load projects from backend
  try {
    const { data, error } = await api.list();
    if (error) {
      console.error('Failed to load projects for /task page', error);
    } else if (data) {
      projects.value = Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error('Unexpected error loading projects', e);
  }
});

watch(
  () => route.query.taskId,
  (newTaskId) => {
    if (newTaskId) {
      const targetId = String(newTaskId);
      const taskList = allTasks.value.length > 0 ? allTasks.value : taskStore.tasks;
      const match = taskList.find((t: any) => String(t._id || t.id) === targetId);
      if (match) {
        newlyCreatedTask.value = match;
        zoomed.value = true;
      }
    } else if (!newTaskId && zoomed.value) {
      zoomed.value = false;
      newlyCreatedTask.value = null;
    }
  },
);

watch(selectedProjectFilter, () => {
  void refreshHabitsDashboard();
});
</script>

<style scoped>
.tasks-page-viewport {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.tasks-main-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  padding: 0.5rem 0;
}
</style>
