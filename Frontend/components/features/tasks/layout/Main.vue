<template>
  <v-col :cols="isMobile ? 12 : 8" class="height-100 d-flex flex-column" :class="{ 'px-n2': !isMobile, 'px-2': isMobile }">
    <v-row class="pa-0" style="flex: 0 0 auto">
      <TaskStatsCard :tasks="allTasks" />
    </v-row>

    <transition name="fade" appear>
      <div v-if="viewMode === 'kanban' && !zoomed" class="decor-header">
        <v-img
          src="svg/old-paper-3.svg"
          alt="Old Paper"
          width="17%"
          class="decor-paper"
          contain
        />

        <svg class="decor-title" viewBox="0 0 300 150" width="100%" height="100%">
          <defs>
            <path id="curve" d="M10,90 Q150,10 290,90" fill="transparent" />
          </defs>
          <text fill="#2c1810" font-size="48" font-family="'Irish Grover', cursive" font-weight="700" letter-spacing="2">
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
      
      <ClientOnly>
        <div v-if="viewMode === 'kanban'" style="width: 100%; height: 100%; display: flex; flex-direction: column; position: relative; z-index: 2;">
          <TaskKanbanBoard
            :key="`kanban-${(allTasks || []).length}`"
            :tasks="filteredTasks"
            :projects="projects"
            :project-filter="projectFilter"
            :type-filter="typeFilter"
            :priority-filter="priorityFilter"
            :is-refreshing="isRefreshing"
            :time-since-refresh="timeSinceRefresh"
            :initial-zoomed-task="initialZoomedTask"
            @zoom-in="$emit('zoom-in')"
            @zoom-out="$emit('zoom-out')"
            @remove-last-task="$emit('remove-last-task', $event)"
            @task-moved="$emit('task-moved', $event)"
          />
        </div>

        <TaskBoard
          v-else
          :tasks="tasks" 
          :projects="projects"
          :showAllTasks="showAllTasks"
          @show-more-available="handleShowMoreAvailable"
          @zoom-in="$emit('zoom-in')"
          @zoom-out="$emit('zoom-out')"
          @remove-last-task="$emit('remove-last-task', $event)"
          :initialZoomedTask="initialZoomedTask"
        />

        <template #fallback>
          <div style="width: 100%; height: 100%;" />
        </template>
      </ClientOnly>
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
        </v-col>
      </transition>
    </v-row>
  </v-col>
</template>

<script setup>
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
  import TaskStatsCard from '../board/StatsCard.vue'
  import TaskBackgroundDecor from '../board/BackgroundDecor.vue'
  import TaskBoard from '../board/Board.vue'
  import TaskKanbanBoard from '../kanban/KanbanBoard.vue'
  import SvgButton from '../../../ui/svg/Button.vue'
  import { useTaskStore } from '~/stores/task'
  
  const props = defineProps({
    tasks: { type: Array, default: () => [] },
    projects: { type: Array, default: () => [] },
    zoomed: { type: Boolean, default: false },
    initialZoomedTask: { type: Object, default: null },
    allTasks: { type: Array, default: () => [] },
    isMobile: { type: Boolean, default: false },
    viewMode: { type: String, default: 'kanban' },
    projectFilter: { type: String, default: '' },
    typeFilter: { type: String, default: '' },
    priorityFilter: { type: String, default: '' },
  })
  defineEmits(['zoom-in', 'zoom-out', 'remove-last-task', 'task-created', 'task-moved'])

  const showMoreAvailable = ref(false)
  const showAllTasks = ref(false)

  // Filter state
  const isRefreshing = ref(false)
  const timeSinceRefresh = ref(0)
  let refreshInterval = null

  const handleShowMoreAvailable = (available) => {
    showMoreAvailable.value = available
  }

  const handleShowMoreClick = () => {
    showAllTasks.value = true
  }

  // Apply filters to tasks
  const filteredTasks = computed(() => {
    let filtered = (props.allTasks || []).filter((task) => {
      if (props.projectFilter && task.project !== props.projectFilter) {
        return false
      }

      if (props.typeFilter) {
        const taskType = task.microTaskType || 'task'
        if (taskType !== props.typeFilter) {
          return false
        }
      }

      if (props.priorityFilter) {
        const taskPriority = task.priority || 'low'
        if (String(taskPriority) !== props.priorityFilter) {
          return false
        }
      }

      return true
    })

    return filtered
  })

  // Auto-refresh every 10s
  onMounted(() => {
    refreshInterval = setInterval(async () => {
      timeSinceRefresh.value += 1
      if (timeSinceRefresh.value >= 10) {
        await manualRefresh()
      }
    }, 1000)
  })

  onBeforeUnmount(() => {
    if (refreshInterval) clearInterval(refreshInterval)
  })

  async function manualRefresh() {
    if (isRefreshing.value) return

    try {
      isRefreshing.value = true
      const taskStore = useTaskStore()
      await taskStore.loadTasks()
      timeSinceRefresh.value = 0
    } catch (err) {
      const error = err || {}
      const aborted =
        error?.code === 'ERR_CANCELED' ||
        error?.name === 'CanceledError' ||
        error?.message?.includes?.('aborted')

      if (!aborted) {
        console.error('Erro ao atualizar tarefas:', err)
      }
    } finally {
      isRefreshing.value = false
    }
  }
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
  filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.1));
}
</style>
