<template>
  <div class="backlog-section">
    <h4>💡 Backlog de Ideias</h4>

    <div v-if="editing" class="backlog-form">
      <v-textarea
        v-model="newIdeaText"
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
          :disabled="!newIdeaText.trim()"
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
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import useDateFormat from '~/composables/utils/useDateFormat'

interface BacklogIdea {
  text: string
  createdAt: string
}

const props = defineProps<{
  ideas: BacklogIdea[]
  editing: boolean
}>()

const emit = defineEmits<{
  (e: 'add', idea: BacklogIdea): void
  (e: 'remove', index: number): void
}>()

const { formatYMD } = useDateFormat()

const newIdeaText = ref('')

function addIdea() {
  if (!newIdeaText.value.trim()) return
  
  emit('add', {
    text: newIdeaText.value.trim(),
    createdAt: new Date().toISOString()
  })
  
  newIdeaText.value = ''
}

function removeIdea(index: number) {
  emit('remove', index)
}
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
