<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="550" persistent>
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
            @click="emit('update:modelValue', false)"
            class="close-btn"
          />
        </div>

        <div class="paper-header">
          <span class="header-icon">🎯</span>
          <div class="header-text">
            <h2 class="paper-title">Revisar Sugestões</h2>
            <p class="header-subtitle">{{ selectedCount }} de {{ suggestions.length }} selecionadas</p>
          </div>
        </div>
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
                  <v-textarea
                    v-model="suggestion.name"
                    label="📝 Nome da Tarefa"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    auto-grow
                    rows="2"
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
      </div>
    </div>
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
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

.task-paper-dialog {
  position: relative;
  width: 500px;
  height: 620px;
  margin: 0 auto;
}

.paper-dialog-content {
  position: absolute;
  top: 2.5rem;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  padding: 0 3rem;
  overflow-y: auto;
  overflow-x: hidden;
  color: #3e2723;
  font-family: 'MedievalSharp', 'Irish Grover', cursive;
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.paper-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 2px dashed #c9a66b;
}

.header-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.header-text {
  flex: 1;
}

.paper-title {
  font-family: 'Irish Grover', cursive;
  font-size: 1.4rem;
  font-weight: 400;
  color: #3e2723;
  margin: 0;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
}

.header-subtitle {
  font-size: 0.8rem;
  color: #5d4037;
  margin: 0.25rem 0 0 0;
  font-family: 'MedievalSharp', cursive;
}

.carousel-container {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: auto;
  padding: 1rem 0;
}

.carousel-nav {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #8b5a2b;
  background: rgba(255, 255, 255, 0.9);
  color: #5d4037;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  font-family: 'MedievalSharp', cursive;
  margin-top: 150px;
}

.carousel-nav:hover:not(:disabled) {
  background: rgba(201, 166, 107, 0.3);
  border-color: #654321;
  color: #3e2723;
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
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid #d4b896;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-sizing: border-box;
  min-height: 300px;
}

.suggestion-card.selected {
  background: rgba(255, 255, 255, 0.6);
  border-color: #8b5a2b;
  box-shadow: 0 4px 8px rgba(139, 90, 43, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px dashed #c9a66b;
}

.card-checkbox {
  flex-shrink: 0;
}

.card-number {
  font-size: 0.75rem;
  font-weight: 600;
  color: #5d4037;
  background: rgba(255, 255, 255, 0.8);
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  border: 1px solid #d4b896;
  font-family: 'MedievalSharp', cursive;
}

.suggestion-card.selected .card-number {
  background: #8b5a2b;
  color: #f5e6d3;
  border-color: #654321;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.card-name-field {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.card-date {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.6);
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #d4b896;
}

.date-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #5d4037;
  flex-shrink: 0;
  font-family: 'MedievalSharp', cursive;
}

.card-date-field {
  flex: 1;
}

.card-attributes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
}

.attribute-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #d4b896;
  border-radius: 6px;
  padding: 0.2rem;
  transition: all 0.2s;
}

.attribute-item:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.attribute-item.pomodoros {
  border-left: 3px solid #c62828;
}

.attribute-item.priority {
  border-left: 3px solid #f57c00;
}

.attribute-item.difficulty {
  border-left: 3px solid #7b1fa2;
}

.suggestion-card.selected .attribute-item {
  border-color: #8b5a2b;
}

.attribute-icon {
  font-size: 0.8rem;
  flex-shrink: 0;
}

.attribute-content {
  flex: 1;
  min-width: 0;
}

.attribute-label {
  font-size: 0.45rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-bottom: 0.05rem;
  font-family: sans-serif;
}

.attribute-value {
  font-size: 0.75rem;
  font-weight: 700;
  color: #3e2723;
  font-family: 'Irish Grover', cursive;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  padding-top: 0.75rem;
  border-top: 2px dashed #c9a66b;
  margin-top: 0.5rem;
}

.quick-actions .v-btn {
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.8);
  border-color: #8b5a2b;
  color: #5d4037;
  font-family: 'MedievalSharp', cursive;
}
</style>
