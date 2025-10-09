<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <template v-if="editing">
          <v-text-field 
            v-model="local.name" 
            label="Project Name *"
            variant="solo-filled"
            density="comfortable"
            @update:model-value="emitField('name', $event)" 
          />
          <v-textarea 
            v-model="local.description" 
            label="Description"
            variant="solo-filled"
            density="comfortable"
            rows="3"
            auto-grow
            @update:model-value="emitField('description', $event)" 
          />
        </template>
        <template v-else>
          <h3 class="page-title">{{ project.name }}</h3>
          <p class="project-description">{{ project.description }}</p>
        </template>
        <v-sheet class="stats-grid" elevation="0" color="transparent">
          <v-sheet class="stat-row" elevation="0" color="transparent">
            <Calendar :size="16" />
            <span v-if="!editing">{{ formatDeadline(project.deadline) }}</span>
            <v-text-field 
              v-else 
              v-model="local.deadline" 
              type="date"
              label="Deadline" 
              variant="solo-filled"
              density="comfortable"
              hide-details
              @update:model-value="emitField('deadline', $event)" 
            />
          </v-sheet>
          <v-sheet class="stat-row" elevation="0" color="transparent">
            <Coins :size="16" />
            <span v-if="!editing">{{ project.reward }} points</span>
            <v-text-field v-else v-model.number="local.reward" type="number" label="Reward" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('reward', $event)" />
          </v-sheet>
            <v-sheet class="stat-row" elevation="0" color="transparent">
              <Award :size="16" />
              <span v-if="!editing">{{ project.experience }} EXP</span>
              <v-text-field v-else v-model.number="local.experience" type="number" label="EXP" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('experience', $event)" />
            </v-sheet>
            <v-sheet class="stat-row" v-if="editing" elevation="0" color="transparent">
              <span style="font-size:12px;opacity:.8">Color:</span>
              <v-text-field v-model="local.color" type="color" label="Color" variant="solo-filled" density="comfortable" hide-details style="max-width:120px" @update:model-value="emitField('color', $event)" />
            </v-sheet>
        </v-sheet>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4>📊 Project Progress</h4>
        <v-sheet class="progress-info" elevation="0" color="transparent">
          <p><strong>Hours Worked:</strong> {{ project.totalHoursWorked }}h</p>
          <p v-if="!editing"><strong>Planned Hours:</strong> {{ project.plannedHours }}h</p>
          <p v-else>
            <strong>Planned Hours:</strong>
            <v-text-field v-model.number="local.plannedHours" type="number" variant="solo-filled" density="comfortable" hide-details style="max-width:110px;display:inline-block" @update:model-value="emitField('plannedHours', $event)" />h
          </p>
          <p><strong>Progress:</strong> {{ (project.progressPercentage || 0).toFixed(1) }}%</p>
        </v-sheet>
        <v-sheet class="progress-bar-container">
          <v-sheet class="progress-bar" :style="{ width: `${project.progressPercentage || 0}%`, backgroundColor: project.color }"></v-sheet>
        </v-sheet>
        <p><strong>Status:</strong>
          <span v-if="!editing">{{ project.status }}</span>
          <v-select v-else v-model="local.status" :items="statusItems" variant="solo-filled" density="comfortable" hide-details style="max-width:220px;display:inline-block" @update:model-value="emitField('status', $event)" />
        </p>
      </div>
    </v-sheet>
  </v-sheet>
</template>
<script setup lang="ts">
import { Calendar, Coins, Award } from 'lucide-vue-next'
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

const { formatDeadline } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const statusItems = ['pending','in-progress','completed','archived']

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


