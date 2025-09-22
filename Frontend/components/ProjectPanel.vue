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

    <!-- Lista de papéis para cada projeto -->
    <div
      :style="{
        position: 'absolute',
        top: '16.5%',
        left: '8%',
        zIndex: 2,
      }"
    >
      <div v-for="(p, idx) in projects" :key="p._id || idx" style="margin-bottom: 1.25rem; position: relative;">
        <OldPaper :style="{ width: eightyWidth, height: ninetyHeight }" />
        
        <!-- Project info overlay -->
        <div style="position: absolute; top: 0%; left: 6%; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: left; z-index: 3; pointer-events: none;">
          <!-- Project name and hours (larger font) -->
          <div style="font-family: 'Irish Grover', cursive; font-size: 1.4rem; font-weight: bold; color: #000; text-align: left; margin-bottom: 0.25rem; margin-top: 0.4rem;">
            {{ p.name }} - {{ p.totalHoursWorked || 0 }}/{{ p.plannedHours || 0 }}h
          </div>
          
          <!-- Deadline (smaller font) -->
          <div style="margin-bottom: 0.25rem; display: flex; align-items: center; gap: 1.25rem; font-family: 'Irish Grover', cursive; font-size: 1rem; text-align: left;" :style="{ color: p.deadline ? getDeadlineColor(p.deadline) : '#000' }">
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <Calendar :size="16" />
              <span>Deadline: {{ p.deadline ? formatDeadline(p.deadline) : 'No deadline' }}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <Coins :size="16" />
              <span>{{ p.reward || 0 }}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <Award :size="16" />
              <span>{{ p.experience || 0 }} EXP</span>
            </div>
          </div>

          <!-- Progress Bars -->
          <div style="position: relative; z-index: 4; margin-left: 12%; margin-top: -0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <!-- Bar as background -->
            <div :style="{ width: barWidth, height: '1rem', position: 'relative' }">
              <Bar style="width: 100%; height: 130%;" />
              <!-- ProgressBar overlaid inside Bar with dynamic width based on progress -->
              <div style="position: absolute; top: -20%; left: 5%; z-index: 6; height: 0.6rem;" :style="{ width: `${(p.progressPercentage || 0)}%` }">
                <ProgressBar style="width: 100%; height: 100%;" :project-color="p.color" :project-id="p._id" />
              </div>
            </div>
            <!-- Percentage text -->
            <div style="font-family: 'Irish Grover', cursive; font-size: 0.9rem; font-weight: bold; margin-top: -0.35rem;" :style="{ color: p.color || '#000' }">
              {{ (p.progressPercentage || 0).toFixed(1) }}%
            </div>
          </div>

        </div>
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Calendar, Coins, Award } from 'lucide-vue-next'
import WoodenTable from './Svg/WoodenTable.vue'
import OldPaper from './Svg/OldPaper.vue'
import Bar from './Svg/Bar.vue'
import ProgressBar from './Svg/ProgressBar.vue'
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

// 80% of the rotated width (string in px)
const eightyWidth = computed(() => {
  const n = parseFloat(rotatedWidth.value || '0')
  return (n * 0.75) + 'px'
})

// 80% of eightyWidth for the Bar component
const barWidth = computed(() => {
  const n = parseFloat(eightyWidth.value || '0')
  const result = (n * 0.65) + 'px'
  return result
})

// OldPaper viewBox: 84.4 (w) x 17.2 (h) => intrinsic ratio h/w
const VIEWBOX_W = 84.4
const VIEWBOX_H = 17.2
const ninetyHeight = computed(() => {
  const wPx = parseFloat(eightyWidth.value || '0')
  const intrinsicHeight = wPx * (VIEWBOX_H / VIEWBOX_W)
  return (intrinsicHeight * 0.85) + 'px'
})

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

// Deadline formatting functions (same as TaskPreview)
function formatDeadline(date) {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  if (diff === 0) return "Today";
  if (diff < 0) return "LATE!";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }).toLowerCase();
}

function getDeadlineColor(date) {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d.getTime() < now.getTime() ? "red" : "#000";
}
</script>
