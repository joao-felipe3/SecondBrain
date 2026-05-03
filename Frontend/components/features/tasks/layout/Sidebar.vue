<template>
  <v-col cols="3" class="py-1 d-flex flex-column justify-center task-sidebar">
    <TaskFiltersPanel
      :projects="projects"
      :project-filter="projectFilter"
      :type-filter="typeFilter"
      :priority-filter="priorityFilter"
      @update:project-filter="$emit('update:projectFilter', $event)"
      @update:type-filter="$emit('update:typeFilter', $event)"
      @update:priority-filter="$emit('update:priorityFilter', $event)"
    />

  </v-col>
</template>

<script setup>
  import { ref } from 'vue'
  import TaskProjectList from '../widgets/ProjectList.vue'
  import TaskFiltersPanel from '../widgets/FiltersPanel.vue'
  import TaskCalendar from '../widgets/Calendar.vue'
  import WoodPanel from '../../../ui/panels/WoodPanel.vue'
  
  const props = defineProps({
    projects: Array,
    projectFilter: String,
    typeFilter: String,
    priorityFilter: String,
  })

  defineEmits(['update:projectFilter', 'update:typeFilter', 'update:priorityFilter'])
</script>

<style scoped>
.task-sidebar {
  min-height: 60vh;
  overflow: visible;
  margin-left: -2%;
  margin-top: 4%;
  z-index: 2;
}

@media (max-width: 960px) {
  .task-sidebar {
    min-height: 100vh;
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .task-sidebar {
    max-height: 100vh;
    overflow-y: auto;
  }
}
</style>
