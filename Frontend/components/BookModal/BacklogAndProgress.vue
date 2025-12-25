<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <div v-if="project" class="backlog-section">
        <h4>💡 Backlog de Ideias</h4>

        <div v-if="editing" class="backlog-form">
          <v-textarea
            v-model="newIdea.text"
            label="Nova ideia ou melhoria"
            variant="solo-filled"
            density="comfortable"
            auto-grow
            rows="2"
            placeholder="Descreva uma ideia ou melhoria para o projeto..."
          />
          <div class="actions">
            <v-btn 
              color="primary" 
              size="small"
              @click="addIdea" 
              :disabled="!newIdea.text.trim()"
            >
              Adicionar
            </v-btn>
          </div>
        </div>
        <div class="backlog-list" v-if="ideas.length">
          <div 
            v-for="(idea, i) in ideas" 
            :key="i" 
            class="backlog-item"
          >
            <div class="item-header">
              <span class="item-number">#{{ i + 1 }}</span>
              <v-btn 
                v-if="editing"
                icon 
                size="x-small" 
                variant="text"
                @click="removeIdea(i)"
              >
                <span class="delete-icon">×</span>
              </v-btn>
            </div>
            <p class="item-text">{{ idea.text }}</p>
            <span class="item-date">{{ formatYMD(idea.createdAt) }}</span>
          </div>
        </div>
        <p v-else class="empty">{{ editing ? 'Nenhuma ideia ainda. Adicione a primeira acima.' : 'Nenhuma ideia cadastrada.' }}</p>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project" class="progress-section">
        <h4 class="mb-4">📊 Progresso do Projeto</h4>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value">{{ completedTasks }}</div>
            <div class="stat-label">Concluídas</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⏳</div>
            <div class="stat-value">{{ pendingTasks }}</div>
            <div class="stat-label">Pendentes</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📈</div>
            <div class="stat-value">{{ completionRate }}%</div>
            <div class="stat-label">Completo</div>
          </div>
        </div>
        <div class="activity-section">
          <div class="activity-header">
            <h5>📅 Atividade</h5>
            <div class="period-selector">
              <button 
                v-for="p in periods" 
                :key="p.value"
                @click="selectedPeriod = p.value"
                :class="{ active: selectedPeriod === p.value }"
                class="period-btn"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <div class="contribution-graph">
            <!-- Ano: grid compacto tipo calendário por mês -->
            <div v-if="selectedPeriod === 'year'" class="year-calendar">
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, ref, watch, computed } from 'vue'
import useDateFormat from '~/composables/utils/useDateFormat'
import { useApiResource } from '~/composables/api/useApi'

type Project = Record<string, any>

interface BacklogIdea {
  text: string
  createdAt: string
}

interface Task {
  _id?: string
  id?: string
  name: string
  description?: string
  deadline?: Date
  pomodorosPlanned?: number
  pomodorosDid?: number
  isConcluded: boolean
}

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const { formatYMD } = useDateFormat()
const tasksApi = useApiResource('/tasks')

// Backlog de Ideias - Página Esquerda
const ideas = ref<BacklogIdea[]>([])
const newIdea = reactive({ text: '' })


const pendingTasks = computed(() => 
  projectTasks.value.filter(t => !t.isConcluded).length
)

const completionRate = computed(() => {
  if (projectTasks.value.length === 0) return 0
  return Math.round((completedTasks.value / projectTasks.value.length) * 100)
})

// Grid de atividades (estilo GitHub)
const activityGrid = computed(() => {
  const today = new Date()
  let days = 7 // semana
  
  if (selectedPeriod.value === 'month') days = 30
  if (selectedPeriod.value === 'year') days = 365
  
  // Cria array de datas
  const dateArray: Date[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dateArray.push(date)
  }
  
  // Conta tarefas concluídas por dia
  const tasksByDate = new Map<string, number>()
  projectTasks.value.forEach(task => {
    if (task.isConcluded && task.deadline) {
      const dateKey = new Date(task.deadline).toISOString().split('T')[0]
      tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1)
    }
  })
  
  // Encontra o máximo para normalizar os níveis
  const maxCount = Math.max(...Array.from(tasksByDate.values()), 1)
  
  // Organiza em semanas (colunas de 7 dias)
  const weeks: Array<Array<{ date: string; count: number; level: number }>> = []
  let currentWeek: Array<{ date: string; count: number; level: number }> = []
  
  // Preenche dias anteriores ao primeiro dia se necessário
  const firstDayOfWeek = dateArray[0].getDay()
  const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Segunda = 0
  
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
  
  // Completa última semana se necessário
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    currentWeek.push({ date: '', count: 0, level: 0 })
  }
  if (currentWeek.length === 7) {
    weeks.push(currentWeek)
  }
  
  return weeks
})

// Organiza atividade por mês (para visualização anual)
const activityByMonth = computed(() => {
  if (selectedPeriod.value !== 'year') return []
  
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const today = new Date()
  const result: Array<{ name: string; weeks: Array<Array<{ date: string; count: number; level: number }>> }> = []
  
  // Conta tarefas concluídas por dia
  const tasksByDate = new Map<string, number>()
  projectTasks.value.forEach(task => {
    if (task.isConcluded && task.deadline) {
      const dateKey = new Date(task.deadline).toISOString().split('T')[0]
      tasksByDate.set(dateKey, (tasksByDate.get(dateKey) || 0) + 1)
    }
  })
  
  // Encontra o máximo para normalizar os níveis
  const maxCount = Math.max(...Array.from(tasksByDate.values()), 1)
  
  // Processa cada um dos últimos 12 meses
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthName = months[monthDate.getMonth()]
    const year = monthDate.getFullYear()
    
    // Pega todos os dias do mês
    const daysInMonth = new Date(year, monthDate.getMonth() + 1, 0).getDate()
    const firstDay = new Date(year, monthDate.getMonth(), 1)
    const firstDayOfWeek = firstDay.getDay() // 0 = domingo
    const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Ajusta para segunda = 0
    
    const monthWeeks: Array<Array<{ date: string; count: number; level: number }>> = []
    let currentWeek: Array<{ date: string; count: number; level: number }> = []
    
    // Preenche dias vazios antes do primeiro dia do mês
    for (let j = 0; j < startDay; j++) {
      currentWeek.push({ date: '', count: 0, level: 0 })
    }
    
    // Adiciona todos os dias do mês
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
    
    // Completa última semana do mês se necessário
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

// Meses visíveis para o label do ano
const visibleMonths = computed(() => {
  if (selectedPeriod.value !== 'year') return []
  
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const today = new Date()
  const result: string[] = []
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
    result.push(months[date.getMonth()])
  }
  
  return result
})

// Funções para Ideias (página esquerda)
function addIdea() {
  if (!newIdea.text.trim()) return
  
  ideas.value.unshift({
    text: newIdea.text.trim(),
    createdAt: new Date().toISOString()
  })
  
  newIdea.text = ''
  persistBacklog()
}

function removeIdea(index: number) {
  ideas.value.splice(index, 1)
  persistBacklog()
}

// Persiste o backlog no projeto
function persistBacklog() {
  emit('update-field', 'backlogIdeas', ideas.value)
}

// Carrega tarefas do projeto
async function loadProjectTasks() {
  const projectId = (props.project as any)?._id || (props.project as any)?.id
  if (!projectId) return
  
  try {
    const { data } = await tasksApi.list()
    if (data && Array.isArray(data)) {
      // Filtra apenas as tarefas deste projeto
      projectTasks.value = data.filter((task: any) => task.project === projectId)
    }
  } catch (error) {
    console.error('Erro ao carregar tarefas:', error)
  }
}

// Carrega dados do projeto
watch(() => props.project, (v) => {
  if (v) {
    // Carrega ideias da página esquerda
    if ((v as any).backlogIdeas && Array.isArray((v as any).backlogIdeas)) {
      ideas.value = [...(v as any).backlogIdeas]
    }
    
    // Carrega tarefas do projeto
    loadProjectTasks()
  }
}, { immediate: true })

// Tarefas do projeto - Página Direita
const projectTasks = ref<Task[]>([])

// Período selecionado e grid de atividades
const selectedPeriod = ref<'week' | 'month' | 'year'>('month')
const periods = [
  { label: 'Semana', value: 'week' as const },
  { label: 'Mês', value: 'month' as const },
  { label: 'Ano', value: 'year' as const }
]

// Computed properties para estatísticas
const completedTasks = computed(() => 
  projectTasks.value.filter(t => t.isConcluded).length
)
</script>

<style scoped>
.backlog-section, .progress-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.backlog-section h4, .progress-section h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

/* Backlog Styles */
.backlog-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
}

.backlog-form .actions {
  display: flex;
  justify-content: flex-end;
}

.backlog-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.25rem;
}

.backlog-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.backlog-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.item-number {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.delete-icon {
  font-size: 1.5rem;
  line-height: 1;
  color: #ef4444;
}

.item-text {
  margin: 0 0 0.5rem 0;
  color: #334155;
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
}

.item-date {
  font-size: 0.75rem;
  color: #94a3b8;
}

/* Progress Styles */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
}

.stat-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
}

/* Activity Section (GitHub-style) */
.activity-section {
  border-top: 2px solid #e2e8f0;
  padding-top: 1rem;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.activity-header h5 {
  margin: 0;
  font-size: 1rem;
  color: #1e293b;
}

.period-selector {
  display: flex;
  gap: 0.25rem;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 0.125rem;
}

.period-btn {
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  color: #64748b;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.period-btn:hover {
  color: #334155;
}

.period-btn.active {
  background: white;
  color: #1e293b;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.contribution-graph {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
}

.months-labels {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  margin-left: 2rem;
}

.month-label {
  font-size: 0.65rem;
  color: #64748b;
  flex: 1;
  text-align: left;
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

.day-cell.level-0 {
  background: #ebedf0;
}
.day-cell.level-1 {
  background: #9be9a8;
}
.day-cell.level-2 {
  background: #40c463;
}
.day-cell.level-3 {
  background: #30a14e;
}
.day-cell.level-4 {
  background: #216e39;
}
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

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
}

.status-icon.completed {
  background: #dcfce7;
  color: #16a34a;
}

.status-icon.pending {
  background: #fef3c7;
  color: #ca8a04;
  font-size: 1.25rem;
}

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}
</style>
