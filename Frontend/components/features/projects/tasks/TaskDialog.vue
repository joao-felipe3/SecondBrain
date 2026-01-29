<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="700">
    <v-card class="task-dialog-card">
      <v-card-title class="task-dialog-header">
        <div class="header-content">
          <span class="header-icon">{{ isCreating ? '➕' : (editing ? '✏️' : '📋') }}</span>
          <span class="header-title">{{ isCreating ? 'Nova Tarefa' : (editing ? 'Editar Tarefa' : 'Detalhes da Tarefa') }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>
      <v-divider />
      <v-card-text class="task-dialog-body">
        <div v-if="task || isCreating">
          <template v-if="editing || isCreating">
            <div class="form-section">
              <v-text-field 
                v-model="localTask.name" 
                label="📝 Nome da tarefa" 
                variant="outlined"
                density="comfortable"
                color="primary"
              />
              <v-textarea 
                v-model="localTask.description" 
                label="📄 Descrição" 
                variant="outlined"
                auto-grow 
                rows="2" 
                density="comfortable"
                color="primary"
              />
            </div>
            
            <div class="form-section">
              <h5 class="section-title">⏱️ Planejamento</h5>
              <div class="dialog-grid">
                <v-text-field 
                  v-model.number="localTask.pomodorosPlanned" 
                  type="number" 
                  label="🍅 Pomodoros" 
                  variant="outlined"
                  density="comfortable"
                  color="primary"
                />
                <v-text-field 
                  v-model="localTask.deadline" 
                  type="date" 
                  label="📅 Deadline" 
                  variant="outlined"
                  density="comfortable"
                  color="primary"
                />
              </div>
            </div>

            <div class="form-section">
              <h5 class="section-title">🎯 Atributos</h5>
              <div class="dialog-grid">
                <v-text-field 
                  v-model.number="localTask.priority" 
                  type="number" 
                  label="⚡ Prioridade (1-4)" 
                  variant="outlined"
                  density="comfortable" 
                  :min="1" 
                  :max="4"
                  color="primary"
                />
                <v-text-field 
                  v-model.number="localTask.difficult" 
                  type="number" 
                  label="💪 Dificuldade (1-4)" 
                  variant="outlined"
                  density="comfortable" 
                  :min="1" 
                  :max="4"
                  color="primary"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <TaskDetailsView :task="task!" />
          </template>
          <v-alert v-if="error" type="error" density="compact" class="mt-3">
            {{ error }}
          </v-alert>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="task-dialog-actions">
        <v-btn variant="text" @click="close">Fechar</v-btn>
        <v-spacer />
        <v-btn v-if="editing && task && !isCreating" color="error" variant="outlined" @click="emit('delete')" :loading="saving" prepend-icon="mdi-delete">
          Excluir
        </v-btn>
        <v-btn v-if="(editing && task) || isCreating" color="primary" variant="elevated" @click="save" :loading="saving" prepend-icon="mdi-content-save">
          {{ isCreating ? 'Criar' : 'Salvar' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import TaskDetailsView from './TaskDetailsView.vue'

interface Task {
  _id?: string
  name: string
  description?: string
  deadline?: string
  pomodorosPlanned?: number
  pomodorosDid?: number
  priority?: number
  difficult?: number
  experience?: number
  prize?: number
  isConcluded: boolean
}

const props = defineProps<{
  modelValue: boolean
  task: Task | null
  editing: boolean
  isCreating: boolean
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', task: any): void
  (e: 'delete'): void
}>()

const localTask = reactive<any>({
  name: '',
  description: '',
  deadline: '',
  pomodorosPlanned: 1,
  pomodorosDid: 0,
  priority: 1,
  difficult: 1,
  isConcluded: false,
})

watch(() => props.task, (task) => {
  if (task) {
    Object.assign(localTask, {
      _id: task._id,
      name: task.name,
      description: task.description || '',
      deadline: task.deadline ? new Date(task.deadline).toISOString().substring(0, 10) : '',
      pomodorosPlanned: task.pomodorosPlanned ?? 0,
      pomodorosDid: task.pomodorosDid ?? 0,
      priority: task.priority ?? null,
      difficult: task.difficult ?? null,
      isConcluded: !!task.isConcluded,
    })
  }
}, { immediate: true })

watch(() => props.isCreating, (creating) => {
  if (creating) {
    Object.assign(localTask, {
      name: '',
      description: '',
      deadline: '',
      pomodorosPlanned: 1,
      pomodorosDid: 0,
      priority: 1,
      difficult: 1,
      isConcluded: false,
    })
  }
})

function close() {
  emit('update:modelValue', false)
}

function save() {
  emit('save', { ...localTask })
}
</script>

<style scoped>
.task-dialog-card {
  border-radius: 12px !important;
  overflow: hidden;
}

.task-dialog-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  font-size: 1.5rem;
}

.header-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.task-dialog-body {
  padding: 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 1.5rem;
}

.form-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
  margin: 0 0 0.75rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e2e8f0;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.task-dialog-actions {
  padding: 1rem 1.5rem;
  background: #f8fafc;
}
</style>
