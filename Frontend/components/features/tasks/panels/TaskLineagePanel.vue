<template>
  <section class="lineage-panel">
    <header class="lineage-panel__header">
      <div>
        <h2 class="lineage-panel__title">Task Lineage</h2>
      </div>
      <button
        v-if="siblingTasks.length"
        type="button"
        class="lineage-panel__toggle"
        @click="showSiblings = !showSiblings"
      >
        {{ showSiblings ? 'Ocultar siblings' : `Mostrar siblings (${siblingTasks.length})` }}
      </button>
    </header>

    <nav class="lineage-panel__breadcrumb" aria-label="Breadcrumb de lineage">
      <button
        v-for="item in breadcrumb"
        :key="item.key"
        type="button"
        class="lineage-panel__crumb"
        :class="{ 'is-current': item.current }"
        :disabled="item.disabled"
        @click="handleCrumbClick(item)"
      >
        <span class="lineage-panel__crumb-label">{{ item.label }}</span>
        <span v-if="item.meta" class="lineage-panel__crumb-meta">{{ item.meta }}</span>
      </button>
    </nav>

    <div v-if="lineage?.warnings?.length" class="lineage-panel__warnings">
      <div class="lineage-panel__section-title">Avisos</div>
      <ul>
        <li v-for="warning in lineage.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <section v-if="showSiblings && siblingTasks.length" class="lineage-panel__siblings">
      <div class="lineage-panel__section-title">Siblings</div>
      <div class="lineage-panel__siblings-grid">
        <button
          v-for="sibling in siblingTasks"
          :key="sibling._id"
          type="button"
          class="lineage-panel__sibling"
          @click="navigateToTask(sibling._id)"
        >
          <strong>{{ sibling.name }}</strong>
          <span>{{ sibling.status || 'todo' }}</span>
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface LineageNode {
  _id: string
  name: string
  status?: string
}

type LineageLevel = 'objective' | 'project' | 'wbs' | 'parent' | 'current'

interface LineageNavigationContext {
  level: LineageLevel
  targetTaskId: string
  projectId?: string
  wbsNodeId?: string
}

interface Props {
  task?: any
  tasks?: any[]
  projects?: any[]
  lineage?: {
    ancestors?: LineageNode[]
    children?: LineageNode[]
    warnings?: string[]
  } | null
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  tasks: () => [],
  projects: () => [],
  lineage: null,
})

const emit = defineEmits<{
  (event: 'navigate-task', taskId: string): void
  (event: 'navigate-context', payload: LineageNavigationContext): void
}>()

const showSiblings = ref(false)

const currentTaskId = computed(() => props.task?._id ?? props.task?.id ?? '')

function resolveProjectId() {
  const project = props.task?.project
  if (!project) return ''
  if (typeof project === 'string') return project
  return String(project._id ?? project.id ?? '')
}

const project = computed(() => {
  const taskProjectId = resolveProjectId()
  return (props.projects || []).find((project) => String(project?._id ?? project?.id ?? '') === taskProjectId) || null
})

const parentTask = computed(() => {
  const ancestors = props.lineage?.ancestors || []
  return ancestors.length ? ancestors[ancestors.length - 1] : null
})

const objectiveLabel = computed(() => {
  const objective = project.value?.shortTermGoal || project.value?.description || project.value?.name
  return objective ? String(objective) : 'Objetivo'
})

const wbsLabel = computed(() => {
  const task = props.task || {}
  const path = String(task.wbsPath || '')
  if (path) {
    const parts = path.split(/\s*[>/|]\s*/).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : path
  }

  if (task.parentWbsNodeId) {
    return `WBS ${String(task.parentWbsNodeId).slice(0, 6)}`
  }

  return 'WBS'
})

const siblingTasks = computed(() => {
  const taskId = currentTaskId.value
  const task = props.task || {}
  const sameParentTaskId = String(task.parentTaskId || '')
  const sameWbsNodeId = String(task.parentWbsNodeId || '')

  return (props.tasks || [])
    .filter((candidate) => {
      const candidateId = String(candidate?._id ?? candidate?.id ?? '')
      if (!candidateId || candidateId === taskId) return false

      if (sameParentTaskId && String(candidate?.parentTaskId || '') === sameParentTaskId) return true
      if (sameWbsNodeId && String(candidate?.parentWbsNodeId || '') === sameWbsNodeId) return true
      return false
    })
    .sort((a, b) => {
      const orderA = Number(a?.kanbanOrder ?? 0)
      const orderB = Number(b?.kanbanOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a?.name || '').localeCompare(String(b?.name || ''))
    })
})

const breadcrumb = computed(() => ([
  {
    key: 'objective',
    label: 'Objetivo',
    meta: objectiveLabel.value,
    disabled: false,
    current: false,
    targetTaskId: resolveObjectiveTaskId(),
  },
  {
    key: 'project',
    label: 'Projeto',
    meta: project.value?.name || 'Sem projeto',
    disabled: !project.value,
    current: false,
    targetTaskId: resolveProjectTaskId(),
  },
  {
    key: 'wbs',
    label: 'WBS',
    meta: wbsLabel.value,
    disabled: false,
    current: false,
    targetTaskId: resolveWbsTaskId(),
  },
  {
    key: 'parent',
    label: 'ParentTask',
    meta: parentTask.value?.name || 'Sem parent',
    disabled: !parentTask.value,
    current: false,
    targetTaskId: parentTask.value?._id || '',
  },
  {
    key: 'current',
    label: 'ThisTask',
    meta: props.task?.name || 'Task atual',
    disabled: false,
    current: true,
    targetTaskId: currentTaskId.value,
  },
]))

function resolveObjectiveTaskId() {
  const projectId = String(props.task?.project || '')
  if (!projectId) return currentTaskId.value

  const candidates = (props.tasks || []).filter((candidate) => String(candidate?.project || '') === projectId)
  const root = candidates.find((candidate) => !candidate?.parentTaskId) || candidates[0]
  return String(root?._id ?? root?.id ?? currentTaskId.value)
}

function resolveProjectTaskId() {
  const projectId = String(props.task?.project || '')
  if (!projectId) return currentTaskId.value

  const candidates = (props.tasks || []).filter((candidate) => String(candidate?.project || '') === projectId)
  const ordered = candidates.sort((a, b) => {
    const orderA = Number(a?.kanbanOrder ?? 0)
    const orderB = Number(b?.kanbanOrder ?? 0)
    if (orderA !== orderB) return orderA - orderB
    return String(a?.name || '').localeCompare(String(b?.name || ''))
  })

  return String((ordered[0]?._id ?? ordered[0]?.id) || currentTaskId.value)
}

function resolveWbsTaskId() {
  const wbsNodeId = String(props.task?.parentWbsNodeId || '')
  if (!wbsNodeId) return currentTaskId.value

  const candidates = (props.tasks || []).filter((candidate) => String(candidate?.parentWbsNodeId || '') === wbsNodeId)
  const ordered = candidates.sort((a, b) => {
    const orderA = Number(a?.kanbanOrder ?? 0)
    const orderB = Number(b?.kanbanOrder ?? 0)
    if (orderA !== orderB) return orderA - orderB
    return String(a?.name || '').localeCompare(String(b?.name || ''))
  })

  return String((ordered[0]?._id ?? ordered[0]?.id) || currentTaskId.value)
}

function navigateToTask(taskId: string) {
  if (!taskId) return
  emit('navigate-task', taskId)
}

function handleCrumbClick(item: any) {
  if (item.disabled) return

  const payload: LineageNavigationContext = {
    level: item.key,
    targetTaskId: String(item.targetTaskId || ''),
    projectId: resolveProjectId(),
    wbsNodeId: String(props.task?.parentWbsNodeId || ''),
  }

  emit('navigate-context', payload)
  navigateToTask(item.targetTaskId)
}
</script>

<style scoped>
.lineage-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(166, 121, 74, 0.18);
  background: linear-gradient(180deg, rgba(255, 248, 236, 0.9), rgba(255, 245, 225, 0.72));
  box-shadow: 0 10px 24px rgba(54, 34, 16, 0.08);
}

.lineage-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.lineage-panel__eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8b5d36;
}

.lineage-panel__title {
  margin: 0;
  font-size: 22px;
  line-height: 1.05;
  color: #3e2723;
}

.lineage-panel__toggle {
  border: 1px solid rgba(166, 121, 74, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px 12px;
  font-size: 11px;
  color: #6f4829;
}

.lineage-panel__breadcrumb {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.lineage-panel__crumb {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(166, 121, 74, 0.18);
  background: rgba(255, 255, 255, 0.8);
  text-align: left;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}

.lineage-panel__crumb:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: rgba(166, 121, 74, 0.36);
  box-shadow: 0 8px 16px rgba(54, 34, 16, 0.08);
}

.lineage-panel__crumb:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.lineage-panel__crumb.is-current {
  background: linear-gradient(180deg, rgba(212, 165, 116, 0.25), rgba(255, 255, 255, 0.92));
}

.lineage-panel__crumb-label {
  font-size: 12px;
  font-weight: 700;
  color: #6f4829;
}

.lineage-panel__crumb-meta {
  font-size: 13px;
  line-height: 1.25;
  color: #3e2723;
}

.lineage-panel__warnings,
.lineage-panel__siblings {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(166, 121, 74, 0.14);
  background: rgba(255, 255, 255, 0.72);
}

.lineage-panel__section-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #8b5d36;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lineage-panel__warnings ul {
  margin: 0;
  padding-left: 18px;
}

.lineage-panel__warnings li {
  font-size: 13px;
  line-height: 1.35;
  color: #5f3b21;
}

.lineage-panel__siblings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.lineage-panel__sibling {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(166, 121, 74, 0.18);
  background: rgba(255, 255, 255, 0.82);
  text-align: left;
}

.lineage-panel__sibling strong {
  font-size: 13px;
  color: #3e2723;
}

.lineage-panel__sibling span {
  font-size: 11px;
  color: #8b5d36;
  text-transform: uppercase;
}
</style>