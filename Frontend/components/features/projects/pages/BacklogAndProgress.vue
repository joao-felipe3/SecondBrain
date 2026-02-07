<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <BacklogSection
        v-if="project"
        :ideas="ideas"
        :editing="editing"
        @add="addIdea"
        @remove="removeIdea"
      />
    </div>
    <div class="page right-page">
      <ProgressSection
        v-if="project"
        :tasks="projectTasks"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, watch } from 'vue'
import { useApiResource } from '~/composables/api'
import { BacklogSection, ProgressSection } from '../sections'

type Project = Record<string, any>

interface BacklogIdea {
  text: string
  createdAt: string
}

interface Task {
  _id?: string
  id?: string
  name: string
  description?: string
  deadline?: Date
  pomodorosPlanned?: number
  pomodorosDid?: number
  isConcluded: boolean
}

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const tasksApi = useApiResource('/tasks')

// Backlog de Ideias
const ideas = ref<BacklogIdea[]>([])

// Tarefas do projeto
const projectTasks = ref<Task[]>([])

function addIdea(idea: BacklogIdea) {
  ideas.value.unshift(idea)
  persistBacklog()
}

function removeIdea(index: number) {
  ideas.value.splice(index, 1)
  persistBacklog()
}

function persistBacklog() {
  emit('update-field', 'backlogIdeas', ideas.value)
}

async function loadProjectTasks() {
  const projectId = (props.project as any)?._id || (props.project as any)?.id
  if (!projectId) return
  
  try {
    const { data } = await tasksApi.list()
    if (data && Array.isArray(data)) {
      projectTasks.value = data.filter((task: any) => task.project === projectId)
    }
  } catch (error) {
    console.error('Erro ao carregar tarefas:', error)
  }
}

watch(() => props.project, (v) => {
  if (v) {
    if ((v as any).backlogIdeas && Array.isArray((v as any).backlogIdeas)) {
      ideas.value = [...(v as any).backlogIdeas]
    }
    loadProjectTasks()
  }
}, { immediate: true })
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
}

.page {
  flex: 1;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
}

.left-page {
  border-right: 1px solid #e2e8f0;
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-container.editing .page {
  background: rgba(255, 255, 255, 0.95);
}
</style>
