<template>
  <v-col :cols="isMobile ? 12 : 8" class="height-100 d-flex flex-column" :class="{ 'px-n2': !isMobile, 'px-2': isMobile }">
    <v-row class="pa-0" style="flex: 0 0 auto">
      <TaskStatsCard :tasks="allTasks" />
    </v-row>
    <!-- Papel decorativo com título -->
    <transition name="fade" appear>
          <div v-if="!zoomed" class="decor-header">
            <v-img
              src="svg/old-paper-3.svg"
              alt="Old Paper"
              width="17%"
              class="decor-paper"
              contain
            />

            <svg class="decor-title" viewBox="0 0 300 150">
              <defs>
                <path id="curve" d="M10,90 Q150,10 290,90" fill="transparent" />
              </defs>
              <text fill="black" font-size="48" font-family="'Irish Grover', cursive" font-weight="600">
                <textPath href="#curve" startOffset="50%" text-anchor="middle">
                  Tasks
                </textPath>
              </text>
            </svg>
        </div>
    </transition>
    <v-row class="pa-0 w-100 mb-2 mt-4 task-board-row" style="flex: 1 1 auto; overflow: hidden;">
      <div class="task-bg-layer">
        <TaskBackgroundDecor :zoomed="zoomed" />
      </div>
      
      <TaskBoard
        v-if="viewMode !== 'kanban'"
        :tasks="tasks" 
        :projects="projects"
        :showAllTasks="showAllTasks"
        @show-more-available="handleShowMoreAvailable"
        @zoom-in="$emit('zoom-in')"
        @zoom-out="$emit('zoom-out')"
        @remove-last-task="$emit('remove-last-task', $event)"
        :initialZoomedTask="initialZoomedTask"
      />
      <div v-else style="width: 100%; height: 100%; display: flex; flex-direction: column; position: relative; z-index: 2;">
        <ClientOnly>
          <TaskKanbanBoard
            :key="`kanban-${(allTasks || []).length}`"
            :tasks="allTasks"
            :projects="projects"
            @zoom-in="$emit('zoom-in')"
            @zoom-out="$emit('zoom-out')"
            @remove-last-task="$emit('remove-last-task', $event)"
            @task-moved="$emit('task-moved', $event)"
          />

          <template #fallback>
            <div style="width: 100%; height: 100%;" />
          </template>
        </ClientOnly>
      </div>
      <transition name="fade" appear>
        <v-col v-if="!zoomed" cols="12" class="d-flex justify-center button-container" style="margin-top: -10%;  z-index: 3;">
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
            v-if="viewMode !== 'kanban' && showMoreAvailable && !showAllTasks" 
            label="Show More"
            @click="handleShowMoreClick"
            :highlight="true"
            :width="isMobile ? 200 : 300"
            :height="isMobile ? 60 : 75"
            :labelSize="isMobile ? 20 : 27"
            style="font-family: 'Irish Grover', cursive;"
          />
        </v-col>
      </transition>
    </v-row>
  </v-col>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import TaskStatsCard from '../board/StatsCard.vue'
  import TaskBackgroundDecor from '../board/BackgroundDecor.vue'
  import TaskBoard from '../board/Board.vue'
  import TaskKanbanBoard from '../kanban/KanbanBoard.vue'
  import SvgButton from '../../../ui/svg/Button.vue'
  
  const props = defineProps(['tasks', 'projects', 'zoomed', 'initialZoomedTask', 'allTasks', 'isMobile', 'viewMode'])
  defineEmits(['zoom-in', 'zoom-out', 'remove-last-task', 'task-created', 'task-moved'])

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
.task-board-row {
  position: relative;
}

.task-bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.button-container {
  gap: 0.5rem;
  flex-wrap: wrap;

}

@media (max-width: 767px) {
  .button-container {
    margin-top: -8% !important;
  }
}

.decor-paper {
  position: absolute;
  top: 24%;
  left: 41%;
  z-index: 10;
  pointer-events: none;
}
.decor-title {
  position: absolute;
  top: 23%;
  left: 37.25%;
  width: 25%;
  height: auto;
  z-index: 11;
  pointer-events: none;
}
</style>
