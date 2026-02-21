<template>
  <v-dialog
    :model-value="modelValue"
    max-width="650"
    persistent
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="leafNode" class="leaf-paper-dialog">
      <v-img src="/svg/old-paper-4.svg" alt="Old Paper" width="550" height="750" style="z-index: 3;" />

      <div class="paper-dialog-content leaf-content">
        <div class="close-button-wrapper">
          <v-btn icon="mdi-close" variant="text" size="small" class="close-btn" @click="emit('update:modelValue', false)" />
        </div>

        <h1 class="paper-title">{{ leafNode.node.name }}</h1>

        <!-- Informações do Pacote -->
        <div class="form-section">
          <h5 class="section-title">📦 Informações do Pacote</h5>
          <div v-if="leafNode.node.description" class="field-display">
            <strong>Descrição:</strong>
            <p>{{ leafNode.node.description }}</p>
          </div>
          <div class="field-display">
            <strong>Nível de Profundidade:</strong>
            <span class="value">{{ leafNode.level }}</span>
          </div>
          <div class="field-display">
            <strong>Caminho WBS:</strong>
            <p class="wbs-path">{{ leafNode.path }}</p>
          </div>
        </div>

        <!-- Orçamento -->
        <div class="form-section">
          <h5 class="section-title">💰 Orçamento</h5>
          <div class="budget-display">
            <div class="budget-item">
              <span>Estimado (WBS):</span>
              <span class="value">{{ leafNode.node.estimatedHours }}h</span>
            </div>
            <div class="budget-item">
              <span>Gerado (Bottom-up):</span>
              <span class="value">{{ leafNode.generatedHours?.toFixed(1) || 'N/A' }}h</span>
            </div>
            <div v-if="leafNode.generatedHours" class="budget-item">
              <span>Pomodoros:</span>
              <span class="value">{{ Math.round(leafNode.generatedHours * 2) }} 🍅</span>
            </div>
          </div>

          <div v-if="leafNode.generatedHours" class="budget-alert">
            <div class="budget-diff">
              <strong>Diferença:</strong>
              <span :class="getBudgetDiffClass(getBudgetDiffPercentage(leafNode.generatedHours, leafNode.node.estimatedHours))">
                {{ (leafNode.generatedHours - leafNode.node.estimatedHours) >= 0 ? '+' : '' }}
                {{ (leafNode.generatedHours - leafNode.node.estimatedHours).toFixed(1) }}h
                ({{ getBudgetDiffPercentage(leafNode.generatedHours, leafNode.node.estimatedHours).toFixed(0) }}%)
              </span>
            </div>
          </div>
        </div>

        <!-- Tasks Geradas -->
        <div
          v-if="leafNode.generatedTasks && leafNode.generatedTasks.length > 0"
          class="form-section"
        >
          <h5 class="section-title">✅ Micro-tarefas ({{ leafNode.generatedTasks.length }})</h5>
          <div class="tasks-summary">
            <div
              v-for="(task, idx) in leafNode.generatedTasks"
              :key="idx"
              class="task-summary-item"
            >
              <div class="task-summary-name">
                <v-icon size="small" class="mr-1">mdi-{{ getTaskTypeIcon(task.microTaskType) }}</v-icon>
                <span>{{ task.name }}</span>
              </div>
              <div class="task-summary-info">
                <v-chip size="x-small" :color="getPriorityColor(task.priority)" variant="tonal" class="mr-1">
                  P{{ task.priority }}
                </v-chip>
                <span class="text-caption">{{ task.pomodorosPlanned || 1 }} 🍅</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="form-section empty-state">
          <p class="text-caption text-medium-emphasis">Nenhuma tarefa gerada ainda</p>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { LeafNode } from '~/composables/features/useConversionHelpers'
import { useConversionHelpers } from '~/composables/features/useConversionHelpers'

defineProps({
  modelValue: { type: Boolean, required: true },
  leafNode:    { type: Object as PropType<LeafNode | null>, default: null },
})

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()

const { getPriorityColor, getTaskTypeIcon, getBudgetDiffPercentage, getBudgetDiffClass } = useConversionHelpers()
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

.leaf-paper-dialog {
  position: relative;
  width: 550px;
  height: 750px;
  margin: 0 auto;
}

.paper-dialog-content {
  font-size: 0.9rem;
  line-height: 1.5;
}

.leaf-content {
  position: absolute;
  top: 1rem;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  padding: 0 3rem;
  overflow-y: auto;
  overflow-x: hidden;
  color: #3e2723;
  font-family: 'MedievalSharp', 'Irish Grover', cursive;
}

.leaf-content::-webkit-scrollbar { width: 8px; }
.leaf-content::-webkit-scrollbar-track { background: rgba(201, 166, 107, 0.2); border-radius: 4px; }
.leaf-content::-webkit-scrollbar-thumb { background: rgba(139, 90, 43, 0.5); border-radius: 4px; }
.leaf-content::-webkit-scrollbar-thumb:hover { background: rgba(139, 90, 43, 0.7); }

.paper-title {
  font-family: 'Irish Grover', cursive;
  font-size: 1.5rem;
  font-weight: 400;
  color: #3e2723;
  margin: 0 0 1rem 0;
  text-align: center;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  word-wrap: break-word;
}

.form-section { margin-bottom: 0.75rem; }
.form-section:last-child { margin-bottom: 0; }

.section-title {
  font-family: 'MedievalSharp', cursive;
  font-size: 0.95rem;
  font-weight: 600;
  color: #5d4037;
  margin: 0 0 0.25rem 0;
  padding-bottom: 0.4rem;
  border-bottom: 2px dashed #c9a66b;
}

.field-display { margin-bottom: 0.5rem; font-size: 0.85rem; }
.field-display strong { color: #3e2723; display: block; margin-bottom: 0.2rem; }
.field-display .value { font-weight: 600; color: #5d4037; }
.field-display p { margin: 0.3rem 0 0 0; color: #5d4037; }

.wbs-path {
  background: rgba(201, 166, 107, 0.1);
  padding: 0.35rem;
  border-radius: 3px;
  border-left: 3px solid #c9a66b;
  margin: 0.5rem 0;
  font-size: 0.725rem;
  color: #5d4037;
  word-break: break-word;
}

.budget-display {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: rgba(201, 166, 107, 0.1);
  padding: 0.75rem;
  border-radius: 3px;
  border-left: 3px solid #c9a66b;
}

.budget-item { display: flex; justify-content: space-between; font-size: 0.85rem; color: #5d4037; }
.budget-item .value { font-weight: 600; color: #3e2723; }

.budget-alert {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 3px;
  background: rgba(229, 57, 53, 0.08);
  border-left: 3px solid #E53935;
}

.budget-diff { display: flex; justify-content: space-between; font-size: 0.85rem; align-items: center; }
.budget-diff strong { color: #3e2723; }

.tasks-summary { display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto; }

.task-summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: rgba(46, 125, 50, 0.05);
  border-radius: 3px;
  border-left: 2px solid #2E7D32;
  font-size: 0.8rem;
}

.task-summary-name { display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 0; color: #5d4037; }
.task-summary-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-summary-info { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }

.empty-state { text-align: center; padding: 1rem; color: #999; }

.close-button-wrapper { position: absolute; top: 1rem; right: 1rem; z-index: 10; }
.close-btn { background: rgba(255, 255, 255, 0.8) !important; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
</style>
