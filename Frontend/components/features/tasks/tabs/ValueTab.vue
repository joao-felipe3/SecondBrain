<template>
  <div class="value-tab">
    <div class="value-section">
      <div class="value-header">
        <h1>Valor</h1>
        <span class="value-badge">Impacto</span>
      </div>

      <div class="value-grid">
        <div class="value-card">
          <div class="value-card-label">EVM Progresso</div>
          <div class="value-card-value">{{ displayEvmProgress }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">SPI</div>
          <div class="value-card-value">{{ formatNumber(task?.evmSchedulePerformanceIndex) }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">Ranking de Impacto</div>
          <div class="value-card-value">Top {{ topPercent }}%</div>
          <div class="value-card-meta">{{ rankLabel }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">Score de Impacto</div>
          <div class="value-card-value" :title="impactScoreTooltip">{{ impactScore }}/100</div>
        </div>
      </div>

      <div style="padding: 12px 14px">
        <ValueContributionIndicator :xp="task?.experience ?? 0" :totalXp="totalXpForDisplay" />
      </div>

      <div style="padding: 0 14px 8px; font-size: 11px; color: #a6794a">
        {{ task?.parentId ? 'Contribuição ao projeto pai' : 'Contribuição ao projeto' }}
      </div>

      <div class="value-block value-chart-block mt-n1">
        <div class="value-label">Impacto x Esforço</div>

        <div class="bar-pair">
          <div class="bar-row">
            <span class="bar-label">Impacto</span>
            <div class="bar-track">
              <div class="bar-fill bar-impact" :style="{ width: impactPercent + '%' }"></div>
            </div>
            <span class="bar-value">{{ impactPercent }}%</span>
          </div>

          <div class="bar-row">
            <span class="bar-label">Esforço</span>
            <div class="bar-track">
              <div class="bar-fill bar-effort" :style="{ width: effortPercent + '%' }"></div>
            </div>
            <span class="bar-value">{{ effortPercent }}%</span>
          </div>
        </div>

        <div class="sparkline-wrap" :title="sparklineTooltip">
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" class="sparkline-svg" aria-label="Tendência de impacto">
            <polyline :points="sparklinePoints" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div class="sparkline-caption">Tendência de valor (checklist -> progresso -> contribuição -> score)</div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ValueContributionIndicator from '../ui/ValueContributionIndicator.vue'

interface Props {
  task?: any
  tasks?: any[]
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  tasks: () => [],
  projects: () => [],
})

const normalizeId = (value: any) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return String(value._id || value.id || '')
  return String(value)
}

const formatNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '—'
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const asFinite = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizedEvmProgress = computed(() => {
  const raw = asFinite(props.task?.evmProgress)
  // Em alguns payloads EVM vem como 0-1; em outros como 0-100.
  const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw
  return clampPercent(normalized)
})

const displayEvmProgress = computed(() => `${normalizedEvmProgress.value}%`)

const parentTotalXp = computed(() => {
  try {
    if (!props.task?.parentId || !props.tasks?.length) return 0

    const parentId = normalizeId(props.task.parentId)
    return props.tasks
      .filter((t: any) => normalizeId(t.parentId) === parentId)
      .reduce((sum: number, t: any) => sum + (Number(t?.experience) || 0), 0)
  } catch (e) {
    console.warn('[ValueTab] Error calculating parentTotalXp:', e)
    return 0
  }
})

const projectTotalXp = computed(() => {
  try {
    if (!props.task?.project || !props.tasks?.length) return 0

    const projectId = normalizeId(props.task.project)
    return props.tasks
      .filter((t: any) => normalizeId(t.project) === projectId && !t.parentId)
      .reduce((sum: number, t: any) => sum + (Number(t?.experience) || 0), 0)
  } catch (e) {
    console.warn('[ValueTab] Error calculating projectTotalXp:', e)
    return 0
  }
})

const totalXpForDisplay = computed(() => {
  if (props.task?.parentId) return parentTotalXp.value
  return projectTotalXp.value
})

const impactPercent = computed(() => {
  const xp = asFinite(props.task?.experience)
  const total = asFinite(totalXpForDisplay.value)
  if (total <= 0) return 0
  return clampPercent((xp / total) * 100)
})

const checklistCompletionPercent = computed(() => {
  const list = Array.isArray(props.task?.checklist) ? props.task.checklist : []
  if (!list.length) return 0

  const completed = list.filter((item: any) => {
    if (typeof item === 'string') return false
    return !!item?.completed
  }).length

  return clampPercent((completed / list.length) * 100)
})

const normalizedSpiPercent = computed(() => {
  const spi = asFinite(props.task?.evmSchedulePerformanceIndex)
  // SPI=1.0 representa baseline (100%).
  return clampPercent(spi * 100)
})

const effortPercent = computed(() => {
  const te = asFinite(props.task?.pertExpectedMinutes)
  // 180min = teto de micro-tarefa (3h). Acima disso fica saturado em 100%.
  if (te <= 0) return 0
  return clampPercent((te / 180) * 100)
})

const impactScoreBreakdown = computed(() => {
  const contribution = impactPercent.value
  const progress = normalizedEvmProgress.value
  const spi = normalizedSpiPercent.value
  const checklist = checklistCompletionPercent.value

  const score = clampPercent(
    contribution * 0.4 +
    progress * 0.25 +
    spi * 0.2 +
    checklist * 0.15,
  )

  return {
    score,
    contribution,
    progress,
    spi,
    checklist,
  }
})

const impactScore = computed(() => impactScoreBreakdown.value.score)

const impactScoreTooltip = computed(() => {
  const b = impactScoreBreakdown.value
  return [
    `Score final: ${b.score}/100`,
    `Contribuição (${b.contribution}%) x 40%`,
    `Progresso EVM (${b.progress}%) x 25%`,
    `SPI (${b.spi}%) x 20%`,
    `Checklist (${b.checklist}%) x 15%`,
  ].join(' | ')
})

const scopeTasks = computed(() => {
  if (!props.tasks?.length || !props.task) return []

  if (props.task.parentId) {
    const parentId = normalizeId(props.task.parentId)
    return props.tasks.filter((t: any) => normalizeId(t.parentId) === parentId)
  }

  const projectId = normalizeId(props.task.project)
  return props.tasks.filter((t: any) => normalizeId(t.project) === projectId && !t.parentId)
})

const impactRank = computed(() => {
  if (!scopeTasks.value.length || !props.task) return 1

  const currentId = normalizeId(props.task._id || props.task.id)
  const sorted = [...scopeTasks.value].sort((a: any, b: any) => asFinite(b?.experience) - asFinite(a?.experience))
  const idx = sorted.findIndex((t: any) => normalizeId(t._id || t.id) === currentId)
  return idx >= 0 ? idx + 1 : 1
})

const rankLabel = computed(() => {
  const total = Math.max(scopeTasks.value.length, 1)
  return `#${impactRank.value} de ${total}`
})

const topPercent = computed(() => {
  const total = Math.max(scopeTasks.value.length, 1)
  return clampPercent((impactRank.value / total) * 100)
})

const sparklineSeries = computed(() => {
  return [
    checklistCompletionPercent.value,
    normalizedEvmProgress.value,
    impactPercent.value,
    impactScore.value,
  ]
})

const sparklinePoints = computed(() => {
  const values = sparklineSeries.value
  const last = Math.max(values.length - 1, 1)

  return values
    .map((v, i) => {
      const x = (i / last) * 100
      const y = 22 - (clampPercent(v) / 100) * 20
      return `${x},${y}`
    })
    .join(' ')
})

const sparklineTooltip = computed(() => {
  const [checklist, evm, contribution, score] = sparklineSeries.value
  return [
    `Checklist: ${checklist}%`,
    `EVM: ${evm}%`,
    `Contribuição: ${contribution}%`,
    `Score: ${score}%`,
  ].join(' | ')
})
</script>

<style scoped>
.value-tab {
  width: 100%;
  height: 100%;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.5rem 1.25rem;
}

.value-section {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  flex-direction: column;
}

.value-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.value-header h1 {
  font-size: 22px;
  margin: 0;
  line-height: 1;
}

.value-badge {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 6px;
  background: #a6794a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.value-grid {
  padding: 12px 14px 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.value-card,
.value-block {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.76);
  padding: 8px 10px;
}

.value-card-label,
.value-label {
  font-size: 12px;
  color: #a6794a;
  margin-bottom: 4px;
}

.value-card-value {
  font-size: 18px;
  line-height: 1.2;
}

.value-card-meta {
  margin-top: 4px;
  font-size: 11px;
  color: #7b5b3d;
}

.value-block {
  margin: 12px 14px 0;
}

.value-note p,
.value-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
}

.value-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.value-summary {
  color: #5f4631;
}

.value-tab::-webkit-scrollbar {
  width: 6px;
}

.value-tab::-webkit-scrollbar-track {
  background: transparent;
}

.value-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.value-chart-block {
  margin-bottom: 12px;
}

.bar-pair {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-row {
  display: grid;
  grid-template-columns: 56px 1fr 44px;
  align-items: center;
  gap: 8px;
}

.bar-label,
.bar-value {
  font-size: 12px;
  color: #5f4631;
}

.bar-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 420ms cubic-bezier(0.4, 0, 0.2, 1);
}

.bar-impact {
  background: linear-gradient(90deg, #f6b26b, #d18b3a);
}

.bar-effort {
  background: linear-gradient(90deg, #8fb6d9, #4f81bd);
}

.sparkline-wrap {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.65);
  color: #3e2723;
}

.sparkline-svg {
  width: 100%;
  height: 28px;
}

.sparkline-caption {
  margin-top: 4px;
  font-size: 11px;
  color: #7b5b3d;
}
</style>
