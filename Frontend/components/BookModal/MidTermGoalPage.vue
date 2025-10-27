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

    <!-- Página Direita: Mais Ideias -->
    <div class="page right-page">
      <div v-if="project" class="backlog-section">
        <h4>� Mais Ideias</h4>
        <p class="subtitle">Possíveis melhorias e funcionalidades</p>

        <div class="backlog-form">
          <v-textarea
            v-model="newIdea2.text"
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
              @click="addIdea2" 
              :disabled="!newIdea2.text.trim()"
            >
              Adicionar
            </v-btn>
          </div>
        </div>

        <div class="backlog-list" v-if="ideas2.length">
          <div 
            v-for="(idea, i) in ideas2" 
            :key="i" 
            class="backlog-item"
          >
            <div class="item-header">
              <span class="item-number">#{{ i + 1 }}</span>
              <v-btn 
                icon 
                size="x-small" 
                variant="text"
                @click="removeIdea2(i)"
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
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, ref, watch } from 'vue'
import useDateFormat from '~/composables/useDateFormat'

type Project = Record<string, any>

interface BacklogIdea {
  text: string
  createdAt: string
}

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const { formatYMD } = useDateFormat()

// Backlog de Ideias - Página Esquerda
const ideas = ref<BacklogIdea[]>([])
const newIdea = reactive({ text: '' })

// Backlog de Ideias - Página Direita
const ideas2 = ref<BacklogIdea[]>([])
const newIdea2 = reactive({ text: '' })

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

// Funções para Ideias (página direita)
function addIdea2() {
  if (!newIdea2.text.trim()) return
  
  ideas2.value.unshift({
    text: newIdea2.text.trim(),
    createdAt: new Date().toISOString()
  })
  
  newIdea2.text = ''
  persistBacklog()
}

function removeIdea2(index: number) {
  ideas2.value.splice(index, 1)
  persistBacklog()
}

// Persiste o backlog no projeto
function persistBacklog() {
  emit('update-field', 'backlogIdeas', ideas.value)
  emit('update-field', 'backlogIdeas2', ideas2.value)
}

// Carrega dados do projeto
watch(() => props.project, (v) => {
  if (v) {
    // Carrega ideias da página esquerda
    if ((v as any).backlogIdeas && Array.isArray((v as any).backlogIdeas)) {
      ideas.value = [...(v as any).backlogIdeas]
    }
    
    // Carrega ideias da página direita
    if ((v as any).backlogIdeas2 && Array.isArray((v as any).backlogIdeas2)) {
      ideas2.value = [...(v as any).backlogIdeas2]
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

.empty {
  opacity: 0.7;
  text-align: center;
  margin-top: 2rem;
  color: #64748b;
  font-style: italic;
}
</style>
