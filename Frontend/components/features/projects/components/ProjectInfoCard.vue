<template>
  <v-sheet class="project-info-card" elevation="0" color="transparent">
    <h5>📋 Project Info</h5>
    <v-sheet class="stats-grid" elevation="0" color="transparent">
      <div class="stat-item">
        <Coins :size="20" stroke-width="3" />
        <span>{{ project.reward }} Coins</span>
      </div>
      <div class="stat-item">
        <Award :size="20" stroke-width="3" />
        <span>{{ project.experience }} EXP</span>
      </div>
    </v-sheet>

    <div class="progress-stat">
      <span v-if="!editing"><strong>Deadline:</strong> {{ formatDeadline(project.deadline) }}</span>
      <div v-else class="deadline-edit">
        <strong>Deadline:</strong>
        <v-text-field 
          ref="deadlineRef"
          :model-value="deadline"
          @update:model-value="emit('update:deadline', $event)"
          type="date"
          label="Deadline" 
          variant="solo-filled"
          density="compact"
          prepend-inner-icon=""
          hide-details
          :clearable="false"
          class="deadline-field"
          @click:control="onDateClick"
          @click:prepend-inner="onDateClick"
          @focus="onDateClick"
        >
          <template #prepend-inner>
            <Calendar class="ml-2" :size="16" />
          </template>
        </v-text-field>
      </div>
    </div>

    <div class="hours-row">
      <p><strong>Hours Worked:</strong> {{ project.totalHoursWorked }}h</p>
      <p><strong>Planned Hours:</strong> {{ project.plannedHours }}h</p>
    </div>

    <div class="progress-row">
      <p class="progress-text"><strong>Progress:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
      <div class="progress-inline">
        <div class="progress-inline-bar" :style="{ width: `${project.progressPercentage || 0}%`, backgroundColor: project.color }"></div>
      </div>
    </div>
    
    <!-- Status e Color no modo edição -->
    <div v-if="editing" class="status-row">
      <div class="control-item">
        <span class="control-label">Status:</span>
        <v-select 
          :model-value="status"
          @update:model-value="emit('update:status', $event)"
          :items="statusItems" 
          variant="solo-filled" 
          density="compact" 
          hide-details
          :menu-props="{ attach: 'body', zIndex: 99999 }"
        />
      </div>
      <div class="control-item">
        <span class="control-label">Color:</span>
        <v-text-field 
          :model-value="color"
          @update:model-value="emit('update:color', $event)"
          type="color" 
          label="Color" 
          variant="solo-filled" 
          density="compact" 
          hide-details
        />
      </div>
    </div>
    <p v-else><strong>Status:</strong> {{ project.status }}</p>
  </v-sheet>
</template>

<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import { ref, nextTick } from 'vue'
import useDateFormat from '~/composables/utils/useDateFormat'

defineProps<{
  project: Record<string, any>
  editing: boolean
  deadline: string
  status: string
  color: string
}>()

const emit = defineEmits<{
  (e: 'update:deadline', value: string): void
  (e: 'update:status', value: string): void
  (e: 'update:color', value: string): void
}>()

const { formatDeadline } = useDateFormat()

const statusItems = ['pending', 'in-progress', 'completed', 'archived']
const deadlineRef = ref()

function openNativePicker(inputEl: HTMLInputElement | null | undefined) {
  if (!inputEl) return
  inputEl.focus()
  if (typeof inputEl.showPicker === 'function') {
    try { inputEl.showPicker() } catch { }
  } else {
    inputEl.click()
  }
}

async function onDateClick() {
  await nextTick()
  if (!deadlineRef.value) return
  const root = deadlineRef.value.$el as HTMLElement
  let inputEl = root.querySelector('input[type="date"]') as HTMLInputElement | null
  if (!inputEl) inputEl = root.querySelector('input') as HTMLInputElement | null
  openNativePicker(inputEl)
}
</script>

<style scoped>
.project-info-card h5 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: #000;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  align-items: center;
  margin: 0.5rem 0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  color: #000;
}

.progress-stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.3rem 0;
  font-size: 1rem;
  color: #000;
}

.deadline-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.deadline-field {
  max-width: 180px;
}

.hours-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.hours-row p {
  margin: 0.3rem 0;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-text {
  margin: 0.25rem 0;
  white-space: nowrap;
}

.progress-inline {
  flex: 1;
  height: 10px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-inline-bar {
  height: 100%;
  transition: width 0.3s ease;
  border-radius: inherit;
}

.status-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 0.5rem;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #000;
}
</style>
