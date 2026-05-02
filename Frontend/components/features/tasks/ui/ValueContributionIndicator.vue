<template>
  <div class="vci-container">
    <!-- Main text line: "🎯 Contribui com 12% do objetivo" -->
    <div class="vci-header">
      <span class="vci-text">🎯 Contribui com <strong>{{ displayPercent }}</strong> do objetivo</span>
    </div>

    <!-- Progress bar -->
    <div 
      class="vci-bar" 
      role="progressbar" 
      :aria-valuenow="percentRounded" 
      aria-valuemin="0" 
      aria-valuemax="100"
      :title="tooltipBreakdown"
    >
      <div class="vci-bar-fill" :style="{ width: percentRounded + '%' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ xp: number; totalXp: number }>()

const percent = computed(() => {
  const xp = Number(props.xp || 0)
  const total = Number(props.totalXp || 0)
  if (!total || total <= 0) return null
  return Math.min(100, Math.max(0, (xp / total) * 100))
})

const percentRounded = computed(() => {
  if (percent.value === null) return 0
  return Math.round(percent.value)
})

const displayPercent = computed(() => percent.value === null ? '—' : percentRounded.value + '%')

const tooltipBreakdown = computed(() => {
  if (percent.value === null) return 'Total desconhecido'
  return `XP desta tarefa: ${props.xp} | XP total: ${props.totalXp} | Porcentagem: ${percentRounded.value}%`
})
</script>

<style scoped>
.vci-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'Inter', system-ui, sans-serif;
}

.vci-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vci-text {
  font-size: 14px;
  color: #3e2723;
  line-height: 1.4;
}

.vci-text strong {
  font-weight: 700;
  color: #d18b3a;
}

.vci-bar {
  width: 100%;
  height: 12px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  overflow: hidden;
  cursor: help;
}

.vci-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #f6b26b, #d18b3a);
  transition: width 420ms cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
