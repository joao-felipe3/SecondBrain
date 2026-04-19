<template>
  <div class="checklist-tab">
    <div v-if="task && task.checklist" class="checklist-container">
      <!-- Progress Bar -->
      <div class="checklist-header">
        <h3 class="checklist-title">✓ Checklist</h3>
        <div class="progress-wrapper">
          <div class="progress-bar-bg">
            <div
              class="progress-bar-fill"
              :style="{ width: completionPercentage + '%' }"
              :class="progressColor"
            />
          </div>
          <span class="progress-text">{{ completionPercentage }}%</span>
        </div>
      </div>

      <!-- Checklist Items -->
      <div class="checklist-items">
        <div
          v-for="(item, idx) in task.checklist"
          :key="`checklist-${idx}`"
          class="checklist-item"
          :class="{ completed: isItemCompleted(item) }"
        >
          <input
            type="checkbox"
            :checked="isItemCompleted(item)"
            @change="toggleChecklistItem(Number(idx))"
            class="item-checkbox"
          />
          <span class="item-text">{{ getItemText(item) }}</span>
          <span v-if="isItemCompleted(item)" class="item-timestamp">
            Completo em {{ getCompletionTime(item) }}
          </span>
        </div>
      </div>

      <!-- Add new item button -->
      <button class="add-item-btn" @click="addNewChecklistItem">
        + Adicionar item
      </button>
    </div>
    <div v-else class="empty-state">
      <p>Nenhum checklist para esta tarefa</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTaskStore } from '~/stores/task'

interface Props {
  task?: any
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})

const taskStore = useTaskStore()

// Helpers
const getItemText = (item: any): string => {
  if (typeof item === 'string') {
    return item
  }
  return item?.item || item?.description || 'Sem título'
}

const isItemCompleted = (item: any): boolean => {
  if (typeof item === 'string') {
    return false
  }
  return item?.completed || false
}

const getCompletionTime = (item: any): string => {
  if (typeof item === 'string' || !item?.completedAt) {
    return 'N/A'
  }
  try {
    const date = new Date(item.completedAt)
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'N/A'
  }
}

// Computed
const completionPercentage = computed(() => {
  if (!props.task?.checklist || props.task.checklist.length === 0) return 0
  const completed = props.task.checklist.filter(isItemCompleted).length
  return Math.round((completed / props.task.checklist.length) * 100)
})

const progressColor = computed(() => {
  const pct = completionPercentage.value
  if (pct === 100) return 'success'
  if (pct >= 75) return 'info'
  if (pct >= 50) return 'warning'
  return 'error'
})

// Methods
const toggleChecklistItem = async (idx: number) => {
  if (!props.task?.id) return

  const item = props.task.checklist[idx]
  if (typeof item === 'string') {
    // Se for string, converter para object com completed = true
    props.task.checklist[idx] = {
      item,
      completed: true,
      completedAt: new Date().toISOString(),
    }
  } else {
    item.completed = !item.completed
    if (item.completed) {
      item.completedAt = new Date().toISOString()
    } else {
      delete item.completedAt
    }
  }

  // API call - atualiza item específico do checklist
  const completed = isItemCompleted(props.task.checklist[idx])
  await taskStore.updateMicroTaskChecklistItem(props.task.id, idx, completed)
}

const addNewChecklistItem = async () => {
  if (!props.task?.id) return

  const newItem = {
    item: 'Novo item',
    completed: false,
  }

  props.task.checklist.push(newItem)

  // Atualizar toda a tarefa com o novo checklist
  await taskStore.updateTask(props.task.id, {
    checklist: props.task.checklist,
  })
}
</script>

<style scoped>
.checklist-tab {
  width: 100%;
  height: 100%;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.checklist-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0;
  margin: 0;
}

.checklist-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.checklist-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #3e2723;
}

/* Progress Bar */
.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar-bg {
  flex: 1;
  height: 12px;
  background: #e8dcc8;
  border: 1px solid #d4a574;
  border-radius: 6px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #7ec576;
  transition: width 0.4s ease-out, background 0.3s ease;
  border-radius: 6px;
}

.progress-bar-fill.success {
  background: #4caf50;
}

.progress-bar-fill.info {
  background: #2196f3;
}

.progress-bar-fill.warning {
  background: #ff9800;
}

.progress-bar-fill.error {
  background: #f44336;
}

.progress-text {
  font-size: 12px;
  color: #a6794a;
  min-width: 40px;
  text-align: right;
}

/* Checklist Items */
.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #ede4d8;
  border-radius: 3px;
  background: #fafaf8;
  transition:
    background 0.2s ease,
    opacity 0.2s ease;
}

.checklist-item.completed {
  opacity: 0.7;
  background: #f0f0f0;
}

.checklist-item.completed .item-text {
  text-decoration: line-through;
  color: #9a8a7a;
}

.checklist-item:hover {
  background: #f5f1eb;
}

.item-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  cursor: pointer;
  accent-color: #7ec576;
}

.item-text {
  flex: 1;
  font-size: 14px;
  color: #3e2723;
  word-break: break-word;
  padding: 2px 0;
}

.item-timestamp {
  flex-shrink: 0;
  font-size: 11px;
  color: #a6794a;
  white-space: nowrap;
}

/* Add button */
.add-item-btn {
  padding: 8px 12px;
  background: #f5e6d3;
  border: 1px dashed #d4a574;
  border-radius: 3px;
  color: #a6794a;
  font-family: 'Irish Grover', cursive;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.add-item-btn:hover {
  background: #ede4d8;
  border-color: #b8934a;
  color: #3e2723;
}

.add-item-btn:active {
  background: #e8dcc8;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-style: italic;
  color: #a6794a;
  font-size: 14px;
}

/* Custom scrollbar */
.checklist-tab::-webkit-scrollbar {
  width: 6px;
}

.checklist-tab::-webkit-scrollbar-track {
  background: transparent;
}

.checklist-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.checklist-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
