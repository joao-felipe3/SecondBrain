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
              <v-sheet class="carousel-item" elevation="0" color="transparent"><GeneralInfoPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet class="carousel-item" elevation="0" color="transparent"><GoalPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet class="carousel-item" elevation="0" color="transparent"><MidTermGoalPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
              <v-sheet class="carousel-item" elevation="0" color="transparent"><LongTermGoalPage :project="displayProject || {}" :editing="editing" @update-field="updateField" /></v-sheet>
            </div>
          </v-sheet>
        </v-col>
      </v-row>

      <button class="nav-arrow nav-next" :disabled="atEnd" @click="go(1)" aria-label="Próxima página"> ▶</button>

      <div class="actions-bar" v-if="project">
        <template v-if="!editing">
          <button class="action-btn" @click="startEdit" aria-label="Editar projeto" tabindex="0">Editar</button>
          <button class="action-btn danger" @click="handleDelete" aria-label="Excluir projeto" tabindex="0">Excluir</button>
        </template>
        <template v-else>
          <button class="action-btn" @click="cancelEdit" aria-label="Cancelar edição" tabindex="0">Cancelar</button>
          <button class="action-btn primary" :disabled="saving || !isValid" @click="saveEdit" aria-label="Salvar alterações" tabindex="0">
            <span v-if="!saving">Salvar</span>
            <span v-else>Salvando...</span>
          </button>
        </template>
      </div>
    </v-container>
  </v-row>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, toRef } from 'vue'
import GeneralInfoPage from './BookModal/GeneralInfoPage.vue'
import GoalPage from './BookModal/GoalPage.vue'
import MidTermGoalPage from './BookModal/MidTermGoalPage.vue'
import LongTermGoalPage from './BookModal/LongTermGoalPage.vue'
import { useApiResource } from '~/composables/useApi'
import type { PropType } from 'vue'
import { useCarousel } from '~/composables/useCarousel'
import { useSparkles } from '~/composables/useSparkles'
import { useProjectEditing, getProjectId, type Project } from '~/composables/useProjectEditing'

const CLOSE_ANIM_MS = 800
const TOTAL_SLIDES = 4


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

const handleDelete = async () => {
  if (!props.project) return
  if (!confirm('Tem certeza que deseja excluir este projeto?')) return
  const id = getProjectId(props.project)
  const { error } = await api.remove(id)
  if (error) {
    console.error('Erro ao excluir projeto', error)
  } else {
    emit('deleted', props.project)
    closeModal()
  }
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