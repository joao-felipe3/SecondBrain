<template>
  <div class="calendar-page-viewport">
    <!-- BARRA SUPERIOR DIEGÉTICA DE NAVEGAÇÃO -->
    <header class="diegetic-header-bar">
      <button class="back-to-hall-btn" @click="handleBackToHall">
        <span class="btn-icon">🏛️</span>
        <span class="btn-text">Retornar ao Saguão</span>
      </button>

      <div class="header-title-container">
        <h1 class="header-main-title">📜 Cartografia & Calendário da Guilda</h1>
        <p class="header-subtitle">
          Cronograma de missões, ciclos lunares e prazos estratégicos
        </p>
      </div>

      <div class="header-status-badge">
        <span class="status-rune">✨</span>
        <span class="status-date">{{ formattedToday }}</span>
      </div>
    </header>

    <!-- ÁREA PRINCIPAL DO GRIMÓRIO DE CARTOGRAFIA -->
    <main class="calendar-main-content">
      <div class="calendar-parchment-frame diegetic-parchment">
        <!-- CABEÇALHO DO MÊS COM NAVEGAÇÃO -->
        <div class="calendar-month-header">
          <button class="month-nav-btn" @click="prevMonth">
            <span>‹</span>
          </button>

          <h2 class="month-display-title">
            {{ currentMonthName }}
            <span class="year-label">{{ currentYear }}</span>
          </h2>

          <button class="month-nav-btn" @click="nextMonth">
            <span>›</span>
          </button>
        </div>

        <!-- DIAS DA SEMANA -->
        <div class="calendar-weekdays-row">
          <span
            v-for="dayName in weekDays"
            :key="dayName"
            class="weekday-label"
          >
            {{ dayName }}
          </span>
        </div>

        <!-- GRADE DE DIAS -->
        <div class="calendar-grid">
          <div
            v-for="(day, index) in calendarDays"
            :key="index"
            class="calendar-day-cell"
            :class="{
              'is-empty': !day.date,
              'is-today': day.isToday,
              'is-selected': day.isSelected,
              'has-events': day.tasks.length > 0,
            }"
            @click="selectDay(day)"
          >
            <div v-if="day.date" class="cell-content">
              <span class="day-number">{{ day.dayNumber }}</span>

              <!-- INDICADORES DE MISSÕES / TAREFAS -->
              <div v-if="day.tasks.length > 0" class="task-pips-container">
                <span
                  v-for="(task, tIdx) in day.tasks.slice(0, 3)"
                  :key="tIdx"
                  class="task-pip"
                  :class="`priority-${task.priority || 'medium'}`"
                  :title="task.name"
                ></span>
                <span v-if="day.tasks.length > 3" class="task-pip-more">
                  +{{ day.tasks.length - 3 }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- PAINEL INFERIOR: DETALHES DO DIA SELECIONADO -->
        <div class="selected-day-details-panel">
          <div class="panel-header">
            <span class="panel-icon">⚔️</span>
            <h3 class="panel-title">
              Missões para {{ formattedSelectedDate }}
            </h3>
          </div>

          <div
            v-if="selectedDayTasks.length === 0"
            class="no-tasks-placeholder"
          >
            <p>
              Nenhuma missão registrada para este dia no livro de registros.
            </p>
          </div>

          <div v-else class="tasks-scroll-list">
            <div
              v-for="task in selectedDayTasks"
              :key="task._id"
              class="calendar-task-card"
            >
              <div
                class="task-status-indicator"
                :class="`status-${task.status}`"
              ></div>
              <div class="task-info">
                <h4 class="task-name">{{ task.name }}</h4>
                <p v-if="task.description" class="task-desc">
                  {{ task.description }}
                </p>
              </div>
              <span class="task-badge" :class="`badge-${task.priority}`">
                {{ task.priority || "Normal" }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useTaskStore } from "~/stores/task";
import { useUiGuildStore } from "~/stores/uiGuild";
import { useGuildAudio } from "~/composables/ui/useGuildAudio";

const router = useRouter();
const taskStore = useTaskStore();
const uiGuildStore = useUiGuildStore();
const { playSFX, playPaperFlipSound } = useGuildAudio();

const currentDate = ref(new Date());
const selectedDate = ref(new Date());

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const currentYear = computed(() => currentDate.value.getFullYear());
const currentMonthName = computed(
  () => monthNames[currentDate.value.getMonth()],
);

const formattedToday = computed(() => {
  const now = new Date();
  return now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
});

const formattedSelectedDate = computed(() => {
  return selectedDate.value.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

interface CalendarDay {
  date: Date | null;
  dayNumber: number | null;
  isToday: boolean;
  isSelected: boolean;
  tasks: any[];
}

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const days: CalendarDay[] = [];

  // Dias em branco antes do início do mês
  for (let i = 0; i < firstDayIndex; i++) {
    days.push({
      date: null,
      dayNumber: null,
      isToday: false,
      isSelected: false,
      tasks: [],
    });
  }

  const today = new Date();
  const tasks = taskStore.tasks || [];

  for (let d = 1; d <= totalDays; d++) {
    const dayDate = new Date(year, month, d);
    const isToday =
      today.getDate() === d &&
      today.getMonth() === month &&
      today.getFullYear() === year;

    const isSelected =
      selectedDate.value.getDate() === d &&
      selectedDate.value.getMonth() === month &&
      selectedDate.value.getFullYear() === year;

    // Tarefas com deadline nesta data
    const dayTasks = tasks.filter((t: any) => {
      if (!t.dueDate && !t.deadline) return false;
      const tDate = new Date(t.dueDate || t.deadline);
      return (
        tDate.getDate() === d &&
        tDate.getMonth() === month &&
        tDate.getFullYear() === year
      );
    });

    days.push({
      date: dayDate,
      dayNumber: d,
      isToday,
      isSelected,
      tasks: dayTasks,
    });
  }

  return days;
});

const selectedDayTasks = computed(() => {
  const sDate = selectedDate.value;
  const tasks = taskStore.tasks || [];
  return tasks.filter((t: any) => {
    if (!t.dueDate && !t.deadline) return false;
    const tDate = new Date(t.dueDate || t.deadline);
    return (
      tDate.getDate() === sDate.getDate() &&
      tDate.getMonth() === sDate.getMonth() &&
      tDate.getFullYear() === sDate.getFullYear()
    );
  });
});

function prevMonth() {
  playPaperFlipSound();
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1,
  );
}

function nextMonth() {
  playPaperFlipSound();
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1,
  );
}

function selectDay(day: CalendarDay) {
  if (!day.date) return;
  playPaperFlipSound();
  selectedDate.value = day.date;
}

function handleBackToHall() {
  playSFX("footsteps-stone");
  router.push("/");
}

onMounted(() => {
  uiGuildStore.setActiveRoom("calendar");
  taskStore.loadTasks?.();
});
</script>

<style scoped>
.calendar-page-viewport {
  width: 100vw;
  min-height: 100vh;
  background: radial-gradient(
    circle at 50% 20%,
    #2a1810 0%,
    #140c08 60%,
    #0a0604 100%
  );
  color: var(--guild-parchment-base, #f4e4bc);
  font-family: var(--font-guild-body, sans-serif);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* HEADER DIEGÉTICO */
.diegetic-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 2.5rem;
  background: linear-gradient(
    to bottom,
    rgba(28, 20, 14, 0.95) 0%,
    rgba(20, 12, 8, 0.8) 100%
  );
  border-bottom: 2px solid var(--guild-wood-light, #5c3a1e);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  z-index: 10;
}

.back-to-hall-btn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: linear-gradient(135deg, #451a03 0%, #1c140e 100%);
  border: 1.5px solid var(--guild-gold-glow, #d4af37);
  border-radius: 8px;
  padding: 0.6rem 1.2rem;
  color: var(--guild-parchment-base, #f4e4bc);
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: all 0.25s ease;
}

.back-to-hall-btn:hover {
  transform: translateY(-2px);
  border-color: #fef08a;
  box-shadow: 0 6px 18px rgba(250, 204, 21, 0.4);
}

.header-title-container {
  text-align: center;
}

.header-main-title {
  font-family: var(--font-guild-title, serif);
  color: #fbbf24;
  font-size: 1.6rem;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
}

.header-subtitle {
  font-size: 0.85rem;
  color: #d8bc82;
  margin: 0.2rem 0 0 0;
}

.header-status-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--guild-wood-light, #5c3a1e);
  border-radius: 20px;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  color: #fef08a;
}

/* ÁREA PRINCIPAL */
.calendar-main-content {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.calendar-parchment-frame {
  width: 100%;
  max-width: 900px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.calendar-month-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid var(--guild-wood-mid, #5c3a1e);
  padding-bottom: 1rem;
}

.month-nav-btn {
  background: var(--guild-wood-dark, #2b1810);
  border: 1.5px solid var(--guild-gold-glow, #d4af37);
  color: #fef08a;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  font-size: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.month-nav-btn:hover {
  transform: scale(1.1);
  background: #451a03;
  box-shadow: 0 0 10px rgba(250, 204, 21, 0.4);
}

.month-display-title {
  font-family: var(--font-guild-title, serif);
  font-size: 1.6rem;
  color: var(--guild-wood-dark, #2b1810);
  margin: 0;
}

.year-label {
  color: #713f12;
  font-size: 1.2rem;
}

/* DIAS DA SEMANA */
.calendar-weekdays-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  gap: 0.5rem;
}

.weekday-label {
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.9rem;
  color: var(--guild-wood-mid, #5c3a1e);
}

/* GRADE DO CALENDÁRIO */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
}

.calendar-day-cell {
  aspect-ratio: 1;
  border: 1px solid rgba(92, 58, 30, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.calendar-day-cell:not(.is-empty):hover {
  background: rgba(255, 255, 255, 0.6);
  border-color: var(--guild-gold-glow, #d4af37);
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.calendar-day-cell.is-empty {
  background: transparent;
  border-color: transparent;
  cursor: default;
}

.calendar-day-cell.is-today {
  border: 2px solid #b45309;
  background: rgba(254, 240, 138, 0.4);
}

.calendar-day-cell.is-selected {
  border: 2px solid var(--guild-gold-glow, #d4af37);
  background: rgba(250, 204, 21, 0.35);
  box-shadow: inset 0 0 10px rgba(217, 119, 6, 0.3);
}

.cell-content {
  padding: 0.4rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.day-number {
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.95rem;
  color: var(--guild-wood-dark, #2b1810);
}

.task-pips-container {
  display: flex;
  gap: 3px;
  align-items: center;
}

.task-pip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.task-pip.priority-high {
  background: #dc2626;
}

.task-pip.priority-medium {
  background: #d97706;
}

.task-pip.priority-low {
  background: #16a34a;
}

.task-pip-more {
  font-size: 0.65rem;
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
}

/* PAINEL INFERIOR */
.selected-day-details-panel {
  border-top: 2px solid var(--guild-wood-mid, #5c3a1e);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-title {
  font-family: var(--font-guild-title, serif);
  font-size: 1.15rem;
  color: var(--guild-wood-dark, #2b1810);
  margin: 0;
}

.no-tasks-placeholder {
  color: #713f12;
  font-style: italic;
  font-size: 0.9rem;
}

.tasks-scroll-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-height: 180px;
  overflow-y: auto;
}

.calendar-task-card {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid var(--guild-wood-light, #854d0e);
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
}

.task-status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.task-status-indicator.status-todo {
  background: #dc2626;
}

.task-status-indicator.status-doing {
  background: #2563eb;
}

.task-status-indicator.status-done {
  background: #16a34a;
}

.task-info {
  flex: 1;
}

.task-name {
  font-weight: bold;
  font-size: 0.9rem;
  color: var(--guild-wood-dark, #2b1810);
  margin: 0;
}

.task-desc {
  font-size: 0.75rem;
  color: #713f12;
  margin: 0.2rem 0 0 0;
}

.task-badge {
  font-size: 0.7rem;
  font-weight: bold;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.task-badge.badge-high {
  background: rgba(220, 38, 38, 0.15);
  color: #991b1b;
}

.task-badge.badge-medium {
  background: rgba(217, 119, 6, 0.15);
  color: #92400e;
}

.task-badge.badge-low {
  background: rgba(22, 163, 74, 0.15);
  color: #166534;
}
</style>
