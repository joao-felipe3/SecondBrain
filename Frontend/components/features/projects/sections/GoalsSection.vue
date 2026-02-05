<template>
  <div class="goals-section">
    <div v-if="project">
      <h4 class="section-title">📋 Objetivos por Prazo</h4>
      
      <h5>🎯 Objetivo de Curto Prazo</h5>
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
      <p v-else class="goal-content">{{ project.shortTermGoal || 'Não definido' }}</p>

      <h5>🎯 Objetivo de Médio Prazo</h5>
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
      <p v-else class="goal-content">{{ project.midTermGoal || 'Não definido' }}</p>

      <h5>🎯 Objetivo de Longo Prazo</h5>
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
      <p v-else class="goal-content">{{ project.longTermGoal || 'Não definido' }}</p>
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
.goals-section {
  width: 100%;
}

.section-title {
  margin: 0 0 1.5rem 0;
  font-size: 1.1rem;
  color: #1e293b;
  font-weight: 600;
}

.goals-section h5 {
  margin: 1rem 0 0.5rem 0;
  font-size: 0.95rem;
  color: #475569;
  font-weight: 500;
}

.goal-content {
  margin: 0 0 1rem 0;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.6;
  padding: 0 0 0 0.75rem;
  background: transparent;
  min-height: 2rem;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>

