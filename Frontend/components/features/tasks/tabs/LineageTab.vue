<template>
  <div class="lineage-tab">
    <div v-if="loading" class="lineage-empty">
      <p>Carregando lineage...</p>
    </div>

    <div v-else-if="error" class="lineage-error">
      <p>{{ error }}</p>
    </div>

    <TaskLineagePanel
      v-else
      :task="task"
      :tasks="tasks"
      :projects="projects"
      :lineage="lineage"
      @navigate-task="emit('navigate-task', $event)"
      @navigate-context="emit('navigate-context', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '~/composables/api/useApi'
import TaskLineagePanel from '../panels/TaskLineagePanel.vue'

interface Props {
  task?: any
  tasks?: any[]
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  tasks: () => [],
  projects: () => [],
})

const emit = defineEmits<{
  (event: 'navigate-task', taskId: string): void
  (event: 'navigate-context', payload: {
    level: 'objective' | 'project' | 'wbs' | 'parent' | 'current'
    targetTaskId: string
    projectId?: string
    wbsNodeId?: string
  }): void
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const lineage = ref<any>(null)

const taskId = computed(() => props.task?._id ?? props.task?.id)

const loadLineage = async () => {
  if (!taskId.value) {
    lineage.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const { get } = useApi(`/tasks/${taskId.value}/lineage`) 
    const { data, error: apiError } = await get()

    if (apiError) {
      error.value = apiError.message || 'Falha ao carregar lineage'
      lineage.value = null
      return
    }

    lineage.value = data
  } catch (err: any) {
    error.value = err?.message || 'Erro desconhecido'
    lineage.value = null
  } finally {
    loading.value = false
  }
}

watch(
  taskId,
  () => {
    loadLineage()
  },
  { immediate: true },
)

onMounted(() => {
  loadLineage()
})
</script>

<style scoped>
.lineage-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2rem;
}
.lineage-empty,
.lineage-error {
  padding: 10px 12px 12px;
}

.lineage-empty p,
.lineage-error p {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
}

.lineage-error p {
  color: #b91c1c;
}

.lineage-tab::-webkit-scrollbar {
  width: 6px;
}

.lineage-tab::-webkit-scrollbar-track {
  background: transparent;
}

.lineage-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}
</style>
