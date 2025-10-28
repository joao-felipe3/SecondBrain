<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <v-textarea 
            v-model="local.shortTermGoal" 
            label="Objetivo curto prazo" 
            variant="solo-filled" 
            density="comfortable" 
            auto-grow 
            rows="3" 
            @update:model-value="emitField('shortTermGoal', $event)" 
          />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div v-if="project">
          <h4>🎯 Objetivo de Médio Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.midTermGoal" 
              label="Objetivo médio prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('midTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.midTermGoal }}</p>
        </div>
        <div v-if="project">
          <h4>🎯 Objetivo de Longo Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.longTermGoal" 
              label="Objetivo longo prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('longTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.longTermGoal }}</p>
        </div>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project" class="tasks-summary">
        <h4>📋 Tarefas do Projeto</h4>

        <div v-if="loading" class="loading-message">Carregando tarefas...</div>
        
        <div v-else-if="tasks.length > 0" class="task-list">
          <div 
            v-for="task in tasks" 
            :key="task._id"
            class="task-item"
            :class="{ completed: task.isConcluded }"
          >
            <div class="task-status">
              <span v-if="task.isConcluded" class="status-icon completed">✓</span>
              <span v-else class="status-icon pending">○</span>
            </div>
            <div class="task-info">
              <div class="task-name">{{ task.name }}</div>
              <div class="task-meta">
                <span v-if="task.deadline" class="task-deadline">
                  {{ formatYMD(task.deadline) }}
                </span>
                <span v-if="task.pomodorosPlanned" class="task-pomodoros">
                  🍅 {{ task.pomodorosDid || 0 }}/{{ task.pomodorosPlanned }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <p v-else class="empty">Nenhuma tarefa cadastrada ainda.</p>
        
        <p v-if="error" class="error-message">Erro ao carregar tarefas</p>
      </div>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import { useApi } from '~/composables/useApi'
import type { PropType } from 'vue'
import { reactive, watch, ref } from 'vue'

const { formatYMD } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const tasks = ref<any[]>([])
const loading = ref(false)
const error = ref<null | any>(null)

function getProjectId(p: any) {
  return p && (p._id || p.id || p.id === 0) ? (p._id || p.id) : null
}

async function fetchTasksForProject(p: any) {
  tasks.value = []
  error.value = null
  const id = getProjectId(p)
  if (!id) return
  loading.value = true
  try {
    const api = useApi(`/projects/${id}/tasks`)
    const { data, error: e } = await api.get()
    if (e) throw e
    tasks.value = data || []
  } catch (err) {
    error.value = err
    console.error('Error fetching tasks for project', err)
  } finally {
    loading.value = false
  }
}

// Sincroniza apenas os campos específicos desta página
watch(() => props.project, (v) => { 
  if (v) {
    local.shortTermGoal = v.shortTermGoal
    local.midTermGoal = v.midTermGoal
    local.longTermGoal = v.longTermGoal
    fetchTasksForProject(v)
  }
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.shortTermGoal = props.project.shortTermGoal
    local.midTermGoal = props.project.midTermGoal
    local.longTermGoal = props.project.longTermGoal
  }
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
</script>

<style scoped>
.tasks-summary {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tasks-summary h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.subtitle {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: #64748b;
  font-style: italic;
}

.loading-message {
  text-align: center;
  color: #64748b;
  padding: 2rem 0;
  font-style: italic;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  padding-right: 0.25rem;
  flex: 1;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.task-item.completed {
  opacity: 0.7;
}

.task-status {
  flex-shrink: 0;
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

.task-info {
  flex: 1;
  min-width: 0;
}

.task-name {
  font-size: 0.9rem;
  color: #1e293b;
  font-weight: 500;
  margin-bottom: 0.25rem;
  word-break: break-word;
}

.task-item.completed .task-name {
  text-decoration: line-through;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}

.task-deadline, .task-pomodoros {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}

.error-message {
  color: #ef4444;
  text-align: center;
  margin-top: 1rem;
  font-size: 0.875rem;
}
</style>

