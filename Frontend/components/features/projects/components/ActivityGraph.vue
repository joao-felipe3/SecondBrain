<template>
  <div class="contribution-graph">
    <!-- Ano: grid compacto tipo calendário por mês -->
    <div v-if="period === 'year'" class="year-calendar">
      <div v-for="(monthData, mIdx) in activityByMonth" :key="mIdx" class="month-section">
        <div class="month-header">{{ monthData.name }}</div>
        <div class="calendar-weekdays">
          <span class="calendar-weekday">S</span>
          <span class="calendar-weekday">T</span>
          <span class="calendar-weekday">Q</span>
          <span class="calendar-weekday">Q</span>
          <span class="calendar-weekday">S</span>
          <span class="calendar-weekday">S</span>
          <span class="calendar-weekday">D</span>
        </div>
        <div class="month-calendar-grid">
          <div v-for="(week, wIdx) in monthData.weeks" :key="wIdx" class="calendar-row">
            <div 
              v-for="(day, dIdx) in week" 
              :key="dIdx"
              :class="['day-cell', 'year-cell', `level-${day.level}`, { empty: !day.date }]"
              :title="day.date ? `${day.date}: ${day.count} tarefa(s) concluída(s)` : ''"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Semana/Mês: células grandes -->
    <div v-else class="weeks-calendar">
      <div class="calendar-weekdays">
        <span class="calendar-weekday">Seg</span>
        <span class="calendar-weekday">Ter</span>
        <span class="calendar-weekday">Qua</span>
        <span class="calendar-weekday">Qui</span>
        <span class="calendar-weekday">Sex</span>
        <span class="calendar-weekday">Sáb</span>
        <span class="calendar-weekday">Dom</span>
      </div>
      <div class="calendar-grid">
        <div v-for="(week, wIdx) in activityGrid" :key="wIdx" class="calendar-row">
          <div 
            v-for="(day, dIdx) in week" 
            :key="dIdx"
            :class="['day-cell', 'big-cell', `level-${day.level}`]"
            :title="`${day.date}: ${day.count} tarefa(s) concluída(s)`"
          ></div>
        </div>
      </div>
    </div>

    <div class="legend">
      <span class="legend-label">Menos</span>
      <div class="day-cell level-0"></div>
      <div class="day-cell level-1"></div>
      <div class="day-cell level-2"></div>
      <div class="day-cell level-3"></div>
      <div class="day-cell level-4"></div>
      <span class="legend-label">Mais</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Task {
  _id?: string
  id?: string
  name: string
  deadline?: Date
  isConcluded: boolean
}

interface DayCell {
  date: string
  count: number
  level: number
}

const props = defineProps<{
  tasks: Task[]
  period: 'week' | 'month' | 'year'
}>()

// Grid de atividades para semana/mês
const activityGrid = computed(() => {
  const today = new Date()
  let days = 7
  
  if (props.period === 'month') days = 30
  if (props.period === 'year') days = 365
  
  const dateArray: Date[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dateArray.push(date)
  }
  
  const tasksByDate = new Map<string, number>()
  props.tasks.forEach(task => {
    if (task.isConcluded && task.deadline) {
      const dateKey = new Date(task.deadline).toISOString().split('T')[0]
      tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1)
    }
  })
  
  const maxCount = Math.max(...Array.from(tasksByDate.values()), 1)
  
  const weeks: DayCell[][] = []
  let currentWeek: DayCell[] = []
  
  const firstDayOfWeek = dateArray[0].getDay()
  const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
  
  for (let i = 0; i < startDay; i++) {
    currentWeek.push({ date: '', count: 0, level: 0 })
  }
  
  dateArray.forEach(date => {
    const dateKey = date.toISOString().split('T')[0]
    const count = tasksByDate.get(dateKey) || 0
    const level = count === 0 ? 0 : Math.min(Math.ceil((count / maxCount) * 4), 4)
    
    currentWeek.push({
      date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count,
      level
    })
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  })
  
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    currentWeek.push({ date: '', count: 0, level: 0 })
  }
  if (currentWeek.length === 7) {
    weeks.push(currentWeek)
  }
  
  return weeks
})

// Atividade por mês (para visualização anual)
const activityByMonth = computed(() => {
  if (props.period !== 'year') return []
  
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const today = new Date()
  const result: { name: string; weeks: DayCell[][] }[] = []
  
  const tasksByDate = new Map<string, number>()
  props.tasks.forEach(task => {
    if (task.isConcluded && task.deadline) {
      const dateKey = new Date(task.deadline).toISOString().split('T')[0]
      tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1)
    }
  })
  
  const maxCount = Math.max(...Array.from(tasksByDate.values()), 1)
  
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthName = months[monthDate.getMonth()]
    const year = monthDate.getFullYear()
    
    const daysInMonth = new Date(year, monthDate.getMonth() + 1, 0).getDate()
    const firstDay = new Date(year, monthDate.getMonth(), 1)
    const firstDayOfWeek = firstDay.getDay()
    const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
    
    const monthWeeks: DayCell[][] = []
    let currentWeek: DayCell[] = []
    
    for (let j = 0; j < startDay; j++) {
      currentWeek.push({ date: '', count: 0, level: 0 })
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthDate.getMonth(), day)
      const dateKey = date.toISOString().split('T')[0]
      const count = tasksByDate.get(dateKey) || 0
      const level = count === 0 ? 0 : Math.min(Math.ceil((count / maxCount) * 4), 4)
      
      currentWeek.push({
        date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        count,
        level
      })
      
      if (currentWeek.length === 7) {
        monthWeeks.push(currentWeek)
        currentWeek = []
      }
    }
    
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push({ date: '', count: 0, level: 0 })
    }
    if (currentWeek.length === 7) {
      monthWeeks.push(currentWeek)
    }
    
    result.push({ name: `${monthName} ${year}`, weeks: monthWeeks })
  }
  
  return result
})
</script>

<style scoped>
.contribution-graph {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
}

/* Calendário horizontal para semana/mês */
.weeks-calendar {
  width: 100%;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.calendar-weekday {
  font-size: 0.7rem;
  color: #64748b;
  text-align: center;
  font-weight: 500;
}

.calendar-grid {
  display: grid;
  grid-template-rows: auto;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.calendar-row {
  display: contents;
}

.big-cell {
  width: 24px;
  height: 24px;
  margin: 0 auto;
}

.day-cell {
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
}

.day-cell:hover {
  outline: 2px solid #64748b;
  outline-offset: 1px;
}

/* Calendário anual compacto */
.year-calendar {
  width: 100%;
  max-height: 400px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  padding: 0rem;
}

.month-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.5rem;
}

.month-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.25rem;
  text-align: center;
}

.month-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  grid-auto-rows: 12px;
}

.month-calendar-grid .calendar-row {
  display: contents;
}

.year-cell {
  width: 100%;
  height: 12px;
  margin: 0;
  max-width: 14px;
  justify-self: center;
}

.year-cell.empty {
  background: transparent !important;
  cursor: default;
}

.year-cell.empty:hover {
  outline: none;
}

.day-cell.level-0 { background: #ebedf0; }
.day-cell.level-1 { background: #9be9a8; }
.day-cell.level-2 { background: #40c463; }
.day-cell.level-3 { background: #30a14e; }
.day-cell.level-4 { background: #216e39; }

.legend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  justify-content: flex-end;
}

.legend-label {
  font-size: 0.65rem;
  color: #64748b;
}

.legend .day-cell {
  width: 12px;
  height: 12px;
  cursor: default;
}

.legend .day-cell:hover {
  outline: none;
}
</style>
