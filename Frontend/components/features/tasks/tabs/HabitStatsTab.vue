<template>
  <div class="habit-stats-tab">
    <h3 class="tab-title">📊 Estatísticas</h3>
    
    <div class="stats-grid">
      <!-- Sequência Atual -->
      <div class="stat-card flame-card">
        <div class="stat-header">
          <span class="stat-icon">🔥</span>
          <span class="stat-card-title">Sequência Atual</span>
        </div>
        <div class="stat-metric-row">
          <div class="stat-value-large">{{ currentStreak }}</div>
          <div class="stat-subtitle">dias consecutivos</div>
        </div>
      </div>

      <!-- Melhor Sequência -->
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">⭐</span>
          <span class="stat-card-title">Melhor Sequência</span>
        </div>
        <div class="stat-metric-row">
          <div class="stat-value-large">{{ longestStreak }}</div>
          <div class="stat-subtitle">dias consecutivos</div>
        </div>
      </div>

      <!-- Taxa de Aderência -->
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">📈</span>
          <span class="stat-card-title">Taxa de Aderência</span>
        </div>
        <div class="stat-metric-row stat-metric-row--stacked">
          <div class="stat-value-large">{{ adherenceRate }}%</div>
          <div class="stat-subtitle">taxa média</div>
        </div>
        <div class="adherence-bar">
          <div class="adherence-fill" :style="{ width: adherenceRate + '%' }"></div>
        </div>
      </div>

      <!-- Total de Completions -->
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">✓</span>
          <span class="stat-card-title">Completions</span>
        </div>
        <div class="stat-metric-row">
          <div class="stat-value-large">{{ totalCompletions }}</div>
          <div class="stat-subtitle">vezes completado</div>
        </div>
      </div>

      <!-- Total de Skips -->
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">⊘</span>
          <span class="stat-card-title">Skips</span>
        </div>
        <div class="stat-metric-row">
          <div class="stat-value-large">{{ totalSkips }}</div>
          <div class="stat-subtitle">vezes pulado</div>
        </div>
      </div>

      <!-- Dias Totais -->
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-icon">📅</span>
          <span class="stat-card-title">Dias Ativos</span>
        </div>
        <div class="stat-metric-row">
          <div class="stat-value-large">{{ activeDays }}</div>
          <div class="stat-subtitle">dias com atividade</div>
        </div>
      </div>
    </div>

    <!-- Gráfico de Tendência -->
    <div class="trend-section">
      <h4 class="section-title">Tendência (Últimos 30 dias)</h4>
      <div class="trend-chart">
        <div 
          v-for="(week, idx) in trendWeeks"
          :key="idx"
          class="trend-bar-group"
        >
          <div class="trend-bar" :style="{ height: (week.completion * 100) + '%' }"></div>
          <span class="trend-label">Sem {{ idx + 1 }}</span>
        </div>
      </div>
    </div>

    <!-- Resumo -->
    <div class="summary-section">
      <h4 class="section-title">Resumo</h4>
      <div class="summary-text">
        <p>
          Você está mantendo uma sequência de <strong>{{ currentStreak }} dias</strong> 
          neste hábito! Continue assim para bater o recorde de <strong>{{ longestStreak }} dias</strong>.
        </p>
        <p>
          Sua taxa de aderência é de <strong>{{ adherenceRate }}%</strong>, 
          o que significa que você está cumprindo <strong>{{ Math.round(adherenceRate * dailyTarget / 100) }}/{{ dailyTarget }}</strong> dias por semana.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  task?: any
}

const props = defineProps<Props>()

const currentStreak = computed(() => props.task?.currentStreak || 0)
const longestStreak = computed(() => props.task?.longestStreak || 0)
const totalCompletions = computed(() => props.task?.completedCount || 0)
const totalSkips = computed(() => props.task?.skippedCount || 0)
const activeDays = computed(() => (props.task?.completedCount || 0) + (props.task?.skippedCount || 0))
const dailyTarget = computed(() => props.task?.dailyTarget || 5)

const adherenceRate = computed(() => {
  if (!props.task || !props.task.totalDaysTracked) return 0
  const rate = ((totalCompletions.value / props.task.totalDaysTracked) * 100)
  return Math.min(100, Math.round(rate))
})

// Mock data for trend
const trendWeeks = computed(() => [
  { completion: 0.6 },
  { completion: 0.75 },
  { completion: 0.5 },
  { completion: 0.85 },
  { completion: 0.9 },
])
</script>

<style scoped>
.habit-stats-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  overflow-y: auto;
  overflow-x: hidden;
}

.tab-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #2c1810;
  margin: 0;
  font-family: 'Irish Grover', cursive;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}

.stat-card {
  background: linear-gradient(135deg, #fdfaf3 0%, #f5ede2 100%);
  border: 2px solid #d4a574;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-card.flame-card {
  border-color: #ff7043;
  background: linear-gradient(135deg, #ffe0b2 0%, #ffccbc 100%);
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.stat-icon {
  font-size: 1.2rem;
}

.stat-card-title {
  font-family: 'Irish Grover', cursive;
  font-size: 0.85rem;
  font-weight: 600;
  color: #3d2817;
}

.stat-value-large {
  font-size: 1.6rem;
  font-weight: 700;
  color: #b8934a;
  font-family: 'Irish Grover', cursive;
  line-height: 1;
}

.stat-metric-row {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.stat-metric-row--stacked {
  align-items: center;
}

.stat-subtitle {
  font-size: 0.75rem;
  color: #7d6b5a;
  font-family: 'Irish Grover', cursive;
  line-height: 1.1;
}

.adherence-bar {
  width: 100%;
  height: 8px;
  background-color: #e0d0c0;
  border-radius: 4px;
  overflow: hidden;
}

.adherence-fill {
  height: 100%;
  background: linear-gradient(90deg, #81c784, #66bb6a);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.trend-section {
  background-color: #fdfaf3;
  border: 2px solid #d4a574;
  border-radius: 8px;
  padding: 0.9rem;
}

.section-title {
  font-family: 'Irish Grover', cursive;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c1810;
  margin: 0 0 0.75rem 0;
}

.trend-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 0.6rem;
  height: 90px;
}

.trend-bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 36px;
}

.trend-bar {
  width: 100%;
  background: linear-gradient(180deg, #b8934a, #d4a574);
  border-radius: 4px 4px 0 0;
  min-height: 16px;
  transition: all 0.3s ease;
}

.trend-bar:hover {
  background: linear-gradient(180deg, #9d7839, #b8934a);
}

.trend-label {
  font-size: 0.75rem;
  color: #7d6b5a;
  font-family: 'Irish Grover', cursive;
  font-weight: 500;
}

.summary-section {
  background-color: #fdfaf3;
  border: 2px solid #d4a574;
  border-radius: 8px;
  padding: 0.9rem;
}

.summary-text {
  font-family: 'Irish Grover', cursive;
  font-size: 0.9rem;
  color: #3d2817;
  line-height: 1.5;
  margin: 0;
}

.summary-text p {
  margin: 0.5rem 0;
}

/* Custom scrollbar to match EditarTab */
.habit-stats-tab::-webkit-scrollbar {
  width: 6px;
}

.habit-stats-tab::-webkit-scrollbar-track {
  background: transparent;
}

.habit-stats-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.habit-stats-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}

.summary-text strong {
  color: #b8934a;
  font-weight: 700;
}
</style>
