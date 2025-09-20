<template>
  <div
    ref="panelRef"
    style="height: 100%; width: 100%; position: relative; overflow: hidden;"
  >
    <WoodenTable :rotate="90" :width="rotatedWidth" :height="rotatedHeight" />


    <!-- Papel antigo -->
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

    <!-- Slot de conteúdo -->
    
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import WoodenTable from './Svg/WoodenTable.vue'
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
})

const panelRef = ref(null)
const rotatedWidth = ref('0px')
const rotatedHeight = ref('0px')
let ro = null

function refreshSizes() {
  const el = panelRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const w = rect.width || el.clientWidth || 0
  const h = rect.height || el.clientHeight || 0
  // When rotated 90deg, width must equal parent's height and height must equal parent's width
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
