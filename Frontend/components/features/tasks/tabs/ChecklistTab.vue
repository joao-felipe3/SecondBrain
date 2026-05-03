<template>
  <div class="checklist-tab">
    <div v-if="task" class="checklist-container">
      <!-- Progress Bar -->
      <div class="checklist-header">
        <h1 class="text-center py-2" >✓ Checklist</h1>
        <div class="progress-wrapper">
          <v-progress-linear
            :model-value="completionPercentage"
            height="10"
            rounded
            :color="progressColor"
            class="progress-bar"
          />
          <span class="progress-text">{{ completionPercentage }}%</span>
        </div>
      </div>

      <!-- Checklist Items -->
      <div v-if="checklistItems.length > 0" class="checklist-items">
        <v-row
          v-for="(item, idx) in checklistItems"
          :key="`checklist-${idx}`"
          dense
          align="center"
          class="checklist-row"
        >
          <v-col cols="auto" class="pr-0">
            <v-checkbox
              :model-value="isItemCompleted(item)"
              @update:model-value="(val) => setChecklistItemCompleted(Number(idx), Boolean(val))"
              density="comfortable"
              hide-details
            />
          </v-col>
          <v-col>
            <div class="custom-input">
              <v-text-field
                :model-value="getItemText(item)"
                variant="solo-filled"
                density="comfortable"
                readonly
                hide-details
                :class="{ 'item-completed': isItemCompleted(item) }"
              />
            </div>
            <div v-if="isItemCompleted(item)" class="item-timestamp">
              Completo em {{ getCompletionTime(item) }}
            </div>
          </v-col>
        </v-row>
      </div>

      <div v-else class="empty-state">
        <p>Nenhum checklist para esta tarefa</p>
      </div>

      <!-- Add new item button -->
      <v-btn
        variant="text"
        prepend-icon="mdi-plus"
        @click="addNewChecklistItem"
      >
        Adicionar item
      </v-btn>
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

const taskId = computed(() => props.task?._id ?? props.task?.id)

const checklistItems = computed(() => {
  return Array.isArray(props.task?.checklist) ? props.task.checklist : []
})

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
  if (checklistItems.value.length === 0) return 0
  const completed = checklistItems.value.filter(isItemCompleted).length
  return Math.round((completed / checklistItems.value.length) * 100)
})

const progressColor = computed(() => {
  const pct = completionPercentage.value
  if (pct === 100) return 'success'
  if (pct >= 75) return 'info'
  if (pct >= 50) return 'warning'
  return 'error'
})

// Methods
const setChecklistItemCompleted = async (idx: number | string, completed: boolean) => {
  const id = taskId.value
  if (!id) return
  if (!Array.isArray(props.task?.checklist)) return

  const index = Number(idx)
  if (!Number.isFinite(index)) return

  const item = props.task.checklist[index]
  if (item == null) return
  if (typeof item === 'string') {
    // Se for string, converter para object com completed
    props.task.checklist[index] = {
      item,
      completed,
      ...(completed ? { completedAt: new Date().toISOString() } : {}),
    }
    // Persist the whole checklist when legacy string items exist (backend expects objects)
    await taskStore.updateMicroTaskChecklistFull(id, props.task.checklist)
    return
  } else {
    item.completed = completed
    if (completed) {
      item.completedAt = new Date().toISOString()
    } else {
      delete item.completedAt
    }
  }

  // API call - atualiza item específico do checklist
  await taskStore.updateMicroTaskChecklistItem(id, index, completed)
}

const toggleChecklistItem = async (idx: number | string) => {
  const index = Number(idx)
  if (!Number.isFinite(index)) return

  const current = checklistItems.value[index]
  if (current == null) return
  await setChecklistItemCompleted(index, !isItemCompleted(current))
}

const addNewChecklistItem = async () => {
  const id = taskId.value
  if (!id) return
  if (!Array.isArray(props.task?.checklist)) {
    props.task.checklist = []
  }

  const newItem = {
    item: 'Novo item',
    completed: false,
  }

  props.task.checklist.push(newItem)

  // Atualizar toda a tarefa com o novo checklist
  await taskStore.updateTask(id, {
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

/* Progress Bar */
.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar {
  flex: 1;
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
  gap: 0.25rem;
  padding: 0;
}

.checklist-row {
  margin: 0;
}

.item-completed :deep(input) {
  text-decoration: line-through;
  opacity: 0.8;
}


.item-timestamp {
  font-size: 11px;
  opacity: 0.75;
  margin-top: 2px;
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
