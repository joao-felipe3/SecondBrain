<template>
  <div v-if="isOpen || isClosing" :class="['book-modal-overlay', { 'is-closing': isClosing }]" @click="closeModal">
    <div class="container" @click.stop>
      <button class="close-button" @click="closeModal" aria-label="Fechar modal">
        <X :size="32" />
      </button>
      <button class="nav-arrow nav-prev" :disabled="atStart" @click="go(-1)" aria-label="Página anterior">◀</button>
      <div class="magic-layer" aria-hidden="true">
        <span 
          v-for="s in sparkles" 
          :key="s.id" 
          class="sparkle" 
          :style="{
            left: s.x + '%',
            top: s.y + '%',
            animationDelay: s.delay + 'ms',
            animationDuration: s.duration + 'ms',
            '--spark-size': s.size + 'px',
            '--spark-hue': s.hue
          }"
        ></span>
      </div>
      <div class="sprite-wrapper">
        <div class="book">
          <div ref="carouselEl" class="carousel" style="--slides: 4;">
            <div class="sprite"></div>
            <div class="carousel-item"><GeneralInfoPage :project="project" /></div>
            <div class="carousel-item"><ShortTermGoalPage :project="project" /></div>
            <div class="carousel-item"><MidTermGoalPage :project="project" /></div>
            <div class="carousel-item"><LongTermGoalPage :project="project" /></div>
          </div>
        </div>
      </div>
      <button class="nav-arrow nav-next" :disabled="atEnd" @click="go(1)" aria-label="Próxima página">▶</button>
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
import type { PropType } from 'vue'

type Project = Record<string, any>

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  project: { type: Object as PropType<Project | null>, default: null }
})

const emit = defineEmits(['close'])
const isClosing = ref(false)
let closeTimeout: number | null = null

const closeModal = () => {
  if (isClosing.value) return
  if (!props.isOpen) return
  isClosing.value = true
  // Remove sparkles immediately (optional) or let them fade
  // Wait for CSS animation end; fallback timeout
  const duration = 800 // must match CSS exit total
  if (closeTimeout) window.clearTimeout(closeTimeout)
  closeTimeout = window.setTimeout(finishClose, duration + 50)
}

function finishClose() {
  if (closeTimeout) { window.clearTimeout(closeTimeout); closeTimeout = null }
  isClosing.value = false
  emit('close')
}

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
  el.addEventListener('scroll', () => {
    // debounce via rAF
    requestAnimationFrame(updateIndex)
  }, { passive: true })
})

// Sparkles logic
interface Sparkle {
  id: number
  x: number
  y: number
  delay: number
  duration: number
  size: number
  hue: number
}

const sparkles = ref<Sparkle[]>([])
let sparkleId = 0

function createSparkles(amount = 42) {
  const arr: Sparkle[] = []
  for (let i = 0; i < amount; i++) {
    arr.push({
      id: sparkleId++,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 900,
      duration: 2500 + Math.random() * 4000,
      size: 6 + Math.random() * 16,
      hue: 35 + Math.random() * 25 // warm golden / amber spectrum
    })
  }
  sparkles.value = arr
}

watch(() => props.isOpen, async (open) => {
  if (open) {
    // ensure overlay present before generating sparkles for first paint
    await nextTick()
    createSparkles()
  } else if (!open && !isClosing.value) {
    sparkles.value = []
  }
})
</script>

<style src="./BookModal.css"></style>