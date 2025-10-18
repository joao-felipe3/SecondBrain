<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <v-textarea 
            v-model="local.shortTermGoal" 
            label="Objetivo curto prazo" 
            variant="solo-filled" 
            density="comfortable" 
            auto-grow 
            rows="3" 
            @update:model-value="emitField('shortTermGoal', $event)" 
          />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div v-if="project">
          <h4>🎯 Objetivo de Médio Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.midTermGoal" 
              label="Objetivo médio prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('midTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.midTermGoal }}</p>
        </div>
        <div v-if="project">
          <h4>🎯 Objetivo de Longo Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.longTermGoal" 
              label="Objetivo longo prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('longTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.longTermGoal }}</p>
        </div>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4 class="tasks-title">📋 Tasks for this project</h4>

        <div v-if="loading">Loading tasks...</div>
        <div v-else>
          <v-simple-table v-if="tasks.length > 0">
            <thead>
              <tr>
                <th class="text-left">Name</th>
                <th class="text-left">Deadline</th>
                <th class="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in tasks" :key="t._id">
                <td>{{ t.name }}</td>
                <td>{{ t.deadline ? formatYMD(t.deadline) : '-' }}</td>
                <td>{{ t.isConcluded ? 'Done' : 'Open' }}</td>
              </tr>
            </tbody>
          </v-simple-table>

          <p v-else>No tasks found for this project.</p>
        </div>
        <p v-if="error" class="error">Error loading tasks</p>
      </div>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import { useApi } from '~/composables/useApi'
import type { PropType } from 'vue'
import { reactive, watch, ref } from 'vue'

const { formatYMD } = useDateFormat()

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
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
</script>

<style scoped>
.right-page .tasks-title {
  text-align: center;
  margin: 0.5rem 0 1rem 0;
}

.right-page table {
  width: 100%;
  border-collapse: collapse;
}

.right-page th,
.right-page td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}

.right-page table,
.right-page th,
.right-page td {
  font-size: 0.7rem; /* slightly smaller table text */
}

.right-page thead th {
  border-bottom: 2px solid rgba(0,0,0,0.12);
  text-transform: none;
  font-weight: 600;
}

.right-page tbody tr:hover {
  background: rgba(0,0,0,0.02);
}

/* Optional: vertical grid lines */
.right-page td + td,
.right-page th + th {
  border-left: 1px solid rgba(0,0,0,0.06);
}
</style>

