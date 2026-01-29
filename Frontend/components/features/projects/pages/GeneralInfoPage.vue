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

        <!-- Project Info Card -->
        <v-sheet class="timeline-info" elevation="0" color="transparent">
          <ProjectInfoCard
            :project="project"
            :editing="editing"
            v-model:deadline="local.deadline"
            v-model:status="local.status"
            v-model:color="local.color"
            @update:deadline="emitField('deadline', $event)"
            @update:status="emitField('status', $event)"
            @update:color="emitField('color', $event)"
          />
        </v-sheet>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <GoalsSection
        v-if="project"
        :project="project"
        :editing="editing"
        v-model:short-term-goal="local.shortTermGoal"
        v-model:mid-term-goal="local.midTermGoal"
        v-model:long-term-goal="local.longTermGoal"
        @update:short-term-goal="emitField('shortTermGoal', $event)"
        @update:mid-term-goal="emitField('midTermGoal', $event)"
        @update:long-term-goal="emitField('longTermGoal', $event)"
      />
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'
import { ProjectInfoCard, GoalsSection } from '../sections'

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})

// Sync fields when project changes
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
    local.shortTermGoal = val.shortTermGoal
    local.midTermGoal = val.midTermGoal
    local.longTermGoal = val.longTermGoal
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
    local.shortTermGoal = props.project.shortTermGoal
    local.midTermGoal = props.project.midTermGoal
    local.longTermGoal = props.project.longTermGoal
  }
}, { immediate: true })

function emitField(field: string, value: any) {
  local[field] = value
  emit('update-field', field, value)
}
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
}

.page {
  flex: 1;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
}

.left-page {
  border-right: 1px solid #e2e8f0;
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-container.editing .page {
  background: rgba(255, 255, 255, 0.95);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 0.5rem 0;
}

.project-description {
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0 0 1rem 0;
}

.timeline-info {
  margin-top: 1rem;
}
</style>
