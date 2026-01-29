<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="600">
    <div class="task-paper-dialog">
      <!-- Imagem de fundo do papel -->
      <v-img 
        src="/svg/old-paper-4.svg" 
        alt="Old Paper" 
        width="500"
        height="620"
        style="z-index: 3;" 
      />
      
      <!-- Conteúdo sobre o papel -->
      <div class="paper-dialog-content">
        <div class="close-button-wrapper">
          <v-btn 
            icon="mdi-close" 
            variant="text" 
            size="small" 
            @click="close"
            class="close-btn"
          />
        </div>

        <div v-if="task || isCreating">
          <template v-if="editing || isCreating">
            <h1 class="paper-title">{{ isCreating ? 'Nova Tarefa' : 'Editar Tarefa' }}</h1>
            
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

            <v-alert v-if="error" type="error" density="compact" class="mt-3">
              {{ error }}
            </v-alert>

            <!-- Botões de ação -->
            <div class="action-buttons">
              <v-btn 
                v-if="editing && task && !isCreating" 
                color="error" 
                variant="outlined" 
                @click="emit('delete')" 
                :loading="saving"
                size="small"
              >
                Excluir
              </v-btn>
              <v-btn 
                color="primary" 
                variant="elevated" 
                @click="save" 
                :loading="saving"
                size="small"
              >
                {{ isCreating ? 'Criar' : 'Salvar' }}
              </v-btn>
            </div>
          </template>
          <template v-else>
            <TaskDetailsView :task="task!" />
          </template>
        </div>
      </div>
    </div>
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
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

.task-paper-dialog {
  position: relative;
  width: 500px;
  height: 620px;
  margin: 0 auto;
}

.paper-dialog-content {
  position: absolute;
  top: 1rem;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  padding: 0 4.5rem;
  overflow-y: auto;
  overflow-x: hidden;
  color: #3e2723;
  font-family: 'MedievalSharp', 'Irish Grover', cursive;
}

.paper-dialog-content::-webkit-scrollbar {
  width: 8px;
}

.paper-dialog-content::-webkit-scrollbar-track {
  background: rgba(201, 166, 107, 0.2);
  border-radius: 4px;
}

.paper-dialog-content::-webkit-scrollbar-thumb {
  background: rgba(139, 90, 43, 0.5);
  border-radius: 4px;
}

.paper-dialog-content::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 90, 43, 0.7);
}

.close-button-wrapper {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
}

.close-btn {
  background: rgba(255, 255, 255, 0.8) !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.paper-title {
  font-family: 'Irish Grover', cursive;
  font-size: 1.75rem;
  font-weight: 400;
  color: #3e2723;
  margin: 0 0 1.5rem 0;
  text-align: center;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
}

.form-section {
  margin-bottom: 0.5rem;
}

.form-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-family: 'MedievalSharp', cursive;
  font-size: 1rem;
  font-weight: 600;
  color: #5d4037;
  margin: 0 0 0.75rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px dashed #c9a66b;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 2px dashed #c9a66b;
}
</style>
