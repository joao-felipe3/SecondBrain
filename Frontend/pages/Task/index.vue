<template>
  <v-row dense class="gap-x-2 px-8 fill-height" style="height: 100%;">
    <Sidebar :activeIcon="activeIcon" @update:activeIcon="activeIcon = $event" />
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

// Estado local
const zoomed = ref(false)
const activeIcon = ref(null)
const newlyCreatedTask = ref(null)

// Store
const taskStore = useTaskStore()
const tasks = ref([])

onMounted(loadInitialTasks)

async function loadInitialTasks() {
  await taskStore.loadTasks()
  tasks.value = taskStore.tasks.filter(task => task.isConcluded !== true)
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
const projects = [
  { code: "P1", name: "Website Redesign", color: "#FF5733", totalHoursWorked: 120 },
  { code: "P2", name: "Backend Development", color: "#33FF57", totalHoursWorked: 200 },
  { code: "P3", name: "Mobile App", color: "#3357FF", totalHoursWorked: 90 },
  { code: "P4", name: "Data Analysis", color: "#FFC300", totalHoursWorked: 75 },
  { code: "P6", name: "DevOps Automation", color: "#C70039", totalHoursWorked: 180 },
  { code: "P7", name: "AI Model Training", color: "#1ABC9C", totalHoursWorked: 140 },
]
</script>
