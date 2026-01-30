<template>
  <v-col cols="4" class="py-1 d-flex flex-column justify-center" style="height: 100vh; overflow: visible;">
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
