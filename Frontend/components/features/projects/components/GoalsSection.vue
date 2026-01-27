<template>
  <div class="goals-section">
    <div v-if="project">
      <h4>🎯 Objetivo de Curto Prazo</h4>
      <template v-if="editing">
        <v-textarea 
          :model-value="shortTermGoal" 
          @update:model-value="emit('update:shortTermGoal', $event)"
          label="Objetivo curto prazo" 
          variant="solo-filled" 
          density="comfortable" 
          auto-grow 
          rows="3" 
        />
      </template>
      <p v-else class="goal-content">{{ project.shortTermGoal }}</p>

      <h4>🎯 Objetivo de Médio Prazo</h4>
      <template v-if="editing">
        <v-textarea 
          :model-value="midTermGoal" 
          @update:model-value="emit('update:midTermGoal', $event)"
          label="Objetivo médio prazo" 
          variant="solo-filled" 
          density="comfortable" 
          auto-grow 
          rows="3" 
        />
      </template>
      <p v-else class="goal-content">{{ project.midTermGoal }}</p>

      <h4>🎯 Objetivo de Longo Prazo</h4>
      <template v-if="editing">
        <v-textarea 
          :model-value="longTermGoal" 
          @update:model-value="emit('update:longTermGoal', $event)"
          label="Objetivo longo prazo" 
          variant="solo-filled" 
          density="comfortable" 
          auto-grow 
          rows="3" 
        />
      </template>
      <p v-else class="goal-content">{{ project.longTermGoal }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  project: Record<string, any> | null
  editing: boolean
  shortTermGoal: string
  midTermGoal: string
  longTermGoal: string
}>()

const emit = defineEmits<{
  (e: 'update:shortTermGoal', value: string): void
  (e: 'update:midTermGoal', value: string): void
  (e: 'update:longTermGoal', value: string): void
}>()
</script>

<style scoped>
.goals-section h4 {
  margin: 0.75rem 0 0.5rem 0;
  font-size: 1rem;
  color: #1e293b;
}

.goals-section h4:first-child {
  margin-top: 0;
}

.goal-content {
  margin: 0 0 0.5rem 0;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.6;
  padding: 0.5rem;
  background: #f8fafc;
  border-radius: 6px;
  min-height: 2rem;
}
</style>
