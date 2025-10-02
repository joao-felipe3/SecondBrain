<template>
  <!-- Eventos emitidos: close (fechar modal), updated (projeto salvo), deleted (projeto excluído) -->
  <!-- Props: isOpen(Boolean), project(Object) -->
  <!-- Novo modo de edição interno com botões Editar/Excluir/Salvar/Cancelar -->
  <div v-if="isOpen || isClosing" :class="['book-modal-overlay', { 'is-closing': isClosing }]" @click="onBackdrop">
    <div class="container" @click.stop>
      <button class="icon-floating-close" @click="closeModal" aria-label="Fechar modal" tabindex="0"><X :size="22" /></button>
      <button class="nav-arrow nav-prev" :disabled="atStart" @click="go(-1)" aria-label="Página anterior">◀</button>
      <div class="magic-layer" aria-hidden="true">
        <span v-for="s in sparkles" :key="s.id" class="sparkle" :style="{ left: s.x + '%', top: s.y + '%', animationDelay: s.delay + 'ms', animationDuration: s.duration + 'ms', '--spark-size': s.size + 'px', '--spark-hue': s.hue }"></span>
      </div>
      <div class="sprite-wrapper">
        <div class="book">
          <div ref="carouselEl" class="carousel" style="--slides: 4;">
            <div class="sprite"></div>
            <div class="carousel-item"><GeneralInfoPage :project="editing ? draft : project" :editing="editing" @update-field="updateField" /></div>
            <div class="carousel-item"><ShortTermGoalPage :project="editing ? draft : project" :editing="editing" @update-field="updateField" /></div>
            <div class="carousel-item"><MidTermGoalPage :project="editing ? draft : project" :editing="editing" @update-field="updateField" /></div>
            <div class="carousel-item"><LongTermGoalPage :project="editing ? draft : project" :editing="editing" @update-field="updateField" /></div>
          </div>
        </div>
      </div>
      <button class="nav-arrow nav-next" :disabled="atEnd" @click="go(1)" aria-label="Próxima página">▶</button>

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
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import GeneralInfoPage from './BookModal/GeneralInfoPage.vue'
import ShortTermGoalPage from './BookModal/ShortTermGoalPage.vue'
import MidTermGoalPage from './BookModal/MidTermGoalPage.vue'
import LongTermGoalPage from './BookModal/LongTermGoalPage.vue'
import { useApiResource } from '~/composables/useApi'
import type { PropType } from 'vue'

type Project = Record<string, any>

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  project: { type: Object as PropType<Project | null>, default: null }
})

const emit = defineEmits(['close', 'updated', 'deleted'])
const isClosing = ref(false)
let closeTimeout: number | null = null

const editing = ref(false)
const saving = ref(false)
const draft = ref<Project | null>(null)

const api = useApiResource('/projects')

const startEdit = () => {
  if (!props.project) return
  draft.value = JSON.parse(JSON.stringify(props.project))
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
  draft.value = null
}

const isValid = computed(() => {
  if (!editing.value || !draft.value) return true
  return !!draft.value.name && String(draft.value.name).trim().length > 0
})

const saveEdit = async () => {
  if (!props.project || !draft.value || !isValid.value) return
  try {
    saving.value = true
    const { data, error } = await api.update(props.project._id || props.project.id, draft.value)
    if (error) {
      console.error('Erro ao atualizar projeto', error)
    } else {
      emit('updated', data)
      editing.value = false
      draft.value = null
    }
  } finally {
    saving.value = false
  }
}

const handleDelete = async () => {
  if (!props.project) return
  if (!confirm('Tem certeza que deseja excluir este projeto?')) return
  const { error } = await api.remove(props.project._id || props.project.id)
  if (error) {
    console.error('Erro ao excluir projeto', error)
  } else {
    emit('deleted', props.project)
    closeModal()
  }
}

const updateField = (field: string, value: any) => {
  if (!editing.value || !draft.value) return
  draft.value[field] = value
}

const onBackdrop = () => {
  if (editing.value) return // evita fechar enquanto edita
  closeModal()
}

const closeModal = () => {
  if (isClosing.value) return
  if (!props.isOpen) return
  isClosing.value = true
  const duration = 800
  if (closeTimeout) window.clearTimeout(closeTimeout)
  closeTimeout = window.setTimeout(finishClose, duration + 50)
}

function finishClose() {
  if (closeTimeout) { window.clearTimeout(closeTimeout); closeTimeout = null }
  isClosing.value = false
  editing.value = false
  draft.value = null
  emit('close')
}

// Carousel
const carouselEl = ref<HTMLElement | null>(null)
const currentIndex = ref(0)
const totalSlides = 4
const updateIndex = () => {
  const el = carouselEl.value
  if (!el) return
  const w = el.clientWidth
  currentIndex.value = Math.round(el.scrollLeft / w)
}
const go = (dir: number) => {
  const el = carouselEl.value
  if (!el) return
  const w = el.clientWidth
  let target = currentIndex.value + dir
  target = Math.max(0, Math.min(totalSlides - 1, target))
  el.scrollTo({ left: target * w, behavior: 'smooth' })
  currentIndex.value = target
}
const atStart = computed(() => currentIndex.value === 0)
const atEnd = computed(() => currentIndex.value === totalSlides - 1)

onMounted(() => {
  const el = carouselEl.value
  if (!el) return
  el.addEventListener('scroll', () => { requestAnimationFrame(updateIndex) }, { passive: true })
})

// Sparkles
interface Sparkle { id: number; x: number; y: number; delay: number; duration: number; size: number; hue: number }
const sparkles = ref<Sparkle[]>([])
let sparkleId = 0
function createSparkles(amount = 42) {
  const arr: Sparkle[] = []
  for (let i = 0; i < amount; i++) {
    arr.push({ id: sparkleId++, x: Math.random() * 100, y: Math.random() * 100, delay: Math.random() * 900, duration: 2500 + Math.random() * 4000, size: 6 + Math.random() * 16, hue: 35 + Math.random() * 25 })
  }
  sparkles.value = arr
}

watch(() => props.isOpen, async (open) => {
  if (open) { await nextTick(); createSparkles() } else if (!open && !isClosing.value) { sparkles.value = [] }
})
</script>

<style scoped>
/* Remover toolbar antiga */
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