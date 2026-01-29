<template>
  <div
    ref="panelRef"
    style="height: 100%; width: 100%; position: relative; overflow: hidden;"
  >
    <WoodenTable :rotate="90" :width="rotatedWidth" :height="rotatedHeight" />

    <v-img
      src="/svg/old-paper.svg"
      alt="Old Paper"
      width="55%"
      class="position-relative"
      style="z-index: 1; top: 3%; left: 25%"
    />

    <!-- Título -->
    <div
      style="position: relative; left: 38%; top: -8%; font-family: 'Irish Grover', cursive; font-size: 300%; z-index: 2;"
    >
      <strong>{{ title }}</strong>
    </div>

    <!-- Lista de projetos -->
    <div :style="{ position: 'absolute', top: '16.5%', left: '8%', zIndex: 2 }">
      <ProjectRow
        v-for="(p, idx) in projects"
        :key="p._id || idx"
        :project="p"
        :width="eightyWidth"
        :height="ninetyHeight"
        @hover="(isHovering) => emit('project-hover', isHovering ? idx : -1)"
        @click="emit('project-click', p)"
        @delete="openDeleteDialog(p)"
      />
    </div>

    <SvgButton 
      label="Create Project"
      @click="emit('create-project')"
      :disabled="false"
      :width="350"
      :height="75"
      :style="{
        fontFamily: '\'Irish Grover\', cursive',
        position: 'absolute',
        bottom: '1%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 7,
        pointerEvents: 'auto'
      }"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import WoodenTable from '../../ui/svg/WoodenTable.vue'
import SvgButton from '../../ui/svg/Button.vue'
import { ProjectRow } from './shared'

const props = defineProps({
  title: {
    type: String,
    default: 'Projetos',
  },
  titleOffset: {
    type: String,
    default: '-10%',
  },
  contentStyle: {
    type: Object,
    default: () => ({}),
  },
  projects: {
    type: Array,
    default: () => [],
  },
})

const panelRef = ref(null)
const rotatedWidth = ref('0px')
const rotatedHeight = ref('0px')
let ro = null

// 80% of the rotated width
const eightyWidth = computed(() => {
  const n = parseFloat(rotatedWidth.value || '0')
  return (n * 0.75) + 'px'
})

// OldPaper viewBox ratio for height calculation
const VIEWBOX_W = 84.4
const VIEWBOX_H = 17.2
const ninetyHeight = computed(() => {
  const wPx = parseFloat(eightyWidth.value || '0')
  const intrinsicHeight = wPx * (VIEWBOX_H / VIEWBOX_W)
  return (intrinsicHeight * 0.85) + 'px'
})

const emit = defineEmits(['delete-project', 'project-hover', 'project-click', 'create-project', 'request-delete'])

function openDeleteDialog(project) {
  emit('request-delete', project)
}

function refreshSizes() {
  const el = panelRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const w = rect.width || el.clientWidth || 0
  const h = rect.height || el.clientHeight || 0
  rotatedWidth.value = (h || window.innerHeight) + 'px'
  rotatedHeight.value = (w || window.innerWidth) + 'px'
}

function setupObserver() {
  if (!panelRef.value) return
  const el = panelRef.value
  refreshSizes()
  ro = new ResizeObserver(() => {
    refreshSizes()
  })
  ro.observe(el)
}

onMounted(async () => {
  await nextTick()
  setupObserver()
})

onBeforeUnmount(() => {
  if (ro && panelRef.value) ro.unobserve(panelRef.value)
  ro = null
})
</script>

<style scoped>
/* No additional styles needed - moved to ProjectRow component */
</style>
