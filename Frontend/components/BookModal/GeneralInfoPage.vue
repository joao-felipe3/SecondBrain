<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <!-- Nome e Descrição -->
        <template v-if="editing">
          <v-text-field 
            v-model="local.name" 
            label="Project Name *"
            variant="solo"
            density="compact"
            @update:model-value="emitField('name', $event)" 
          />
          <v-textarea 
            style="margin-top:-0.5rem; margin-bottom:-1rem"
            v-model="local.description" 
            label="Description"
            variant="solo-filled"
            density="compact"
            rows="3"
            auto-grow
            @update:model-value="emitField('description', $event)" 
          />
        </template>
        <template v-else>
          <h3 class="page-title">{{ project.name }}</h3>
          <p class="project-description">{{ project.description }}</p>
        </template>

        <!-- Project Progress -->
        <v-sheet class="timeline-info" elevation="0" color="transparent">
          <h5>📋 Project Info</h5>
          <v-sheet class="progress-info" elevation="0" color="transparent">
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
                    ref="deadlineLeftRef"
                    v-model="local.deadline" 
                    type="date"
                    label="Deadline" 
                    variant="solo-filled"
                    density="compact"
                    prepend-inner-icon=""
                    hide-details
                    clearable="false"
                    class="deadline-field"
                    @click:control="onDateClick('deadlineLeft')"
                    @click:prepend-inner="onDateClick('deadlineLeft')"
                    @focus="onDateClick('deadlineLeft')"
                    @update:model-value="emitField('deadline', $event)" 
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
            
            <!-- Status dentro do Project Progress -->
            <div v-if="editing" class="status-row">
              <div class="control-item">
                <span class="control-label">Status:</span>
                <v-select 
                  v-model="local.status" 
                  :items="statusItems" 
                  variant="solo-filled" 
                  density="compact" 
                  hide-details
                  :menu-props="{ attach: 'body', zIndex: 99999 }"
                  @update:model-value="emitField('status', $event)" 
                />
              </div>
              <div class="control-item">
                <span class="control-label">Color:</span>
                <v-text-field 
                  v-model="local.color" 
                  type="color" 
                  label="Color" 
                  variant="solo-filled" 
                  density="compact" 
                  hide-details
                  @update:model-value="emitField('color', $event)" 
                />
              </div>
            </div>
            <p v-else><strong>Status:</strong> {{ project.status }}</p>
          </v-sheet>
        </v-sheet>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <v-textarea 
            v-model="local.shortTermGoal" 
            label="Objetivo curto prazo" 
            variant="solo-filled" 
            density="comfortable" 
            auto-grow 
            rows="3" 
            @update:model-value="emitField('shortTermGoal', $event)" 
          />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div v-if="project">
          <h4>🎯 Objetivo de Médio Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.midTermGoal" 
              label="Objetivo médio prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('midTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.midTermGoal }}</p>
        </div>
        <div v-if="project">
          <h4>🎯 Objetivo de Longo Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.longTermGoal" 
              label="Objetivo longo prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('longTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.longTermGoal }}</p>
        </div>
      </div>
    </v-sheet>
  </v-sheet>
</template>
<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch, ref, nextTick } from 'vue'

const { formatDeadline, formatDate } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const statusItems = ['pending','in-progress','completed','archived']

// Refs to v-text-field components so we can access the native input
const startDateRef = ref()
const deadlineLeftRef = ref()
const deadlineRightRef = ref()

function openNativePicker(inputEl: HTMLInputElement | null | undefined) {
  if (!inputEl) return
  inputEl.focus()
  if (typeof inputEl.showPicker === 'function') {
    try { inputEl.showPicker() } catch { }
  } else {
    inputEl.click()
  }
}

async function onDateClick(which: 'startDate' | 'deadlineLeft' | 'deadlineRight') {
  await nextTick()
  let compRef: any
  if (which === 'startDate') compRef = startDateRef.value
  else if (which === 'deadlineLeft') compRef = deadlineLeftRef.value
  else compRef = deadlineRightRef.value

  if (!compRef) return
  // Vuetify v-text-field renders an input inside .v-field__input
  // Try a few common paths
  const root = compRef.$el as HTMLElement
  let inputEl = root.querySelector('input[type="date"]') as HTMLInputElement | null
  if (!inputEl) inputEl = root.querySelector('input') as HTMLInputElement | null
  openNativePicker(inputEl)
}

// Sync only the fields specific to this page
watch(() => props.project, (val) => {
  if (val) {
    local.name = val.name
    local.description = val.description
    local.deadline = val.deadline
    local.reward = val.reward
    local.experience = val.experience
    local.color = val.color
    local.plannedHours = val.plannedHours
    local.status = val.status
  }
}, { immediate: true })

watch(() => props.editing, (is) => {
  if (is && props.project) {
    local.name = props.project.name
    local.description = props.project.description
    local.deadline = props.project.deadline
    local.reward = props.project.reward
    local.experience = props.project.experience
    local.color = props.project.color
    local.plannedHours = props.project.plannedHours
    local.status = props.project.status
  }
}, { immediate: true })

function emitField(field: string, value: any) {
  local[field] = value // Update local value
  emit('update-field', field, value)
}
</script>

<style scoped>
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

.timeline-info h5 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: #000;
}

.progress-info {
  margin-bottom: 1rem;
}

.progress-info p {
  margin: 0.3rem 0;
  font-size: 1rem;
  color: #000;
}

/* Progress Stat - Deadline row */
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

/* Hours Row - Hours Worked e Planned Hours lado a lado */
.hours-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.hours-row p {
  margin: 0.3rem 0;
}

/* Progress Row - Progress percentage e barra inline */
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

/* Status Row - Status e Color lado a lado no modo edição */
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


