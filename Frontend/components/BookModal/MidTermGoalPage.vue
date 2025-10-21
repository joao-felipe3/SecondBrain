<template>
  <div class="page-container" :class="{ editing }">
    <!-- Página Esquerda: Backlog de Ideias -->
    <div class="page left-page">
      <div v-if="project" class="backlog-section">
        <h4>💡 Backlog de Ideias</h4>
        <p class="subtitle">Possíveis melhorias e funcionalidades</p>

        <div class="backlog-form">
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
        <p v-else class="empty">Nenhuma ideia ainda. Adicione a primeira acima.</p>
      </div>
    </div>

    <!-- Página Direita: Backlog de Tarefas Técnicas -->
    <div class="page right-page">
      <div v-if="project" class="backlog-section">
        <h4>🔧 Backlog Técnico</h4>
        <p class="subtitle">Tarefas técnicas e correções</p>

        <div class="backlog-form">
          <v-select
            v-model="newTask.priority"
            :items="priorities"
            label="Prioridade"
            variant="solo-filled"
            density="comfortable"
            hide-details
          />
          <v-textarea
            v-model="newTask.text"
            label="Nova tarefa técnica"
            variant="solo-filled"
            density="comfortable"
            auto-grow
            rows="2"
            placeholder="Descreva uma tarefa técnica ou correção..."
          />
          <div class="actions">
            <v-btn 
              color="primary" 
              size="small"
              @click="addTask" 
              :disabled="!newTask.text.trim()"
            >
              Adicionar
            </v-btn>
          </div>
        </div>

        <div class="backlog-list" v-if="tasks.length">
          <div 
            v-for="(task, i) in sortedTasks" 
            :key="i" 
            class="backlog-item"
            :class="`priority-${task.priority}`"
          >
            <div class="item-header">
              <div class="header-left">
                <span class="priority-badge" :class="`badge-${task.priority}`">
                  {{ task.priority }}
                </span>
                <span class="item-number">#{{ i + 1 }}</span>
              </div>
              <v-btn 
                icon 
                size="x-small" 
                variant="text"
                @click="removeTask(task.id)"
              >
                <span class="delete-icon">×</span>
              </v-btn>
            </div>
            <p class="item-text">{{ task.text }}</p>
            <span class="item-date">{{ formatYMD(task.createdAt) }}</span>
          </div>
        </div>
        <p v-else class="empty">Nenhuma tarefa ainda. Adicione a primeira acima.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, ref, watch, computed } from 'vue'
import useDateFormat from '~/composables/useDateFormat'

type Project = Record<string, any>

interface BacklogIdea {
  text: string
  createdAt: string
}

interface BacklogTask {
  id: number
  text: string
  priority: string
  createdAt: string
}

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const { formatYMD } = useDateFormat()

// Backlog de Ideias (página esquerda)
const ideas = ref<BacklogIdea[]>([])
const newIdea = reactive({ text: '' })

// Backlog Técnico (página direita)
const tasks = ref<BacklogTask[]>([])
const newTask = reactive({ text: '', priority: 'média' })
const priorities = ['baixa', 'média', 'alta', 'crítica']

let nextTaskId = 1

// Computed para ordenar tarefas por prioridade
const sortedTasks = computed(() => {
  const priorityOrder: Record<string, number> = { 'crítica': 0, 'alta': 1, 'média': 2, 'baixa': 3 }
  return [...tasks.value].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
})

// Funções para Ideias
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

// Funções para Tarefas Técnicas
function addTask() {
  if (!newTask.text.trim()) return
  
  tasks.value.push({
    id: nextTaskId++,
    text: newTask.text.trim(),
    priority: newTask.priority,
    createdAt: new Date().toISOString()
  })
  
  newTask.text = ''
  newTask.priority = 'média'
  persistBacklog()
}

function removeTask(id: number) {
  const index = tasks.value.findIndex(t => t.id === id)
  if (index !== -1) {
    tasks.value.splice(index, 1)
    persistBacklog()
  }
}

// Persiste o backlog no projeto
function persistBacklog() {
  emit('update-field', 'backlogIdeas', ideas.value)
  emit('update-field', 'backlogTasks', tasks.value)
}

// Carrega dados do projeto
watch(() => props.project, (v) => {
  if (v) {
    // Carrega ideias
    if ((v as any).backlogIdeas && Array.isArray((v as any).backlogIdeas)) {
      ideas.value = [...(v as any).backlogIdeas]
    }
    
    // Carrega tarefas técnicas
    if ((v as any).backlogTasks && Array.isArray((v as any).backlogTasks)) {
      tasks.value = [...(v as any).backlogTasks]
      // Atualiza o próximo ID
      const maxId = Math.max(...tasks.value.map(t => t.id), 0)
      nextTaskId = maxId + 1
    }
  }
}, { immediate: true })
</script>

<style scoped>
.backlog-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.backlog-section h4 {
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

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.item-number {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.priority-badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-baixa {
  background: #dbeafe;
  color: #1e40af;
}

.badge-média {
  background: #fef3c7;
  color: #92400e;
}

.badge-alta {
  background: #fed7aa;
  color: #9a3412;
}

.badge-crítica {
  background: #fecaca;
  color: #991b1b;
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

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}

/* Prioridade visual nas bordas */
.priority-crítica {
  border-left: 4px solid #ef4444;
}

.priority-alta {
  border-left: 4px solid #f97316;
}

.priority-média {
  border-left: 4px solid #eab308;
}

.priority-baixa {
  border-left: 4px solid #3b82f6;
}
</style>
