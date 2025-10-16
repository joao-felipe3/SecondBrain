<template>
  <v-row dense class="gap-x-2 ml-n4 fill-height" style="height: 100%;">
    <TaskMain
      :tasks="tasks"
      :projects="projects"
      :zoomed="zoomed"
      :initialZoomedTask="newlyCreatedTask"
      @zoom-in="onZoomStart"
      @zoom-out="onZoomEnd"
      @remove-last-task="removeLastTask"
      @task-created="handleTaskCreated"
    />
    <TaskSidebar :projects="projects" />
  </v-row>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTaskStore } from '~/stores/task'
import useTaskHelpers from '~/composables/useTaskHelpers'
import { useApiResource } from '~/composables/useApi'

// Estado local
const zoomed = ref(false)
const activeIcon = ref('goal')
const newlyCreatedTask = ref(null) // Garante que o Board nunca inicie com zoom

// Store
const taskStore = useTaskStore()
const tasks = ref([])

onMounted(() => {
  newlyCreatedTask.value = null // Garante que o Board nunca inicie com zoom
  loadInitialTasks()
})

async function loadInitialTasks() {
  await taskStore.loadTasks()
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
