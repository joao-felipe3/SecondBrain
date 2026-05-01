<template>
  <div class="value-tab">
    <div class="value-section">
      <div class="value-header">
        <h1>Valor</h1>
        <span class="value-badge">Impacto</span>
      </div>

      <div class="value-grid">
        <div class="value-card">
          <div class="value-card-label">Experiência</div>
          <div class="value-card-value">{{ task?.experience ?? 0 }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">Prêmio</div>
          <div class="value-card-value">{{ task?.prize ?? 0 }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">EVM Progresso</div>
          <div class="value-card-value">{{ formatNumber(task?.evmProgress) }}</div>
        </div>

        <div class="value-card">
          <div class="value-card-label">SPI</div>
          <div class="value-card-value">{{ formatNumber(task?.evmSchedulePerformanceIndex) }}</div>
        </div>
      </div>

      <div class="value-block">
        <div class="value-label">PERT / prazo</div>
        <div class="value-note">
          <p>TE: {{ formatMinutes(task?.pertExpectedMinutes) }}</p>
          <p>Variância: {{ formatNumber(task?.pertVariance) }}</p>
          <p>Deadline: {{ formatDate(task?.deadline) }}</p>
        </div>
      </div>

      <div class="value-block">
        <div class="value-label">Resumo</div>
        <p class="value-summary">
          Esta tarefa já possui os campos principais de valor operacional que podem ser usados para evoluir o indicador de contribuição do Sprint 4.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  task?: any
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})

const formatNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '—'
}

const formatMinutes = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${Math.round(numeric)} min` : '—'
}

const formatDate = (value: unknown) => {
  if (!value) return '—'
  const date = new Date(value as any)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}
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
  padding: 0;
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
</style>
