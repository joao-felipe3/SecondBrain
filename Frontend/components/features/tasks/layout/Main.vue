<template>
  <v-col cols="8" class="height-100 px-n2 d-flex flex-column">
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
      <v-col cols="12" class="d-flex justify-center" style="margin-top: -14%;  z-index: 3;">
        <SvgButton 
          label="Create Task"
          @click="$emit('task-created')"
          :disabled="false"
          :width="300"
          :height="75"
          :labelSize="27"
          style="font-family: 'Irish Grover', cursive;"
        />
        <SvgButton 
          v-if="showMoreAvailable && !showAllTasks" 
          label="Show More"
          @click="handleShowMoreClick"
          :highlight="true"
          :width="300"
          :height="75"
          :labelSize="27"
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
  
  defineProps(['tasks', 'projects', 'zoomed', 'initialZoomedTask', 'allTasks'])
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
