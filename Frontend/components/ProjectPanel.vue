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
    <div :style="{ position: 'absolute', top: '16.5%', left: '8%', zIndex: 2,}">
      <div 
        v-for="(p, idx) in projects" 
        :key="p._id || idx" 
        class="project-row" 
        style="margin-bottom: 1.25rem; position: relative; cursor: pointer;"
        @mouseenter="emit('project-hover', idx)"
        @mouseleave="emit('project-hover', -1)"
        @click="emit('project-click', p)"
      >
        <OldPaper :style="{ width: eightyWidth, height: ninetyHeight }" />
        
        <div style="position: absolute; top: 0%; left: 5%; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: left; z-index: 3; pointer-events: none;">
          <div style="font-family: 'Irish Grover', cursive; font-size: 1.4rem; font-weight: bold; color: #000; text-align: left; margin-bottom: 0.25rem; margin-top: 0.4rem;">
            {{ p.name }} - {{ p.totalHoursWorked || 0 }}/{{ p.plannedHours || 0 }}h
          </div>
          
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
                <!-- Percentage label positioned right next to the filled bar -->
                <div
                  :style="{ color: lightenColor(p.color || '#000', 40) }"
                  style="position: absolute; top: 130%; left: calc(100% + 0.3rem); transform: translateY(-50%); font-family: 'Irish Grover', cursive; font-size: 0.7rem; white-space: nowrap;"
                >
                  {{ (p.progressPercentage || 0).toFixed(1) }}%
                </div>
              </div>
            </div>
          </div>

        </div>
        <!-- Trash icon at right edge of the OldPaper -->
        <div :style="{ position: 'absolute', top: '55%', left: trashLeft, transform: 'translateY(-50%)', zIndex: 10 }">
          <Can class="trash-icon" :style="{ width: trashSize, height: 'auto', cursor: 'pointer', pointerEvents: 'auto' }" @click="handleDelete(p, $event)" />
        </div>
      </div>
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
import { Calendar, Coins, Award } from 'lucide-vue-next'
import WoodenTable from './Svg/WoodenTable.vue'
import OldPaper from './Svg/OldPaper.vue'
import Bar from './Svg/Bar.vue'
import ProgressBar from './Svg/ProgressBar.vue'
import Can from './Svg/Can.vue'
import SvgButton from './Svg/Button.vue'
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

// Trash icon sizing/positioning relative to OldPaper width
const trashSize = computed(() => {
  const n = parseFloat(eightyWidth.value || '0')
  return (n * 0.065) + 'px' // 8% of paper width
})
const trashLeft = computed(() => {
  const paperW = parseFloat(eightyWidth.value || '0')
  const iconW = parseFloat(trashSize.value || '0')
  const padding = paperW * 0.025 // 2% right padding
  const leftPx = Math.max(0, paperW - iconW - padding)
  return leftPx + 'px'
})

const emit = defineEmits(['delete-project', 'project-hover', 'project-click', 'create-project'])
function handleDelete(project, e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
  emit('delete-project', project)
}

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

// Returns a slightly lighter version of the given color.
// Supports 3/6-digit hex and rgb/rgba strings. Fallback: returns input color.
function lightenColor(color, amount = 40) {
  if (!color || typeof color !== 'string') return '#000';

  const clamp = (n) => Math.min(255, Math.max(0, n));

  // Handle hex colors
  if (color.startsWith('#')) {
    let hex = color.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(ch => ch + ch).join('');
    }
    if (hex.length !== 6) return color; // unsupported hex length

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const rr = clamp(r + amount).toString(16).padStart(2, '0');
    const gg = clamp(g + amount).toString(16).padStart(2, '0');
    const bb = clamp(b + amount).toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i);
  if (rgbMatch) {
    const r = clamp(parseInt(rgbMatch[1], 10) + amount);
    const g = clamp(parseInt(rgbMatch[2], 10) + amount);
    const b = clamp(parseInt(rgbMatch[3], 10) + amount);
    const a = rgbMatch[4];
    return a !== undefined ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  }

  // Named colors or unsupported formats: return as-is
  return color;
}
</script>

<style scoped>
.project-row {
  transition: transform 160ms ease;
  transform-origin: center center;
}
.project-row:hover {
  transform: scale(1.06);
}

.trash-icon {
  transition: transform 150ms ease;
  transform-origin: center center;
  /* Subtle shadow for visibility against light backgrounds */
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.75));
}
.trash-icon:hover {
  transform: scale(1.2);
  /* Slightly stronger shadow on hover */
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.80));
}
</style>
