<template>
  <div 
    class="task-board-container" 
    ref="containerRef" 
    :style="{ overflowY: showAllTasks ? 'auto' : 'hidden' }"
  >
    <TaskPaper
      v-for="(task, index) in (showAllTasks ? tasks : tasks.slice(0, maxVisibleTasks))"
      :key="task._id"
      :task="task"
      :projects="projects"
      :data-task-id="task._id"
      :colors="getProjectColors(task.project, projects)"
      :positionStyle="getTaskPositionStyle(index)"
      @click="zoomIntoTask($event, task)"
      @fall-complete="handleCompleteFall"
    />
    <div
      v-if="tasks.length > maxVisibleTasks && !showAllTasks"
      style="height: 400px;" 
    ></div>
  </div>


  <transition name="zoom-fade">
    <div v-if="zoomedTask" class="zoom-container" ref="zoomTarget">
      <TaskPaper 
        class="zoomed-task-paper"
        :key="zoomed ? 'edit' : 'view'" 
        :task="zoomedTask"
        :projects="projects"
        :zoomed="zoomed"
        :create="create"
        :colors="getProjectColors(zoomedTask.project, projects)"
        @close="zoomedTask = null"
        @close-zoom="zoomOutTask"
        @edit-task="handleEdit"
        @delete-task="handleDelete"
      />
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import TaskPaper from './Paper.vue'
import { useTaskPosition } from '~/composables/useTaskPosition'
import { getProjectColors } from '~/composables/useColor'
import { useZoomState } from '~/composables/useZoomState'
import { useZoomController } from '~/composables/useZoomController'
import { useTaskActions } from '~/composables/useTaskActions'

// Props & Emits
const { tasks, projects, initialZoomedTask, showAllTasks } = defineProps([
  'tasks',
  'projects',
  'initialZoomedTask',
  'showAllTasks'
]);

const emit = defineEmits(['zoom-in', 'zoom-out', 'remove-last-task', 'show-more-available'])

// Store
const { getTaskPositionStyle } = useTaskPosition();

// Estado
const zoomState = useZoomState()
const { zoomedTask, zoomed, create } = zoomState

// Controle de zoom
const { zoomIntoTask, zoomOutTask } = useZoomController({
  emit,
  state: zoomState
})

// Ações de tarefa
const { handleEdit, handleDelete, handleCompleteFall } = useTaskActions({
  emit,
  zoomOutTask,
  createRef: zoomState.createRef,
  create: zoomState.create
})

const containerRef = ref(null)
const maxVisibleTasks = ref(tasks.length)

const TASK_HEIGHT = 200;
const GAP_Y_PERCENT = 37;

const updateMaxVisibleTasks = () => {
  const containerHeight = containerRef.value?.clientHeight || 0;

  const gapY = (GAP_Y_PERCENT / 100) * TASK_HEIGHT;
  const rowHeight = TASK_HEIGHT - gapY/3;
  const maxRows = Math.floor(containerHeight / rowHeight);

  let items = 0;
  for (let row = 0; row < maxRows; row++) {
    items += row % 2 === 0 ? 3 : 2;
  }
  maxVisibleTasks.value = items;
  emit('show-more-available', tasks.length > maxVisibleTasks.value);
}

onMounted(() => {
  updateMaxVisibleTasks();
  window.addEventListener('resize', updateMaxVisibleTasks);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMaxVisibleTasks);
});

watch(() => tasks.length, updateMaxVisibleTasks);

watch(() => initialZoomedTask, (newTask) => {
  if (newTask) {
    zoomState.zoomedTask.value = newTask
    zoomState.zoomed.value = true
    zoomState.create.value = true
    emit('zoom-in')
  }
})

</script>

<style scoped>
.zoom-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(1);
  z-index: 999;
}
.zoom-fade-enter-active,
.zoom-fade-leave-active {
  transition: opacity 0.75s ease;
}
.zoom-fade-enter-from,
.zoom-fade-leave-to {
  opacity: 0;
}

.task-board-container {
  position: relative;
  width: 100%;
  height: 60vh;
  overflow-y: auto;
  margin-top: -28rem;
  z-index: 3;
}

.task-board-container::-webkit-scrollbar {
  width: 12px;
}

.task-board-container::-webkit-scrollbar-thumb {
  background: #cf5c2b;
  border-radius: 8px;
  border: 2px solid #59173e;
}

.task-board-container::-webkit-scrollbar-thumb:hover {
  background: #eb924d;
}

.task-board-container::-webkit-scrollbar-track {
  background: linear-gradient(180deg, #5b3a29, #59173e);
  border-radius: 8px;
}
</style>
