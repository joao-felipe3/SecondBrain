<template>
  <div 
    class="project-row" 
    style="margin-bottom: 1.25rem; position: relative; cursor: pointer;"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
    @click="emit('click')"
  >
    <OldPaper :style="{ width: width, height: height }" />
    
    <div style="position: absolute; top: 0%; left: 5%; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: left; z-index: 3; pointer-events: none;">
      <div style="font-family: 'Irish Grover', cursive; font-size: 1.4rem; font-weight: bold; color: #000; text-align: left; margin-bottom: 0.25rem; margin-top: 0.4rem;">
        {{ project.name }} - {{ project.totalHoursWorked || 0 }}/{{ project.plannedHours || 0 }}h
      </div>
      
      <div style="margin-bottom: 0.25rem; display: flex; align-items: center; gap: 1.25rem; font-family: 'Irish Grover', cursive; font-size: 1rem; text-align: left;" :style="{ color: project.deadline ? getDeadlineColor(project.deadline) : '#000' }">
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <Calendar :size="16" />
          <span>Deadline: {{ project.deadline ? formatDeadline(project.deadline) : 'No deadline' }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <Coins :size="16" />
          <span>{{ project.reward || 0 }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <Award :size="16" />
          <span>{{ project.experience || 0 }} EXP</span>
        </div>
      </div>

      <!-- Progress Bar -->
      <div style="position: relative; z-index: 4; margin-left: 12%; margin-top: -0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <div :style="{ width: barWidth, height: '1rem', position: 'relative' }">
          <Bar style="width: 100%; height: 130%;" />
          <div style="position: absolute; top: -20%; left: 5%; z-index: 6; height: 0.6rem;" :style="{ width: `${(project.progressPercentage || 0)}%` }">
            <ProgressBar style="width: 100%; height: 100%;" :project-color="project.color" :project-id="project._id" />
            <div
              :style="{ color: lightenColor(project.color || '#000', 40) }"
              style="position: absolute; top: 130%; left: calc(100% + 0.3rem); transform: translateY(-50%); font-family: 'Irish Grover', cursive; font-size: 0.7rem; white-space: nowrap;"
            >
              {{ (project.progressPercentage || 0).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Trash icon -->
    <div :style="{ position: 'absolute', top: '55%', left: trashLeft, transform: 'translateY(-50%)', zIndex: 10 }">
      <Can class="trash-icon" :style="{ width: trashSize, height: 'auto', cursor: 'pointer', pointerEvents: 'auto' }" @click.stop="emit('delete')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Coins, Award } from 'lucide-vue-next'
import OldPaper from '../../../ui/svg/OldPaper.vue'
import Bar from '../../../ui/svg/Bar.vue'
import ProgressBar from '../../../ui/svg/ProgressBar.vue'
import Can from '../../../ui/svg/Can.vue'

const props = defineProps<{
  project: Record<string, any>
  width: string
  height: string
}>()

const emit = defineEmits<{
  (e: 'hover', isHovering: boolean): void
  (e: 'click'): void
  (e: 'delete'): void
}>()

// Bar width = 65% of paper width
const barWidth = computed(() => {
  const n = parseFloat(props.width || '0')
  return (n * 0.65) + 'px'
})

// Trash sizing and positioning
const trashSize = computed(() => {
  const n = parseFloat(props.width || '0')
  return (n * 0.065) + 'px'
})

const trashLeft = computed(() => {
  const paperW = parseFloat(props.width || '0')
  const iconW = parseFloat(trashSize.value || '0')
  const padding = paperW * 0.025
  const leftPx = Math.max(0, paperW - iconW - padding)
  return leftPx + 'px'
})

// Deadline formatting
function formatDeadline(date: any) {
  const now = new Date()
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diff = d.getTime() - now.getTime()
  if (diff === 0) return "Today"
  if (diff < 0) return "LATE!"
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }).toLowerCase()
}

function getDeadlineColor(date: any) {
  const now = new Date()
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return d.getTime() < now.getTime() ? "red" : "#000"
}

// Lighten color utility
function lightenColor(color: string, amount = 40) {
  if (!color || typeof color !== 'string') return '#000'

  const clamp = (n: number) => Math.min(255, Math.max(0, n))

  if (color.startsWith('#')) {
    let hex = color.replace('#', '')
    if (hex.length === 3) {
      hex = hex.split('').map(ch => ch + ch).join('')
    }
    if (hex.length !== 6) return color

    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)

    const rr = clamp(r + amount).toString(16).padStart(2, '0')
    const gg = clamp(g + amount).toString(16).padStart(2, '0')
    const bb = clamp(b + amount).toString(16).padStart(2, '0')
    return `#${rr}${gg}${bb}`
  }

  const rgbMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i)
  if (rgbMatch) {
    const r = clamp(parseInt(rgbMatch[1], 10) + amount)
    const g = clamp(parseInt(rgbMatch[2], 10) + amount)
    const b = clamp(parseInt(rgbMatch[3], 10) + amount)
    const a = rgbMatch[4]
    return a !== undefined ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`
  }

  return color
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
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.75));
}

.trash-icon:hover {
  transform: scale(1.2);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.80));
}
</style>
