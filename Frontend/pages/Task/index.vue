<template>
  <v-row dense class="gap-x-2 fill-height" :class="{ 'ml-n4': !isMobile }" style="height: 100%;">
    <TaskMain
      :tasks="tasks"
      :allTasks="allTasks"
      :projects="projects"
      :zoomed="zoomed"
      :initialZoomedTask="newlyCreatedTask"
      :isMobile="isMobile"
      @zoom-in="onZoomStart"
      @zoom-out="onZoomEnd"
      @remove-last-task="removeLastTask"
      @task-created="handleTaskCreated"
    />
    <TaskSidebar v-if="!isMobile" :projects="projects" />
  </v-row>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useTaskStore } from '~/stores/task'
import useTaskHelpers from '~/composables/features/useTaskHelpers'
import { useApiResource } from '~/composables/api/useApi'
import TaskMain from '../../components/features/tasks/layout/Main.vue'
import TaskSidebar from '../../components/features/tasks/layout/Sidebar.vue'

// Responsive
const MOBILE_BREAKPOINT = 960
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
}

// Estado local
const zoomed = ref(false)
const activeIcon = ref('goal')
const newlyCreatedTask = ref(null) // Garante que o Board nunca inicie com zoom

// Store
const taskStore = useTaskStore()
const tasks = ref([])
const allTasks = ref([]) // All tasks including completed ones

onMounted(() => {
  newlyCreatedTask.value = null // Garante que o Board nunca inicie com zoom
  loadInitialTasks()
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

async function loadInitialTasks() {
  await taskStore.loadTasks()
  allTasks.value = taskStore.tasks // Keep all tasks
  tasks.value = taskStore.tasks
    .filter(task => task.isConcluded !== true)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
}

// Manipulação de zoom
const onZoomStart = () => zoomed.value = true
const onZoomEnd = () => zoomed.value = false

// Helpers
const { createNewTask } = useTaskHelpers()

function handleTaskCreated() {
  const task = createNewTask()
  tasks.value.push(task)
  newlyCreatedTask.value = task
}

function removeLastTask(taskId) {
  tasks.value = tasks.value.filter(task => task._id !== taskId)
}

// Projetos mockados
const projects = ref([])
const api = useApiResource('/projects')

onMounted(async () => {
  // Load tasks first as before
  newlyCreatedTask.value = null
  await loadInitialTasks()

  // Then load projects from backend
  try {
    const { data, error } = await api.list()
    if (error) {
      console.error('Failed to load projects for /task page', error)
    } else if (data) {
      projects.value = Array.isArray(data) ? data : []
    }
  } catch (e) {
    console.error('Unexpected error loading projects', e)
  }
})
</script>
