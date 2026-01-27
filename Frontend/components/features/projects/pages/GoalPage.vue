<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <PlanningAssistant 
          :project="project" 
          @tasks-added="onTasksAdded"
        />
      </div>
    </v-sheet>

    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project">
        <TasksList
          :tasks="tasks"
          :loading="loading"
          :error="error"
          :editing="editing"
          @open-task="openTask"
          @create-task="createNewTask"
        />

        <TaskDialog
          v-model="taskDialogOpen"
          :task="selectedTask"
          :editing="editing"
          :is-creating="isCreatingNewTask"
          :saving="saving"
          :error="dialogError"
          @save="saveTask"
          @delete="deleteTask"
        />
      </div>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { reactive, watch, ref } from 'vue'
import { useApi } from '~/composables/api/useApi'
import { PlanningAssistant, TasksList, TaskDialog } from '../components'

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})
const tasks = ref<any[]>([])
const loading = ref(false)
const error = ref<null | any>(null)

// Dialog e edição de task
const taskDialogOpen = ref(false)
const selectedTask = ref<any | null>(null)
const saving = ref(false)
const dialogError = ref<string | null>(null)
const isCreatingNewTask = ref(false)

function getProjectId(p: any) {
  return p && (p._id || p.id || p.id === 0) ? (p._id || p.id) : null
}

async function fetchTasksForProject(p: any) {
  tasks.value = []
  error.value = null
  const id = getProjectId(p)
  if (!id) return
  loading.value = true
  try {
    const api = useApi(`/projects/${id}/tasks`)
    const { data, error: e } = await api.get()
    if (e) throw e
    tasks.value = data || []
  } catch (err) {
    error.value = err
    console.error('Error fetching tasks for project', err)
  } finally {
    loading.value = false
  }
}

function onTasksAdded(newTasks: any[]) {
  tasks.value.unshift(...newTasks)
}

function createNewTask() {
  isCreatingNewTask.value = true
  selectedTask.value = null
  dialogError.value = null
  taskDialogOpen.value = true
}

function openTask(task: any) {
  isCreatingNewTask.value = false
  selectedTask.value = task
  dialogError.value = null
  taskDialogOpen.value = true
}

async function saveTask(localTask: any) {
  saving.value = true
  dialogError.value = null
  try {
    const payload: any = {
      name: localTask.name,
      description: localTask.description,
      deadline: localTask.deadline ? new Date(localTask.deadline) : new Date(),
      pomodorosPlanned: Number(localTask.pomodorosPlanned),
      pomodorosDid: Number(localTask.pomodorosDid),
      priority: localTask.priority !== null ? Number(localTask.priority) : null,
      difficult: localTask.difficult !== null ? Number(localTask.difficult) : null,
      isConcluded: !!localTask.isConcluded,
      late: false,
      recurrency: 'Daily',
      notification: null,
    }

    if (isCreatingNewTask.value) {
      payload.project = getProjectId(props.project)
      if (!payload.project) throw new Error('Project ID não encontrado')
      
      const { post } = useApi('/tasks')
      const { data, error: e } = await post(payload)
      if (e) throw e
      tasks.value.unshift(data)
    } else if (selectedTask.value) {
      const { patch } = useApi(`/tasks/${selectedTask.value._id}`)
      const { data, error: e } = await patch(payload)
      if (e) throw e
      const idx = tasks.value.findIndex(t => t._id === selectedTask.value._id)
      if (idx >= 0) tasks.value[idx] = data
    }
    
    taskDialogOpen.value = false
    selectedTask.value = null
    isCreatingNewTask.value = false
  } catch (err: any) {
    dialogError.value = isCreatingNewTask.value ? 'Falha ao criar a tarefa.' : 'Falha ao salvar a tarefa.'
    console.error(err)
  } finally {
    saving.value = false
  }
}

async function deleteTask() {
  if (!selectedTask.value) return
  saving.value = true
  dialogError.value = null
  try {
    const { remove } = useApi(`/tasks/${selectedTask.value._id}`)
    const { error: e } = await remove()
    if (e) throw e
    tasks.value = tasks.value.filter(t => t._id !== selectedTask.value._id)
    taskDialogOpen.value = false
    selectedTask.value = null
  } catch (err: any) {
    dialogError.value = 'Falha ao excluir a tarefa.'
    console.error(err)
  } finally {
    saving.value = false
  }
}

// Sincroniza apenas os campos específicos desta página
watch(() => props.project, (v) => { 
  if (v) {
    local.shortTermGoal = v.shortTermGoal
    local.midTermGoal = v.midTermGoal
    local.longTermGoal = v.longTermGoal
    fetchTasksForProject(v)
  }
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.shortTermGoal = props.project.shortTermGoal
    local.midTermGoal = props.project.midTermGoal
    local.longTermGoal = props.project.longTermGoal
  }
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value
  emit('update-field', field, value) 
}
</script>

<style src="../styles/goal-page.css" scoped></style>
