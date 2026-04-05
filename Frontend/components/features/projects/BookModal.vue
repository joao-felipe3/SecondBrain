<template>
  <v-row no-gutters v-if="isOpen || isClosing" :class="['book-modal-overlay', { 'is-closing': isClosing }]" @click="onBackdrop">
    <v-container class="container" @click.stop>
      <button class="icon-floating-close" @click="closeModal" aria-label="Fechar modal" tabindex="0"><X :size="22" /></button>
      <button class="nav-arrow nav-prev" :disabled="atStart" @click="go(-1)" aria-label="Página anterior">◀</button>

      <v-row class="magic-layer" aria-hidden="true">
        <v-sheet 
          v-for="s in sparkles" 
          class="sparkle"
          :key="s.id"  
          :style="{ left: s.x + '%', top: s.y + '%', animationDelay: s.delay + 'ms', animationDuration: s.duration + 'ms', '--spark-size': s.size + 'px', '--spark-hue': s.hue }"
        ></v-sheet>
      </v-row>

      <v-row class="sprite-wrapper" no-gutters align="center" style="min-height: 60vh;">
        <v-col class="d-flex justify-center">
          <v-sheet class="book" elevation="2" color="transparent">
            <div ref="carouselEl" class="carousel" :style="{ '--slides': `${TOTAL_SLIDES}` }">
              <v-sheet class="sprite" elevation="0" color="transparent"></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 0 }]" elevation="0" color="transparent"><GeneralInfoPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 1 }]" elevation="0" color="transparent"><SmartObjectivesPage :project="displayProject || {}" :editing="editing" @update-field="updateField" @smart-objective-updated="reloadProject" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 2 }]" elevation="0" color="transparent"><WBSPage :project="displayProject || {}" :editing="editing" @wbs-updated="reloadProject" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 3 }]" elevation="0" color="transparent"><CriticalPathPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 4 }]" elevation="0" color="transparent"><RTMPage :project="displayProject as Project" :editing="editing" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 5 }]" elevation="0" color="transparent"><RiskPage :project="displayProject as Project" :editing="editing" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 6 }]" elevation="0" color="transparent"><GanttPage :project="displayProject as Project" :editing="editing" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 7 }]" elevation="0" color="transparent"><PertDiagramPage :project="displayProject as Project" :editing="editing" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 8 }]" elevation="0" color="transparent"><XMatrixPage :project="displayProject as Project" :editing="editing" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 9 }]" elevation="0" color="transparent"><GoalPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet :class="['carousel-item', { active: currentIndex === 10 }]" elevation="0" color="transparent"><BacklogAndProgress :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
            </div>
          </v-sheet>
        </v-col>
      </v-row>

      <button class="nav-arrow nav-next" :disabled="atEnd" @click="go(1)" aria-label="Próxima página"> ▶</button>

      <div class="actions-bar" v-if="project">
        <template v-if="!editing">
          <button class="action-btn" @click="startEdit" aria-label="Edit project" tabindex="0">Edit</button>
          <button class="action-btn danger" @click="showDeleteDialog = true" aria-label="Delete project" tabindex="0">Delete</button>
        </template>
        <template v-else>
          <button class="action-btn" @click="cancelEdit" aria-label="Cancel edit" tabindex="0">Cancel</button>
          <button class="action-btn primary" :disabled="saving || !isValid" @click="saveEdit" aria-label="Save changes" tabindex="0">
            <span v-if="!saving">Save</span>
            <span v-else>Saving...</span>
          </button>
        </template>
      </div>
    </v-container>
    
    <!-- Delete Confirmation Dialog -->
    <DeleteProjectDialog
      v-model="showDeleteDialog"
      :projectName="project?.name || ''"
      :taskCount="taskCount"
      @confirm="confirmDelete"
    />
  </v-row>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, toRef } from 'vue'
import GeneralInfoPage from './pages/GeneralInfoPage.vue'
import GoalPage from './pages/GoalPage.vue'
import SmartObjectivesPage from './pages/SmartObjectivesPage.vue'
import WBSPage from './pages/WBSPage.vue'
import BacklogAndProgress from './pages/BacklogAndProgress.vue'
import CriticalPathPage from './pages/CriticalPathPage.vue'
import RTMPage from './pages/RTMPage.vue'
import RiskPage from './pages/RiskPage.vue'
import GanttPage from './pages/GanttPage.vue'
import PertDiagramPage from './pages/PertDiagramPage.vue'
import XMatrixPage from './pages/XMatrixPage.vue'
import DeleteProjectDialog from '../../shared/dialogs/DeleteProjectDialog.vue'
import { useApiResource, useApi } from '~/composables/api'
import type { PropType } from 'vue'
import { useCarousel } from '~/composables/ui/useCarousel'
import { useSparkles } from '~/composables/ui/useSparkles'
import { useProjectEditing, getProjectId } from '~/composables/features/useProjectEditing'
import type { Project } from '~/models/Project'

const CLOSE_ANIM_MS = 800
const TOTAL_SLIDES = 11


const props = defineProps({
  isOpen: { type: Boolean, default: false },
  project: { type: Object as PropType<Project | null>, default: null },
  startInEdit: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'updated', 'deleted'])

// State
const isClosing = ref(false)
let closeTimeout: number | null = null

const api = useApiResource('/projects')

const { carouselEl, currentIndex, atStart, atEnd, go, updateIndex, attach, detach, reset } = useCarousel(TOTAL_SLIDES)
const { sparkles, createSparkles, clearSparkles } = useSparkles()
const projectRef = toRef(props, 'project')
const { editing, saving, draft, displayProject, isValid, startEdit: startEditInner, cancelEdit: cancelEditInner, updateField, reset: resetEditing } = useProjectEditing(projectRef)

// Editing wrappers glue to props
const startEdit = () => startEditInner(props.project)
const cancelEdit = () => cancelEditInner()

// Save/Delete
const saveEdit = async () => {
  if (!draft.value || !isValid.value) return
  try {
    saving.value = true
    const id = getProjectId(props.project as any)
    if (id) {
      const { data } = await api.update(id, draft.value)
      emit('updated', data)
    } else {
      const { data } = await api.create(draft.value)
      emit('updated', data)
    }
    cancelEdit()
  } finally {
    saving.value = false
  }
}

const showDeleteDialog = ref(false)
const taskCount = ref(0)

// Reload project (for SMART objective updates)
async function reloadProject() {
  if (!props.project?._id) return

  try {
    const id = props.project._id
    const { get } = useApi(`/projects/${id}`)
    const { data, error } = await get()
    if (error) {
      throw error
    }
    emit('updated', data)
  } catch (error) {
    console.error('Failed to reload project:', error)
  }
}

// Load task count when project changes
watch(() => props.project, async (newProject) => {
  if (newProject?._id) {
    try {
      const response = await fetch(`http://localhost:3000/projects/${newProject._id}/tasks`)
      const tasks = await response.json()
      taskCount.value = tasks.length
    } catch (error) {
      console.error('Failed to load task count', error)
      taskCount.value = 0
    }
  } else {
    taskCount.value = 0
  }
}, { immediate: true })

const confirmDelete = async (deleteTasks: boolean) => {
  if (!props.project) return
  const id = getProjectId(props.project)
  
  try {
    const response = await fetch(
      `http://localhost:3000/projects/${id}?deleteTasks=${deleteTasks}`,
      { method: 'DELETE' }
    )
    
    if (!response.ok) {
      throw new Error('Failed to delete project')
    }

    const result = await response.json()
    console.log(result.message)
    
    emit('deleted', props.project)
    closeModal()
  } catch (error) {
    console.error('Error deleting project:', error)
  }
  
  showDeleteDialog.value = false
}

// Backdrop/Close
const onBackdrop = () => {
  if (editing.value) return
  closeModal()
}
const closeModal = () => {
  if (isClosing.value || !props.isOpen) return
  isClosing.value = true
  if (closeTimeout) window.clearTimeout(closeTimeout)
  closeTimeout = window.setTimeout(finishClose, CLOSE_ANIM_MS + 50)
}
function finishClose() {
  if (closeTimeout) { window.clearTimeout(closeTimeout); closeTimeout = null }
  isClosing.value = false
  resetEditing()
  emit('close')
}

onMounted(() => {
  attach()
})

onBeforeUnmount(() => {
  detach()
})

// Open/close effects
watch(() => props.isOpen, async (open) => {
  if (open) {
    await nextTick()
    reset()
    createSparkles()
    attach()
    if (props.startInEdit) {
      // Start editing for create flow or quick edit
      startEdit()
    }
  } else if (!open && !isClosing.value) {
    clearSparkles()
    detach()
  }
})
</script>

<style scoped>
.toolbar { display:none; }
.icon-floating-close { position:absolute; top:.5rem; right:.5rem; background:rgba(0,0,0,.45); border:none; color:#fff; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; backdrop-filter: blur(4px); }
.icon-floating-close:hover { background:rgba(0,0,0,.65); }
.actions-bar { margin-top:1.25rem; display:flex; gap:.75rem; justify-content:center; flex-wrap:wrap; /* fix click */ position:relative; z-index:3001; pointer-events:auto; }
.action-btn { background:rgba(255,255,255,0.09); color:#fff; border:1px solid rgba(255,255,255,0.18); padding:.55rem 1.1rem; border-radius:6px; cursor:pointer; font:inherit; font-size:.9rem; letter-spacing:.5px; display:inline-flex; align-items:center; gap:.35rem; transition:.25s; }
.action-btn:hover { background:rgba(255,255,255,0.18); }
.action-btn.primary { background:#2563eb; border-color:#1d4ed8; }
.action-btn.primary:hover { background:#1d4ed8; }
.action-btn.danger { background:#dc2626; border-color:#b91c1c; }
.action-btn.danger:hover { background:#b91c1c; }
.action-btn:disabled { opacity:.55; cursor:not-allowed; }
</style>

<style src="./BookModal.css"></style>