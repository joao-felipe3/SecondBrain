<!--
  Mural de Contratos da Guilda (/tasks e /Task). As duas rotas são wrappers finos com
  `definePageMeta({ layout: false })`; aqui fica a tela: cena pintada no desktop, diário no mobile.
-->
<template>
  <v-app class="mural-app">
    <div
      class="mural-viewport"
      :class="{ 'is-compact': layoutMode === 'journal', 'is-scene': layoutMode === 'scene' }"
      :style="boardVars"
    >
      <!-- fundo desfocado: cobre as sobras em telas mais largas que a arte (ultrawide 32:9) -->
      <img class="mural-backdrop" :src="backgroundUrl" alt="" aria-hidden="true" />

      <!-- ======== DESKTOP / TABLET DEITADO: quadro pintado com o kanban encaixado ======== -->
      <div
        v-if="layoutMode === 'scene'"
        ref="stageRef"
        class="mural-stage"
        :class="{ 'is-zoomed': zoomed }"
      >
        <img class="mural-bg" :src="backgroundUrl" alt="Mural de Contratos da Guilda" />
        <MuralFlames />

        <TaskMain
          layout="scene"
          :tasks="tasks"
          :allTasks="allTasks"
          :projects="projects"
          :project-filter="selectedProjectFilter"
          :type-filter="selectedTypeFilter"
          :priority-filter="selectedPriorityFilter"
          :view-mode="viewMode"
          :zoomed="zoomed"
          :initialZoomedTask="newlyCreatedTask"
          :isMobile="false"
          :create-button-width="createButtonWidth"
          @zoom-in="onZoomStart"
          @zoom-out="onZoomEnd"
          @remove-last-task="removeLastTask"
          @task-moved="handleTaskMoved"
          @task-created="handleTaskCreated"
        />

        <!-- HUD ancorado no palco -->
        <NuxtLink to="/" class="diegetic-btn-back mural-back" title="Retornar ao Saguão">
          <span class="btn-icon">🏛️</span>
          <span class="btn-text">Retornar ao Saguão</span>
        </NuxtLink>

        <header class="mural-sign">
          <span class="sign-rope rope-left" aria-hidden="true"></span>
          <span class="sign-rope rope-right" aria-hidden="true"></span>
          <div class="sign-board">
            <span class="sign-icon" aria-hidden="true">⚔️</span>
            <div class="sign-text">
              <h1 class="sign-title">Mural de Contratos</h1>
              <!-- livro-caixa: mesmas contas do antigo StatsCard -->
              <span class="sign-subtitle sign-ledger">
                📜 {{ ledger.pending.count }} a cumprir · {{ ledger.pending.time }}
                <span class="ledger-sep" aria-hidden="true">✦</span>
                🏆 {{ ledger.completed.count }} cumpridas · {{ ledger.completed.time }}
              </span>
            </div>
            <button
              type="button"
              class="sign-sound"
              :title="isMuted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'"
              @click="toggleMute"
            >
              {{ isMuted ? '🔇' : '🔊' }}
            </button>
          </div>
        </header>

        <!-- filtros + sinos ficam na gaveta: as laterais do palco são do quadro -->
        <button
          v-if="!zoomed"
          type="button"
          class="mural-filter-toggle"
          :class="{ 'has-active': activeFilterCount > 0 }"
          @click="filtersOpen = true"
        >
          🔍 Filtros<span v-if="activeFilterCount" class="filter-dot">{{ activeFilterCount }}</span
          ><span
            v-if="habitsDueTodayCount"
            class="bell-dot"
            :title="`${habitsDueTodayCount} hábitos hoje`"
            >🔔</span
          >
        </button>
      </div>

      <!-- ======== MOBILE / COMPACTO: diário de campo com abas de madeira ======== -->
      <div v-else-if="layoutMode === 'journal'" class="mural-journal">
        <header class="journal-sign">
          <NuxtLink
            to="/"
            class="journal-back"
            title="Retornar ao Saguão"
            aria-label="Retornar ao Saguão"
            >🏛️</NuxtLink
          >
          <div class="sign-board">
            <span class="sign-rope rope-left" aria-hidden="true"></span>
            <span class="sign-rope rope-right" aria-hidden="true"></span>
            <div class="sign-text">
              <h1 class="sign-title">Mural de Contratos</h1>
              <span class="sign-subtitle">{{ allTasks.length }} missões</span>
            </div>
          </div>
          <button
            type="button"
            class="journal-sound"
            :title="isMuted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'"
            @click="toggleMute"
          >
            {{ isMuted ? '🔇' : '🔊' }}
          </button>
        </header>

        <MuralStatsLedger inline class="journal-ledger" :tasks="allTasks" />

        <div class="journal-board">
          <TaskMain
            layout="journal"
            :tasks="tasks"
            :allTasks="allTasks"
            :projects="projects"
            :project-filter="selectedProjectFilter"
            :type-filter="selectedTypeFilter"
            :priority-filter="selectedPriorityFilter"
            :view-mode="viewMode"
            :zoomed="zoomed"
            :initialZoomedTask="newlyCreatedTask"
            :isMobile="true"
            @zoom-in="onZoomStart"
            @zoom-out="onZoomEnd"
            @remove-last-task="removeLastTask"
            @task-moved="handleTaskMoved"
            @task-created="handleTaskCreated"
          />
        </div>

        <!-- prancha inferior: novo contrato + filtros/lembretes -->
        <nav v-if="!zoomed" class="journal-plank" aria-label="Ações do mural">
          <button type="button" class="plank-btn plank-create" @click="handleTaskCreated">
            <span aria-hidden="true">✒️</span> Novo Contrato
          </button>
          <button
            type="button"
            class="plank-btn plank-filters"
            :class="{ 'has-active': activeFilterCount > 0 }"
            @click="filtersOpen = true"
          >
            <span aria-hidden="true">🔍</span> Filtros
            <span v-if="activeFilterCount" class="filter-dot">{{ activeFilterCount }}</span>
            <span
              v-if="habitsDueTodayCount"
              class="bell-dot"
              :title="`${habitsDueTodayCount} hábitos hoje`"
              >🔔</span
            >
          </button>
        </nav>
      </div>

      <!-- gaveta de filtros e lembretes (mobile e telas sem espaço para o pergaminho lateral) -->
      <transition name="drawer">
        <div v-if="filtersOpen" class="filter-drawer-scrim" @click.self="filtersOpen = false">
          <aside class="filter-drawer" role="dialog" aria-modal="true" aria-label="Filtros e lembretes">
            <header class="drawer-head">
              <h2>Filtros & Lembretes</h2>
              <button
                type="button"
                class="drawer-close"
                aria-label="Fechar"
                @click="filtersOpen = false"
              >
                ✕
              </button>
            </header>
            <TaskSidebar
              variant="board"
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
          </aside>
        </div>
      </transition>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTaskStore } from '~/stores/task';
import useTaskHelpers from '~/composables/features/useTaskHelpers';
import { useApiResource } from '~/composables/api';
import TaskMain from '../layout/Main.vue';
import TaskSidebar from '../layout/Sidebar.vue';
import MuralStatsLedger from '../layout/MuralStatsLedger.vue';
import MuralFlames from './MuralFlames.vue';
import { summarizeTasks } from '~/composables/features/taskStats';
import { useGuildAudio } from '~/composables/ui/useGuildAudio';
import { TASKS_BG_URL, boardCssVars, isCompactMural } from '~/composables/ui/useTasksScene';
import { zoomedPaperSize } from '~/composables/ui/useZoomAnimation';

// Route
const route = useRoute();

// Responsive: `scene` = quadro pintado (desktop/tablet deitado); `journal` = diário com abas.
// Só é decidido no cliente (null no SSR) para o HTML do servidor não divergir do da hidratação.
const layoutMode = ref<'scene' | 'journal' | null>(null);
const isMobile = computed(() => layoutMode.value === 'journal');
const viewportW = ref(1920);
const viewportH = ref(1080);
const viewMode = ref('kanban');

function checkMobile() {
  viewportW.value = window.innerWidth;
  viewportH.value = window.innerHeight;
  layoutMode.value = isCompactMural(viewportW.value, viewportH.value) ? 'journal' : 'scene';
}

// palco 16:9 (mesma conta do CSS de .mural-stage)
const stageWidth = computed(() => Math.min(viewportW.value, (viewportH.value * 16) / 9));
const createButtonWidth = computed(() =>
  Math.round(Math.min(320, Math.max(180, stageWidth.value * 0.15))),
);

const backgroundUrl = TASKS_BG_URL;
const ledger = computed(() => summarizeTasks(allTasks.value));
const boardVars = boardCssVars();
const filtersOpen = ref(false);
const { isMuted, toggleMute } = useGuildAudio();

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
const activeFilterCount = computed(
  () =>
    [selectedProjectFilter.value, selectedTypeFilter.value, selectedPriorityFilter.value].filter(Boolean)
      .length,
);

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

// Cópias locais da store (o kanban recebe `allTasks`). Antes só eram refeitas no carregamento e
// depois de um arrasto: contrato criado/excluído/editado e o auto-refresh de 10 s não chegavam ao
// quadro até recarregar a página.
function syncFromStore() {
  allTasks.value = taskStore.tasks.slice();
  tasks.value = taskStore.tasks
    .slice()
    .filter((task) => task.isConcluded !== true)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
}

function handleTaskMoved() {
  // Kanban updates the store; resync local refs so props passed down update immediately.
  syncFromStore();
  void refreshHabitsDashboard();
}

// Lista trocada (auto-refresh) ou com outro tamanho (criar/excluir/próxima ocorrência de hábito).
// Durante o zoom não: a folha aberta não deve mudar por baixo da edição (sincroniza ao fechar).
// Adiado para uma macrotarefa: quem disparou a mudança (ex.: HabitPreview, que emite
// `complete-habit` depois do await) ainda está montado quando emite; se o cartão trocasse de
// coluna antes, o Vue descartaria o emit e o aviso "Hábito completado" sumiria.
let syncTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [taskStore.tasks, taskStore.tasks.length],
  () => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (!zoomed.value) syncFromStore();
    }, 0);
  },
);
onBeforeUnmount(() => {
  if (syncTimer) clearTimeout(syncTimer);
});

// Manipulação de zoom
// Zoom da cena: o palco escala e desloca para que a folha aberta fique no centro da tela (sem mostrar a borda
// do palco). O deslocamento é calculado antes de o Vue aplicar a classe, então o palco ainda está sem transform.
const stageRef = ref<HTMLElement | null>(null);
// o palco amplia na mesma proporção que o papel: 1.75 quando o papel era 3.25x o cartão (520 px de altura)
const STAGE_PER_PAPER = 1.75 / 2;
function onZoomStart(paperRect?: DOMRect | null) {
  zoomed.value = true;
  const stage = stageRef.value;
  if (!stage || !paperRect) return;
  const frame = stage.parentElement?.getBoundingClientRect();
  if (!frame) return;
  // quanto o papel ampliado é maior que o cartão na tela (a altura é a referência)
  const paperGain = zoomedPaperSize().h / paperRect.height;
  const ZOOM_SCALE = Math.max(1.4, Math.min(3, paperGain * STAGE_PER_PAPER));
  stage.style.setProperty('--zoom-s', ZOOM_SCALE.toFixed(3));
  const cx = frame.left + frame.width / 2;
  const cy = frame.top + frame.height / 2;
  const px = paperRect.left + paperRect.width / 2;
  const py = paperRect.top + paperRect.height / 2;
  // o ponto da folha, depois do scale em torno do centro, vai para o centro: t = -s * (P - C)
  // limitado para não mostrar a borda do palco (com s, o palco cobre o quadro de -(s-1)/2 a +(s-1)/2)
  const maxX = ((ZOOM_SCALE - 1) * stage.offsetWidth) / 2;
  const maxY = ((ZOOM_SCALE - 1) * stage.offsetHeight) / 2;
  const tx = Math.max(-maxX, Math.min(maxX, -ZOOM_SCALE * (px - cx)));
  const ty = Math.max(-maxY, Math.min(maxY, -ZOOM_SCALE * (py - cy)));
  stage.style.setProperty('--zoom-tx', `${tx.toFixed(1)}px`);
  stage.style.setProperty('--zoom-ty', `${ty.toFixed(1)}px`);
}
const onZoomEnd = () => {
  zoomed.value = false;
  newlyCreatedTask.value = null;
  // edições feitas na folha aberta (e o que chegou durante o zoom) aparecem no quadro ao fechar
  syncFromStore();
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
/* ============ BASE ============ */
.mural-app {
  background: #0e0805 !important;
}

.mural-viewport {
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #0e0805;
  color: var(--guild-parchment-base, #f4e4bc);
}

/* cópia desfocada da arte: preenche as sobras ao redor do palco (32:9) e o fundo do diário mobile */
.mural-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 45%;
  transform: scale(1.08);
  filter: blur(14px) brightness(0.42) saturate(0.9);
  pointer-events: none;
  user-select: none;
}

/* ============ PALCO 16:9 (cena) ============
   Geometria espelhada em composables/ui/useTasksScene.ts (TASKS_STAGE_MODE). */
.mural-stage {
  position: relative;
  z-index: 1;
  width: min(100vw, calc(100dvh * 16 / 9));
  height: min(100dvh, calc(100vw * 9 / 16));
  container-type: size;
}

.mural-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 27.5% 47%;
  transform: scale(1.3);
  transform-origin: 27.5% 47%;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}

/* ao abrir uma folha, o palco inteiro (fundo, quadro e tochas) dá um leve zoom para o centro, junto com o véu
   escuro (no KanbanBoard, por <Teleport>): a folha aberta fica como o foco da cena */
.mural-stage {
  transition: transform 0.75s ease;
}

.mural-stage.is-zoomed {
  transform: translate(var(--zoom-tx, 0px), var(--zoom-ty, 0px)) scale(var(--zoom-s, 1.75));
}

.mural-stage > :deep(.task-main) {
  z-index: 2;
}

/* voltar ao saguão: canto superior esquerdo do palco */
.mural-back {
  position: absolute;
  left: 1.4cqw;
  top: 2cqh;
  z-index: 6;
  font-size: clamp(11px, 0.8cqw, 16px);
  text-decoration: none;
}

/* placa pendurada com o nome do salão, acima das placas rúnicas do quadro */
.mural-sign {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 6;
  transform: translateX(-50%);
  padding-top: 2.2cqh;
  font-size: clamp(12px, 1.05cqw, 22px);
}

.sign-rope {
  position: absolute;
  top: 0;
  width: 4px;
  height: calc(2.2cqh + 6px);
  border-radius: 2px;
  background: repeating-linear-gradient(-35deg, hsl(33, 45%, 52%) 0 3px, hsl(28, 40%, 30%) 3px 5px);
  box-shadow: 1px 0 2px rgba(0, 0, 0, 0.5);
}

.rope-left {
  left: 18%;
}

.rope-right {
  right: 18%;
}

.sign-board {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7em;
  padding: 0.45em 0.75em 0.45em 1em;
  border-radius: 9px;
  border: 4px solid transparent;
  background:
    radial-gradient(
        ellipse at 50% 40%,
        var(--guild-parchment-base, #f4e4bc) 0%,
        var(--guild-parchment-dark, #d8bc82) 100%
      )
      padding-box,
    repeating-linear-gradient(
        90deg,
        hsl(24, 38%, 30%) 0 7px,
        hsl(22, 42%, 24%) 7px 11px,
        hsl(25, 35%, 34%) 11px 16px
      )
      border-box;
  box-shadow:
    inset 0 0 14px rgba(110, 75, 40, 0.4),
    0 0 0 1px rgba(20, 12, 6, 0.85),
    0 6px 16px rgba(0, 0, 0, 0.65);
}

/* na cena, a placa usa o mesmo pergaminho envelhecido dos rótulos das colunas (sem faixa quase branca) */
.mural-sign .sign-board {
  background:
    radial-gradient(ellipse at 50% 40%, hsl(40, 36%, 80%) 0%, hsl(36, 28%, 67%) 100%) padding-box,
    repeating-linear-gradient(
        90deg,
        hsl(24, 38%, 30%) 0 7px,
        hsl(22, 42%, 24%) 7px 11px,
        hsl(25, 35%, 34%) 11px 16px
      )
      border-box;
  box-shadow:
    inset 0 0 16px rgba(95, 55, 25, 0.5),
    0 0 0 1px rgba(20, 12, 6, 0.85),
    0 6px 16px rgba(0, 0, 0, 0.65);
}

.sign-icon {
  font-size: 1.35em;
  line-height: 1;
}

.sign-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.sign-title {
  margin: 0;
  font-family: var(--font-guild-title, serif);
  font-size: 1.45em;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: 0.6px;
  white-space: nowrap;
  color: var(--guild-wood-dark, #2b1810);
  text-shadow: 0 1px 0 rgba(255, 245, 220, 0.6);
}

.sign-subtitle {
  font-size: 0.72em;
  white-space: nowrap;
  color: hsl(25, 38%, 32%);
}

/* livro-caixa da placa da cena: maior e mais escuro (era 0.72em em marrom médio, difícil de ler) */
.mural-sign .sign-subtitle {
  margin-top: 0.15em;
  font-size: 0.86em;
  font-weight: 600;
  color: hsl(22, 45%, 14%);
}

.sign-sound,
.journal-sound {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 2em;
  height: 2em;
  border-radius: 50%;
  border: 1.5px solid var(--guild-wood-mid, #5c3a1e);
  background: radial-gradient(circle at 35% 30%, hsl(36, 45%, 70%) 0%, hsl(30, 40%, 50%) 100%);
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.45),
    0 1px 3px rgba(0, 0, 0, 0.4);
  font-size: 0.85em;
  cursor: pointer;
}

.mural-filter-toggle {
  position: absolute;
  z-index: 6;
  right: 1.4cqw;
  top: 2cqh;
  font-size: clamp(11px, 0.85cqw, 16px);
}

/* botões de madeira (filtros no palco estreito e na prancha mobile) */
.mural-filter-toggle,
.plank-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  padding: 0.5em 0.95em;
  border-radius: 8px;
  border: 1.5px solid hsl(30, 45%, 40%);
  background: linear-gradient(180deg, hsl(24, 35%, 26%) 0%, hsl(20, 40%, 16%) 100%);
  color: hsl(38, 65%, 86%);
  font-family: var(--font-guild-title, serif);
  letter-spacing: 0.4px;
  box-shadow:
    inset 0 1px 0 rgba(255, 215, 160, 0.2),
    0 4px 10px rgba(0, 0, 0, 0.55);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mural-filter-toggle:hover,
.plank-btn:hover {
  background: linear-gradient(180deg, hsl(28, 40%, 32%) 0%, hsl(22, 45%, 20%) 100%);
}

.has-active {
  border-color: hsl(42, 80%, 58%);
}

.filter-dot {
  display: inline-grid;
  place-items: center;
  min-width: 1.3em;
  height: 1.3em;
  padding: 0 0.25em;
  border-radius: 999px;
  background: hsl(0, 65%, 40%);
  color: #fff;
  font-family: var(--font-guild-body, sans-serif);
  font-size: 0.75em;
}

/* ============ DIÁRIO (mobile / compacto) ============ */
.is-compact .mural-backdrop {
  object-position: 50% 42%;
  transform: scale(1.02);
  filter: blur(2px) brightness(0.36) saturate(0.85);
}

.mural-journal {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 760px;
  height: 100dvh;
  box-sizing: border-box;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px calc(10px + env(safe-area-inset-bottom, 0px));
  place-self: stretch center;
}

.journal-sign {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.journal-sign .sign-board {
  justify-content: center;
  padding: 0.35em 0.7em;
}

.journal-sign .sign-rope {
  top: auto;
  bottom: 100%;
  height: calc(14px + env(safe-area-inset-top, 0px));
}

.journal-sign .sign-title {
  font-size: clamp(0.95rem, 4.6vw, 1.15rem);
}

.journal-back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1.5px solid hsl(30, 45%, 40%);
  background: linear-gradient(180deg, hsl(24, 35%, 26%) 0%, hsl(20, 40%, 16%) 100%);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.55);
  font-size: 1.15rem;
  text-decoration: none;
}

.journal-sound {
  width: 42px;
  height: 42px;
  font-size: 1rem;
}

.journal-ledger {
  font-size: 13px;
}

.journal-board {
  flex: 1 1 auto;
  min-height: 0;
}

.journal-board > :deep(.task-main) {
  height: 100%;
}

.journal-plank {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 8px;
  padding: 6px;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 220, 170, 0.12) 0%, transparent 35%, rgba(0, 0, 0, 0.25) 100%),
    repeating-linear-gradient(
      90deg,
      hsl(24, 38%, 28%) 0 9px,
      hsl(22, 42%, 22%) 9px 13px,
      hsl(25, 35%, 32%) 13px 21px
    );
  border: 1px solid rgba(15, 9, 4, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 150, 0.25),
    0 8px 22px rgba(0, 0, 0, 0.7);
}

.plank-btn {
  position: relative;
  min-height: 46px;
  font-size: 0.95rem;
}

.plank-create {
  color: var(--guild-wood-dark, #2b1810);
  border-color: hsl(30, 40%, 30%);
  background: radial-gradient(
    ellipse at 50% 35%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
}

.plank-create:hover {
  background: radial-gradient(
    ellipse at 50% 35%,
    hsl(40, 75%, 92%) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
}

.bell-dot {
  font-size: 0.8em;
}

.ledger-sep {
  margin: 0 0.45em;
  opacity: 0.55;
  font-size: 0.8em;
}

/* celular deitado: altura curta, o livro-caixa sai para sobrar espaço para as folhas */
@media (max-height: 480px) {
  .journal-ledger {
    display: none;
  }
  .mural-journal {
    gap: 6px;
    padding-top: calc(6px + env(safe-area-inset-top, 0px));
  }
  .journal-sign .sign-subtitle {
    display: none;
  }
  .plank-btn {
    min-height: 40px;
  }
}

/* ============ GAVETA DE FILTROS ============ */
.filter-drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(8, 4, 2, 0.55);
  display: flex;
  justify-content: flex-end;
}

.filter-drawer {
  width: min(360px, 92vw);
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px));
  color: var(--guild-parchment-ink, #3b2414);
  background: radial-gradient(
    ellipse at 40% 20%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border-left: 6px solid hsl(22, 42%, 22%);
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.6);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(92, 58, 30, 0.35);
}

.drawer-head h2 {
  margin: 0;
  font-family: var(--font-guild-title, serif);
  font-size: 1.2rem;
  font-weight: 400;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(92, 58, 30, 0.5);
  background: rgba(140, 95, 50, 0.15);
  font-size: 1rem;
  cursor: pointer;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-enter-active .filter-drawer,
.drawer-leave-active .filter-drawer {
  transition: transform 0.25s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .filter-drawer,
.drawer-leave-to .filter-drawer {
  transform: translateX(100%);
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
