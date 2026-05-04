<template>
  <div class="habit-timeline-tab">
    <h3 class="tab-title">📅 Timeline - Últimas 4 Semanas</h3>
    
    <div class="timeline-header">
      <button @click="goToPreviousPeriod" class="btn-period">← Anterior</button>
      <span class="period-label">{{ periodLabel }}</span>
      <button @click="goToNextPeriod" class="btn-period">Próximo →</button>
    </div>

    <div class="weeks-grid">
      <div v-for="week in weeks" :key="week.id" class="week-card">
        <div class="week-header">
          <span class="week-label">{{ week.label }}</span>
          <span class="week-completion">{{ week.completions }}/{{ week.target }}</span>
        </div>
        
        <div class="days-row">
          <div 
            v-for="day in week.days" 
            :key="day.id"
            class="day-cell"
            :class="getDayStatus(day)"
            :title="getDayTooltip(day)"
          >
            <span class="day-label">{{ day.label }}</span>
            <span v-if="isDayCompleted(day)" class="completion-marker">✓</span>
            <span v-else-if="isDaySkipped(day)" class="skip-marker">⊘</span>
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-legend">
      <div class="legend-item">
        <span class="legend-color completed"></span>
        <span>Completado</span>
      </div>
      <div class="legend-item">
        <span class="legend-color skipped"></span>
        <span>Pulado</span>
      </div>
      <div class="legend-item">
        <span class="legend-color missed"></span>
        <span>Não feito</span>
      </div>
      <div class="legend-item">
        <span class="legend-color future"></span>
        <span>Futuro</span>
      </div>
    </div>

    <div class="timeline-stats">
      <div class="stat">
        <span class="stat-label">Sequência Atual</span>
        <span class="stat-value">{{ currentStreak }} dias 🔥</span>
      </div>
      <div class="stat">
        <span class="stat-label">Melhor Sequência</span>
        <span class="stat-value">{{ longestStreak }} dias</span>
      </div>
      <div class="stat">
        <span class="stat-label">Taxa de Aderência</span>
        <span class="stat-value">{{ adherenceRate }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  task?: any
}

const props = defineProps<Props>()

const currentPeriodOffset = ref(0)

const periodLabel = computed(() => {
  const today = new Date()
  const period = new Date(today)
  period.setDate(period.getDate() - currentPeriodOffset.value * 28)
  const endDate = new Date(period)
  const startDate = new Date(period)
  startDate.setDate(startDate.getDate() - 27)
  
  return `${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')}`
})

const weeks = computed(() => {
  const today = new Date()
  const baseDate = new Date(today)
  baseDate.setDate(baseDate.getDate() - currentPeriodOffset.value * 28)
  
  const weeks = []
  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(baseDate)
    weekStart.setDate(weekStart.getDate() - 27 + w * 7)
    
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + d)
      days.push({
        id: date.toISOString().split('T')[0],
        label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 2),
        date: date,
      })
    }
    
    weeks.push({
      id: `week-${w}`,
      label: `Semana ${w + 1}`,
      days,
      completions: Math.floor(Math.random() * 7),
      target: 5,
    })
  }
  return weeks
})

const currentStreak = computed(() => props.task?.currentStreak || 0)
const longestStreak = computed(() => props.task?.longestStreak || 0)
const adherenceRate = computed(() => {
  if (!props.task) return 0
  return Math.round((props.task.completedDays || 0) / (props.task.totalDays || 1) * 100)
})

const goToPreviousPeriod = () => {
  currentPeriodOffset.value++
}

const goToNextPeriod = () => {
  if (currentPeriodOffset.value > 0) {
    currentPeriodOffset.value--
  }
}

const isDayCompleted = (day: any) => {
  return Math.random() > 0.6 // Mock data
}

const isDaySkipped = (day: any) => {
  return !isDayCompleted(day) && Math.random() > 0.7 // Mock data
}

const getDayStatus = (day: any) => {
  const now = new Date()
  if (day.date > now) return 'future'
  if (isDayCompleted(day)) return 'completed'
  if (isDaySkipped(day)) return 'skipped'
  return 'missed'
}

const getDayTooltip = (day: any) => {
  const dateStr = day.date.toLocaleDateString('pt-BR')
  const status = getDayStatus(day)
  const statusText = {
    completed: 'Completado',
    skipped: 'Pulado',
    missed: 'Não feito',
    future: 'Futuro',
  }
  return `${dateStr} - ${statusText[status]}`
}
</script>

<style scoped>
.habit-timeline-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  overflow-y: auto;
  overflow-x: hidden;
}

.tab-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #2c1810;
  margin: 0;
  font-family: 'Irish Grover', cursive;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.btn-period {
  padding: 0.35rem 0.7rem;
  border: 2px solid #b8934a;
  background-color: #fdfaf3;
  color: #2c1810;
  border-radius: 4px;
  font-family: 'Irish Grover', cursive;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-period:hover {
  background-color: #b8934a;
  color: #fdfaf3;
}

.period-label {
  font-family: 'Irish Grover', cursive;
  font-size: 0.9rem;
  color: #3d2817;
  font-weight: 500;
}

.weeks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.week-card {
  background-color: #fdfaf3;
  border: 2px solid #d4a574;
  border-radius: 6px;
  padding: 0.9rem;
}

.week-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.7rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid #d4a574;
}

.week-label {
  font-family: 'Irish Grover', cursive;
  font-weight: 600;
  font-size: 0.9rem;
  color: #2c1810;
}

.week-completion {
  font-size: 0.8rem;
  color: #b8934a;
  font-weight: 600;
}

.days-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.2rem;
}

.day-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid #d4a574;
  border-radius: 4px;
  padding: 0.1rem;
  font-size: 0.6rem;
  font-family: 'Irish Grover', cursive;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.day-cell.completed {
  background-color: #c8e6c9;
  border-color: #81c784;
}

.day-cell.completed:hover {
  background-color: #a5d6a7;
}

.day-cell.skipped {
  background-color: #fff9c4;
  border-color: #fbc02d;
}

.day-cell.missed {
  background-color: #ffccbc;
  border-color: #ff7043;
}

.day-cell.future {
  background-color: #f0f0f0;
  border-color: #bdbdbd;
  cursor: default;
}

.day-label {
  font-weight: 600;
  color: #2c1810;
}

.completion-marker,
.skip-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.8rem;
}

.timeline-legend {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.7rem;
  background-color: #fdfaf3;
  border-radius: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Irish Grover', cursive;
  font-size: 0.8rem;
  color: #3d2817;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid #b8934a;
}

.legend-color.completed {
  background-color: #c8e6c9;
}

.legend-color.skipped {
  background-color: #fff9c4;
}

.legend-color.missed {
  background-color: #ffccbc;
}

.legend-color.future {
  background-color: #f0f0f0;
}

.timeline-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  padding: 0.7rem;
  background-color: #fdfaf3;
  border-radius: 6px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #7d6b5a;
  font-family: 'Irish Grover', cursive;
}

.stat-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #b8934a;
  font-family: 'Irish Grover', cursive;
}

/* Custom scrollbar to match EditarTab */
.habit-timeline-tab::-webkit-scrollbar {
  width: 6px;
}

.habit-timeline-tab::-webkit-scrollbar-track {
  background: transparent;
}

.habit-timeline-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.habit-timeline-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
