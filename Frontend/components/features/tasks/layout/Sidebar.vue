<template>
  <v-col cols="3" class="py-1 d-flex flex-column justify-center task-sidebar">
    <v-btn
      class="habit-reminder-bell"
      variant="tonal"
      color="brown-darken-2"
      icon
      size="large"
      :aria-label="dueTodayCount > 0 ? `${dueTodayCount} hábitos com lembrete hoje` : 'Lembretes de hábitos'"
      :title="dueTodayCount > 0 ? `${dueTodayCount} hábitos com lembrete hoje` : 'Lembretes de hábitos'"
      @click="$emit('request-habit-notifications')"
    >
      <v-badge color="error" :content="dueTodayCount" :model-value="dueTodayCount > 0" offset-x="2" offset-y="2">
        <v-icon icon="mdi-bell-outline" size="28" />
      </v-badge>
    </v-btn>

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
  import TaskProjectList from '../widgets/ProjectList.vue'
  import TaskFiltersPanel from '../widgets/FiltersPanel.vue'
  import TaskCalendar from '../widgets/Calendar.vue'
  import WoodPanel from '../../../ui/panels/WoodPanel.vue'
  
  const props = defineProps({
    projects: Array,
    projectFilter: String,
    typeFilter: String,
    priorityFilter: String,
    dueTodayCount: {
      type: Number,
      default: 0,
    },
  })

  defineEmits([
    'update:projectFilter',
    'update:typeFilter',
    'update:priorityFilter',
    'request-habit-notifications',
  ])
</script>

<style scoped>
.task-sidebar {
  min-height: 60vh;
  overflow: visible;
  margin-left: -2%;
  margin-top: -3%;
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

.habit-reminder-bell {
  align-self: center;
  margin-left: -3rem;
  min-width: 64px;
  min-height: 64px;
  margin-bottom: 1rem;
  border: 2px solid rgba(212, 165, 116, 0.7);
  background: linear-gradient(135deg, rgba(253, 250, 243, 0.96), rgba(245, 237, 226, 0.96));
  box-shadow: 0 8px 20px rgba(61, 40, 23, 0.12);
}
</style>
