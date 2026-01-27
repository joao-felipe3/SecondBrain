<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="900" persistent>
    <v-card class="carousel-dialog-card">
      <v-card-title class="carousel-dialog-header">
        <div class="header-content">
          <span class="header-icon">🎯</span>
          <div class="header-text">
            <span class="header-title">Revisar Sugestões</span>
            <span class="header-subtitle">{{ selectedCount }} de {{ suggestions.length }} selecionadas</span>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-card-text class="carousel-dialog-body">
        <div class="carousel-container">
          <button 
            class="carousel-nav prev" 
            @click="prevCard"
            :disabled="currentIndex === 0"
          >
            ◀
          </button>
          
          <div class="carousel-wrapper">
            <div class="carousel-track" :style="{ transform: `translateX(-${currentIndex * 100}%)` }">
              <div
                v-for="(suggestion, index) in suggestions"
                :key="index"
                class="suggestion-card"
                :class="{ selected: suggestion.selected }"
              >
                <div class="card-header">
                  <v-checkbox
                    v-model="suggestion.selected"
                    hide-details
                    density="comfortable"
                    color="primary"
                    class="card-checkbox"
                    label="Adicionar esta tarefa"
                  />
                  <div class="card-number">{{ index + 1 }}/{{ suggestions.length }}</div>
                </div>
                
                <div class="card-body">
                  <v-text-field
                    v-model="suggestion.name"
                    label="📝 Nome da Tarefa"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    class="card-name-field"
                  />
                  
                  <div class="card-date">
                    <span class="date-label">📅 Prazo:</span>
                    <v-text-field
                      v-model="suggestion.deadline"
                      type="date"
                      variant="outlined"
                      density="compact"
                      hide-details
                      class="card-date-field"
                    />
                  </div>
                  
                  <div class="card-attributes">
                    <div class="attribute-item pomodoros">
                      <div class="attribute-icon">🍅</div>
                      <div class="attribute-content">
                        <div class="attribute-label">Pomodoros</div>
                        <div class="attribute-value">{{ suggestion.pomodoros || 1 }}</div>
                      </div>
                    </div>
                    
                    <div class="attribute-item priority">
                      <div class="attribute-icon">⚡</div>
                      <div class="attribute-content">
                        <div class="attribute-label">Prioridade</div>
                        <div class="attribute-value">{{ suggestion.priority || 1 }}</div>
                      </div>
                    </div>
                    
                    <div class="attribute-item difficulty">
                      <div class="attribute-icon">💪</div>
                      <div class="attribute-content">
                        <div class="attribute-label">Dificuldade</div>
                        <div class="attribute-value">{{ suggestion.difficulty || 1 }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <button 
            class="carousel-nav next" 
            @click="nextCard"
            :disabled="currentIndex === suggestions.length - 1"
          >
            ▶
          </button>
        </div>
      </v-card-text>

      <v-card-actions class="carousel-dialog-actions">
        <v-btn variant="text" @click="emit('update:modelValue', false)">
          Fechar
        </v-btn>
        <v-spacer />
        <div class="quick-actions">
          <v-btn
            size="small"
            variant="outlined"
            @click="emit('select-all')"
          >
            Selecionar Todas
          </v-btn>
          <v-btn
            size="small"
            variant="outlined"
            @click="emit('deselect-all')"
          >
            Desmarcar Todas
          </v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Suggestion {
  name: string
  deadline: string
  pomodoros: number
  priority: number
  difficulty: number
  selected: boolean
}

const props = defineProps<{
  modelValue: boolean
  suggestions: Suggestion[]
  initialIndex: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select-all'): void
  (e: 'deselect-all'): void
}>()

const currentIndex = ref(props.initialIndex)

const selectedCount = computed(() => props.suggestions.filter(s => s.selected).length)

watch(() => props.initialIndex, (val) => {
  currentIndex.value = val
})

watch(() => props.modelValue, (open) => {
  if (open) {
    currentIndex.value = props.initialIndex
  }
})

function nextCard() {
  if (currentIndex.value < props.suggestions.length - 1) {
    currentIndex.value++
  }
}

function prevCard() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}
</script>

<style scoped>
.carousel-dialog-card {
  border-radius: 16px !important;
  overflow: hidden;
}

.carousel-dialog-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  font-size: 2rem;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
}

.header-subtitle {
  font-size: 0.875rem;
  opacity: 0.9;
}

.carousel-dialog-body {
  padding: 2rem;
  min-height: 500px;
}

.carousel-dialog-actions {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
}

.carousel-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 100%;
  min-height: 400px;
}

.carousel-nav {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #e2e8f0;
  background: white;
  color: #64748b;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.carousel-nav:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #3b82f6;
  color: #3b82f6;
  transform: scale(1.1);
}

.carousel-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.carousel-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.carousel-track {
  display: flex;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;
}

.suggestion-card {
  flex: 0 0 100%;
  width: 100%;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-sizing: border-box;
  min-height: 350px;
}

.suggestion-card.selected {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #3b82f6;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid #e2e8f0;
}

.card-checkbox {
  flex-shrink: 0;
}

.card-number {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
  background: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.suggestion-card.selected .card-number {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.card-name-field {
  font-size: 1rem;
  font-weight: 500;
}

.card-date {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.date-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #334155;
  flex-shrink: 0;
}

.card-date-field {
  flex: 1;
}

.card-attributes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.attribute-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem;
  transition: all 0.2s;
}

.attribute-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

.attribute-item.pomodoros {
  border-color: #fecaca;
}

.attribute-item.priority {
  border-color: #fed7aa;
}

.attribute-item.difficulty {
  border-color: #ddd6fe;
}

.suggestion-card.selected .attribute-item {
  border-color: #93c5fd;
}

.attribute-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.attribute-content {
  flex: 1;
  min-width: 0;
}

.attribute-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-bottom: 0.125rem;
}

.attribute-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
}
</style>
