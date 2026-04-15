<template>
  <div v-if="task?.microTaskType" class="micro-task-detail-section">
    <!-- PERT Section -->
    <div class="pert-section mt-6">
      <h3 class="section-title">📊 PERT Estimation</h3>
      <div class="pert-grid">
        <div class="pert-item">
          <span class="pert-label">Optimistic (O)</span>
          <span class="pert-value">{{ task.pertOptimisticMinutes }}m</span>
        </div>
        <div class="pert-item">
          <span class="pert-label">Most Likely (M)</span>
          <span class="pert-value">{{ task.pertMostLikelyMinutes }}m</span>
        </div>
        <div class="pert-item">
          <span class="pert-label">Pessimistic (P)</span>
          <span class="pert-value">{{ task.pertPessimisticMinutes }}m</span>
        </div>
      </div>
      
      <v-divider class="my-3" />
      
      <div class="pert-calculations">
        <div class="calc-row">
          <span class="calc-label">Expected (E)</span>
          <span class="calc-value">{{ pertExpected }}m</span>
          <span class="calc-formula">(O + 4M + P) / 6</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Variance (σ²)</span>
          <span class="calc-value">{{ pertVariance }}</span>
          <span class="calc-formula">((P - O) / 6)²</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Std Dev (σ)</span>
          <span class="calc-value">{{ pertStdDev }}</span>
          <span class="calc-formula">√σ²</span>
        </div>
      </div>
    </div>

    <!-- Checklist Section - Execution View Only -->
    <div class="checklist-section mt-6">
      <div class="section-header">
        <h3 class="section-title">✅ Checklist</h3>
        <div class="completion-badge">
          <span class="completion-text">{{ completionPercentage }}% Complete</span>
          <v-progress-linear
            :value="completionPercentage"
            height="6"
            class="mt-1"
            :color="completionColor"
          />
        </div>
      </div>

      <!-- Validation Warning -->
      <v-alert
        v-if="hasChecklistButIncomplete && showValidationWarning"
        type="warning"
        closable
        dense
        class="mt-3 mb-3"
        @click:close="showValidationWarning = false"
      >
        ⚠️ Checklist is {{ completionPercentage }}% complete. Task cannot be concluded until it reaches 100%.
      </v-alert>

      <!-- Checklist Items - Interactive Toggle Only -->
      <div v-if="task.checklist && task.checklist.length > 0" class="checklist-items">
        <div
          v-for="(item, index) in task.checklist"
          :key="index"
          class="checklist-item"
          :class="{ completed: item.completed }"
        >
          <v-checkbox
            :model-value="item.completed"
            @update:model-value="toggleChecklistItem(index, $event)"
            class="checkbox-compact"
          />
          <span class="item-text">{{ item.item }}</span>
        </div>
      </div>

      <!-- Empty Checklist State -->
      <div v-else class="empty-checklist">
        <p class="text-muted">No checklist items yet</p>
      </div>

      <!-- Info: Edit in Task Form -->
      <div class="edit-info">
        💡 To edit this checklist, go back to the Task Form
      </div>
    </div>

    <!-- Micro-Task Type Badge -->
    <div class="micro-task-type-badge">
      <v-chip
        size="small"
        :color="getMicroTaskTypeColor(task.microTaskType)"
        text-color="white"
      >
        {{ formatMicroTaskType(task.microTaskType) }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { useTaskStore } from '~/stores/task'

interface ChecklistItem {
  item: string
  completed: boolean
  order: number
}

interface Task {
  _id: string
  microTaskType?: string
  pertOptimisticMinutes?: number
  pertMostLikelyMinutes?: number
  pertPessimisticMinutes?: number
  checklist?: ChecklistItem[]
}

const props = defineProps({
  task: {
    type: Object as () => Task | undefined,
    required: false,
  }
})

const emit = defineEmits(['checklist-updated'])

const taskStore = useTaskStore()
const showValidationWarning: Ref<boolean> = ref(true)

// PERT Calculations
const pertExpected = computed(() => {
  if (!props.task) return 0
  const { pertOptimisticMinutes, pertMostLikelyMinutes, pertPessimisticMinutes } = props.task
  if (!pertOptimisticMinutes || !pertMostLikelyMinutes || !pertPessimisticMinutes) return 0
  return Math.round((pertOptimisticMinutes + 4 * pertMostLikelyMinutes + pertPessimisticMinutes) / 6)
})

const pertVariance = computed(() => {
  if (!props.task) return 0
  const { pertOptimisticMinutes, pertPessimisticMinutes } = props.task
  if (!pertOptimisticMinutes || !pertPessimisticMinutes) return 0
  const range = pertPessimisticMinutes - pertOptimisticMinutes
  return (Math.round((range * range / 36) * 100) / 100).toFixed(2)
})

const pertStdDev = computed(() => {
  if (!props.task) return 0
  const { pertOptimisticMinutes, pertPessimisticMinutes } = props.task
  if (!pertOptimisticMinutes || !pertPessimisticMinutes) return 0
  const range = pertPessimisticMinutes - pertOptimisticMinutes
  return (Math.round(Math.sqrt(range * range / 36) * 100) / 100).toFixed(2)
})

// Checklist Progress
const completionPercentage = computed(() => {
  if (!props.task?.checklist || props.task.checklist.length === 0) return 0
  const completed = props.task.checklist.filter((item: ChecklistItem) => item.completed).length
  return Math.round((completed / props.task.checklist.length) * 100)
})

const completionColor = computed(() => {
  const percentage = completionPercentage.value
  if (percentage === 100) return 'success'
  if (percentage >= 75) return 'info'
  if (percentage >= 50) return 'warning'
  return 'error'
})

const hasChecklistButIncomplete = computed(() => {
  return props.task?.checklist && props.task.checklist.length > 0 && completionPercentage.value < 100
})

// Checklist Execution - Toggle Individual Item Only
async function toggleChecklistItem(index: number, newValue: boolean | null): Promise<void> {
  if (!props.task || newValue === null) return

  try {
    await taskStore.updateMicroTaskChecklistItem(props.task._id, index, newValue as boolean)
    emit('checklist-updated')
  } catch (error) {
    console.error('Failed to update checklist item:', error)
  }
}

// Formatting Helpers
function getMicroTaskTypeColor(type: string): string {
  const colors: Record<string, string> = {
    subtask: '#FF6B6B',
    habit: '#4ECDC4',
    quick: '#FFD93D',
    complex: '#6C63FF',
  }
  return colors[type] || '#95E1D3'
}

function formatMicroTaskType(type: string): string {
  const labels: Record<string, string> = {
    subtask: 'Subtask',
    habit: 'Habit',
    quick: 'Quick',
    complex: 'Complex Task',
  }
  return labels[type] || type
}
</script>

<style scoped>
.micro-task-detail-section {
  position: relative;
  margin-top: 1.5rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #3e2723;
  margin: 0 0 1rem 0;
}

/* PERT Section */
.pert-section {
  border-left: 4px solid #6C63FF;
  padding-left: 1rem;
  background: rgba(108, 99, 255, 0.05);
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.pert-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.pert-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.pert-label {
  font-size: 0.75rem;
  color: #999;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.pert-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #6C63FF;
}

.pert-calculations {
  margin-top: 1rem;
}

.calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 0.9rem;
}

.calc-row:last-child {
  border-bottom: none;
}

.calc-label {
  font-weight: 600;
  color: #3e2723;
  min-width: 100px;
}

.calc-value {
  font-weight: 700;
  color: #6C63FF;
  min-width: 60px;
  text-align: right;
}

.calc-formula {
  color: #999;
  font-size: 0.75rem;
  margin-left: auto;
}

/* Checklist Section */
.checklist-section {
  border-left: 4px solid #4ECDC4;
  padding: 1rem;
  background: rgba(78, 205, 196, 0.05);
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.completion-badge {
  text-align: right;
  min-width: 150px;
}

.completion-text {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4ECDC4;
  margin-bottom: 0.5rem;
}

.checklist-items {
  background: white;
  border-radius: 4px;
  padding: 0.75rem;
  margin: 1rem 0;
  max-height: 200px;
  overflow-y: auto;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 3px;
  transition: background 0.2s;
}

.checklist-item:hover {
  background: rgba(78, 205, 196, 0.1);
}

.checklist-item.completed {
  opacity: 0.6;
}

.checklist-item.completed .item-text {
  text-decoration: line-through;
  color: #999;
}

.item-text {
  flex: 1;
  font-size: 0.9rem;
  color: #3e2723;
}

.checkbox-compact {
  margin: 0 !important;
}

.empty-checklist {
  background: white;
  border-radius: 4px;
  padding: 1.5rem;
  text-align: center;
}

.text-muted {
  color: #999;
  font-size: 0.9rem;
}

.edit-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(78, 205, 196, 0.1);
  border-left: 3px solid #4ECDC4;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #4ECDC4;
  font-weight: 500;
}

/* Micro-Task Type Badge */
.micro-task-type-badge {
  position: absolute;
  top: -2rem;
  right: 0;
}

/* Responsive */
@media (max-width: 600px) {
  .pert-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
  }

  .completion-badge {
    min-width: auto;
  }
}
</style>
