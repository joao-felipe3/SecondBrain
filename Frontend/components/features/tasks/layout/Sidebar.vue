<template>
  <v-col cols="3" class="py-1 d-flex flex-column justify-center task-sidebar">
    <TaskProjectList :projects="projects" />
    <WoodPanel
      title="Calendar"
      :titleOffset="'-9%'"
      :contentStyle="{ top: '-12%', left: '3.5%' }"
      style="overflow: visible; top:-2%;"
    >
      <TaskCalendar />
    </WoodPanel>
  </v-col>
</template>

<script setup>
  import TaskProjectList from '../widgets/ProjectList.vue'
  import TaskCalendar from '../widgets/Calendar.vue'
  import WoodPanel from '../../../ui/panels/WoodPanel.vue'
  
  defineProps(['projects'])
</script>

<style scoped>
.task-sidebar {
  height: 100vh;
  overflow: visible;
  margin-left: -2.5%;
  z-index: -1;
}

@media (max-width: 960px) {
  .task-sidebar {
    height: auto;
    min-height: 100vh;
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .task-sidebar {
    height: auto;
    max-height: 100vh;
    overflow-y: auto;
  }
}
</style>
