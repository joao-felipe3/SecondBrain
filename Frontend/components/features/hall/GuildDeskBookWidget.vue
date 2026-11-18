<template>
  <!-- versão mobile/retrato (lá não há a folha pintada no balcão: o fundo é outra imagem) -->
  <div class="guild-desk-book-widget">
    <div class="book-page-content">
      <div class="book-widget-header">
        <span class="header-title">📜 MISSÕES DO DIA</span>
      </div>

      <div v-if="missions.length > 0" class="book-tasks-list">
        <div
          v-for="task in missions"
          :key="missionId(task)"
          class="book-task-item"
          :class="{ 'is-completed': isDone(task) }"
          @click.stop="toggleMission(task)"
        >
          <div class="custom-handwritten-checkbox">
            <span v-if="isDone(task)">✓</span>
          </div>
          <span class="task-handwritten-text">{{ missionTitle(task) }}</span>
        </div>
      </div>

      <div v-else class="book-empty-state">
        <span>Sem missões pendentes! 🏆</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDailyMissions } from '~/composables/features/useDailyMissions';

const { missions, isDone, missionId, missionTitle, toggleMission } = useDailyMissions();
</script>

<style scoped>
.guild-desk-book-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.1rem;
  pointer-events: auto;
  transform: rotate(-10deg) skewY(2deg);
  transform-origin: center center;
}

.book-page-content {
  background: rgba(255, 248, 230, 0.92);
  border: 1px solid rgba(110, 70, 30, 0.4);
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.book-widget-header {
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px dashed rgba(80, 50, 20, 0.5);
  padding-bottom: 0.15rem;
  margin-bottom: 0.25rem;
}

.header-title {
  font-family: var(--font-guild-title);
  font-size: 0.7rem;
  font-weight: 800;
  color: #261405;
  letter-spacing: 0.5px;
}

.book-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.book-task-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  border-radius: 3px;
  transition: background 0.15s ease;
}

.book-task-item:hover {
  background: rgba(140, 95, 50, 0.2);
}

.custom-handwritten-checkbox {
  width: 11px;
  height: 11px;
  border: 1.5px solid #261405;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  color: #261405;
  flex-shrink: 0;
  background: #ffffff;
}

.task-handwritten-text {
  font-family: var(--font-guild-script);
  font-size: 0.7rem;
  font-weight: 700;
  color: #261405;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.1;
}

.book-task-item.is-completed .task-handwritten-text {
  text-decoration: line-through;
  opacity: 0.55;
}

.book-empty-state {
  font-size: 0.65rem;
  color: #4a2e16;
  text-align: center;
  font-style: italic;
  padding: 0.2rem 0;
}
</style>
