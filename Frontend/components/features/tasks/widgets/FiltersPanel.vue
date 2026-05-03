<template>
  <WoodPanel
    title="Filtros"
    :titleOffset="'-11.5%'"
    :contentStyle="{ top: '-17%', left: '0%' }"
    class="filters-woodpanel"
    style="overflow: visible; margin-top: 1rem; height: 45vh; width: 64vh"
  >
    <div class="filters-container">
      <div class="filter-group">
        <label class="filter-label">Projeto</label>
        <v-select
          v-model="localProjectFilter"
          :items="projectItems"
          item-title="title"
          item-value="value"
          density="comfortable"
          variant="outlined"
          hide-details
          color="primary"
          class="filter-select"
          @update:model-value="emitChanges"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">Tipo</label>
        <v-select
          v-model="localTypeFilter"
          :items="typeItems"
          item-title="title"
          item-value="value"
          density="comfortable"
          variant="outlined"
          hide-details
          color="primary"
          class="filter-select"
          @update:model-value="emitChanges"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">Prioridade</label>
        <v-select
          v-model="localPriorityFilter"
          :items="priorityItems"
          item-title="title"
          item-value="value"
          density="comfortable"
          variant="outlined"
          hide-details
          color="primary"
          class="filter-select"
          @update:model-value="emitChanges"
        />
      </div>

      <div class="buttons-row">
        <SvgButton
          label="Limpar"
          @click="clearFilters"
          :width="200"
          :labelSize="22"
          class="clear-btn"
        />
      </div>
    </div>
  </WoodPanel>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WoodPanel from '../../../ui/panels/WoodPanel.vue'
import SvgButton from '../../../ui/svg/Button.vue'

interface Props {
  projects: any[]
  projectFilter?: string
  typeFilter?: string
  priorityFilter?: string
}

interface Emits {
  (e: 'update:projectFilter', value: string): void
  (e: 'update:typeFilter', value: string): void
  (e: 'update:priorityFilter', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
  projectFilter: '',
  typeFilter: '',
  priorityFilter: '',
})

const emit = defineEmits<Emits>()

const localProjectFilter = ref(props.projectFilter)
const localTypeFilter = ref(props.typeFilter)
const localPriorityFilter = ref(props.priorityFilter)

const projectItems = computed(() => [
  { title: 'Todos', value: '' },
  ...props.projects.map((proj) => ({ title: proj.name, value: proj._id })),
])

const typeItems = [
  { title: 'Todos', value: '' },
  { title: 'Hábito', value: 'habit' },
  { title: 'Subtarefa', value: 'subtask' },
  { title: 'Tarefa', value: 'task' },
]

const priorityItems = [
  { title: 'Todos', value: '' },
  { title: 'Alta', value: 'high' },
  { title: 'Média', value: 'medium' },
  { title: 'Baixa', value: 'low' },
]

// Watch for external updates to props
watch(() => props.projectFilter, (newVal) => {
  localProjectFilter.value = newVal
})
watch(() => props.typeFilter, (newVal) => {
  localTypeFilter.value = newVal
})
watch(() => props.priorityFilter, (newVal) => {
  localPriorityFilter.value = newVal
})

function emitChanges() {
  emit('update:projectFilter', localProjectFilter.value)
  emit('update:typeFilter', localTypeFilter.value)
  emit('update:priorityFilter', localPriorityFilter.value)
}

function clearFilters() {
  localProjectFilter.value = ''
  localTypeFilter.value = ''
  localPriorityFilter.value = ''
  emitChanges()
}
</script>

<style scoped>
.filters-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.1rem 1.25rem;
  height: 100%;
  width: 60%;
  margin-left: 1rem;
  max-width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}

.filters-woodpanel {
  display: flex;
  flex-direction: column;
  height: 55vh;
  width: 100%;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0rem;
}

.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-family: 'Irish Grover', cursive;
}

.filter-select {
  width: 100%;
}

:deep(.filter-select .v-field) {
  border-radius: 10px;
  background: rgba(var(--v-theme-surface), 0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

:deep(.filter-select .v-field__outline) {
  color: rgba(var(--v-theme-on-surface), 0.22);
}

:deep(.filter-select .v-field--focused .v-field__outline) {
  color: rgba(var(--v-theme-primary), 0.85);
}

:deep(.filter-select .v-select__selection-text),
:deep(.filter-select input) {
  font-family: 'Irish Grover', cursive;
  font-size: 13px;
}

.filter-actions {
  display: flex;
  gap: 0.5rem;
}

.buttons-row {
  display: flex;
  flex-direction: row;
  padding-top: 0.75rem;
  margin-left: 0.75rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.status-text {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-align: center;
  font-weight: 500;
}

.clear-btn {
  font-family: 'Irish Grover', cursive;
  letter-spacing: 0.5px;
}

</style>
