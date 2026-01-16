<template>
  <v-col cols="4" class="py-1 d-flex flex-column justify-center" style="height: 100vh;">
    <TaskProjectList :projects="projects" />
    <WoodPanel
      title="Calendar"
      :titleOffset="'-9%'"
      :contentStyle="{ top: '-12%', left: '3.5%' }"
    >
      <TaskCalendar />
    </WoodPanel>
  </v-col>
</template>

<script setup>
  defineProps(['projects'])
</script>
