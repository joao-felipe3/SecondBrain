<template>
  <v-col :cols="isMobile ? 12 : 8" class="height-100 d-flex flex-column" :class="{ 'px-n2': !isMobile, 'px-2': isMobile }">
    <v-row class="pa-0" style="flex: 0 0 auto">
      <TaskStatsCard :tasks="allTasks" />
    </v-row>
    <v-row class="pa-0 w-100 mb-2 mt-4" style="flex: 1 1 auto; overflow: hidden;">
      <TaskBackgroundDecor :zoomed="zoomed" />
      <TaskBoard 
        :tasks="tasks" 
        :projects="projects"
        :showAllTasks="showAllTasks"
        @show-more-available="handleShowMoreAvailable"
        @zoom-in="$emit('zoom-in')"
        @zoom-out="$emit('zoom-out')"
        @remove-last-task="$emit('remove-last-task', $event)"
        :initialZoomedTask="initialZoomedTask"
      />
      <v-col cols="12" class="d-flex justify-center button-container" style="margin-top: -14%;  z-index: 3;">
        <SvgButton 
          label="Create Task"
          @click="$emit('task-created')"
          :disabled="false"
          :width="isMobile ? 200 : 300"
          :height="isMobile ? 60 : 75"
          :labelSize="isMobile ? 20 : 27"
          style="font-family: 'Irish Grover', cursive;"
        />
        <SvgButton 
          v-if="showMoreAvailable && !showAllTasks" 
          label="Show More"
          @click="handleShowMoreClick"
          :highlight="true"
          :width="isMobile ? 200 : 300"
          :height="isMobile ? 60 : 75"
          :labelSize="isMobile ? 20 : 27"
          style="font-family: 'Irish Grover', cursive;"
        />
      </v-col>
    </v-row>
  </v-col>
</template>

<script setup>
  import { ref } from 'vue'
  import TaskStatsCard from '../board/StatsCard.vue'
  import TaskBackgroundDecor from '../board/BackgroundDecor.vue'
  import TaskBoard from '../board/Board.vue'
  import SvgButton from '../../../ui/svg/Button.vue'
  
  defineProps(['tasks', 'projects', 'zoomed', 'initialZoomedTask', 'allTasks', 'isMobile'])
  defineEmits(['zoom-in', 'zoom-out', 'remove-last-task', 'task-created'])

  const showMoreAvailable = ref(false);
  const showAllTasks = ref(false);

  const handleShowMoreAvailable = (available) => {
    showMoreAvailable.value = available;
  };

  const handleShowMoreClick = () => {
    showAllTasks.value = true;
  };
</script>

<style scoped>
.button-container {
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .button-container {
    margin-top: -8% !important;
  }
}
</style>
