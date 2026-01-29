<template>
  <div class="task-details-wrapper">

    <!-- Conteúdo sobre o papel -->
    <div class="task-details-content">
      <!-- Cabeçalho Principal -->
      <div class="paper-header">
        <div class="task-status-seal" :class="{ completed: task.isConcluded }">
          {{ task.isConcluded ? '✓' : '◇' }}
        </div>
        <h3 class="task-title-medieval">{{ task.name }}</h3>
      </div>

      <!-- Descrição -->
      <p v-if="task.description" class="task-scroll-text">{{ task.description }}</p>

      <!-- Deadline como selo -->
      <div v-if="task.deadline" class="deadline-wax-seal">
        <span class="seal-icon">📜</span>
        <span class="seal-date">{{ formatYMD(task.deadline) }}</span>
      </div>

      <!-- Divisor decorativo -->
      <div class="ornamental-divider">
        <span>⚜</span>
      </div>

      <!-- Grid de atributos estilo pergaminho -->
      <div class="attributes-parchment">
        <div class="attribute-row pomodoros">
          <div class="attr-icon">🍅</div>
          <div class="attr-info">
            <span class="attr-label">Pomodoros</span>
            <span class="attr-value">{{ task.pomodorosDid || 0 }} / {{ task.pomodorosPlanned || 0 }}</span>
          </div>
        </div>

        <div v-if="task.priority !== undefined" class="attribute-row priority">
          <div class="attr-icon">⚔️</div>
          <div class="attr-info">
            <span class="attr-label">Prioridade</span>
            <span class="attr-value">{{ task.priority }}</span>
          </div>
        </div>

        <div v-if="task.difficult !== undefined" class="attribute-row difficulty">
          <div class="attr-icon">🛡️</div>
          <div class="attr-info">
            <span class="attr-label">Dificuldade</span>
            <span class="attr-value">{{ task.difficult }}</span>
          </div>
        </div>

        <div v-if="task.experience !== undefined" class="attribute-row exp">
          <div class="attr-icon">⭐</div>
          <div class="attr-info">
            <span class="attr-label">EXP</span>
            <span class="attr-value">+{{ task.experience }}</span>
          </div>
        </div>

        <div v-if="task.prize !== undefined" class="attribute-row reward">
          <div class="attr-icon">💰</div>
          <div class="attr-info">
            <span class="attr-label">Recompensa</span>
            <span class="attr-value">{{ task.prize }} moedas</span>
          </div>
        </div>
      </div>

      <!-- Status Footer -->
      <div class="status-banner" :class="{ completed: task.isConcluded }">
        <span class="status-text">
          {{ task.isConcluded ? '⚔️ Missão Concluída ⚔️' : '📋 Missão em Andamento' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/utils/useDateFormat'

interface Task {
  _id?: string
  name: string
  description?: string
  deadline?: string
  pomodorosPlanned?: number
  pomodorosDid?: number
  priority?: number
  difficult?: number
  experience?: number
  prize?: number
  isConcluded: boolean
}

defineProps<{
  task: Task
}>()

const { formatYMD } = useDateFormat()
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

.task-details-wrapper {
  position: relative;
  width: 500px;
  height: 620px;
  display: inline-block;
}

.task-details-content {
  position: absolute;
  top: 1rem;
  right: 4rem;
  width: 100%;
  height: 100%;
  z-index: 4;
  padding: 0 4.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'MedievalSharp', 'Irish Grover', cursive;
  color: #3e2723;
}

/* Scrollbar personalizada */
.task-details-content::-webkit-scrollbar {
  width: 8px;
}

.task-details-content::-webkit-scrollbar-track {
  background: rgba(201, 166, 107, 0.2);
  border-radius: 4px;
}

.task-details-content::-webkit-scrollbar-thumb {
  background: rgba(139, 90, 43, 0.5);
  border-radius: 4px;
}

.task-details-content::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 90, 43, 0.7);
}

/* Header */
.paper-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px dashed #c9a66b;
}

.task-status-seal {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(145deg, #8b4513, #654321);
  border: 3px solid #5d3a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: #f5e6d3;
  box-shadow: 
    inset 0 2px 4px rgba(255, 255, 255, 0.2),
    0 2px 8px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

.task-status-seal.completed {
  background: linear-gradient(145deg, #2d5016, #1e3a0f);
  border-color: #1a2e0a;
}

.task-title-medieval {
  font-family: 'Irish Grover', cursive;
  font-size: 1.4rem;
  font-weight: 400;
  color: #3e2723;
  margin: 0;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  line-height: 1.3;
}

/* Descrição */
.task-scroll-text {
  font-size: 0.95rem;
  color: #5d4037;
  line-height: 1.6;
  margin: 0;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.3);
  border-left: 3px solid #c9a66b;
  border-radius: 0 4px 4px 0;
  font-style: italic;
}

/* Deadline Seal */
.deadline-wax-seal {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #8b4513, #654321);
  color: #f5e6d3;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 
    0 3px 10px rgba(0, 0, 0, 0.3),
    inset 0 1px 2px rgba(255, 255, 255, 0.1);
  align-self: center;
}

.seal-icon {
  font-size: 1.1rem;
}

.seal-date {
  font-family: 'MedievalSharp', cursive;
}

/* Divider */
.ornamental-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #c9a66b;
  font-size: 1.25rem;
  margin: 0 0;
}

.ornamental-divider::before,
.ornamental-divider::after {
  content: '';
  flex: 1;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #c9a66b 50%,
    transparent 100%
  );
}

/* Attributes Grid */
.attributes-parchment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.attribute-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid #d4b896;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.attribute-row:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: translateX(4px);
}

.attribute-row.pomodoros {
  border-left: 4px solid #c62828;
}

.attribute-row.priority {
  border-left: 4px solid #f57c00;
}

.attribute-row.difficulty {
  border-left: 4px solid #7b1fa2;
}

.attribute-row.exp {
  border-left: 4px solid #ffc107;
}

.attribute-row.reward {
  border-left: 4px solid #4caf50;
}

.attr-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.attr-info {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.attr-label {
  font-size: 0.65rem;
  color: #8d6e63;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: sans-serif;
}

.attr-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #3e2723;
  font-family: 'Irish Grover', cursive;
}

/* Status Banner */
.status-banner {
  margin-top: 0.5rem;
  padding: 0.75rem;
  text-align: center;
  background: linear-gradient(135deg, #6d4c41, #5d4037);
  border-radius: 4px;
  border: 2px solid #4e342e;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.status-banner.completed {
  background: linear-gradient(135deg, #33691e, #2e7d32);
  border-color: #1b5e20;
}

.status-text {
  font-family: 'Irish Grover', cursive;
  font-size: 1rem;
  color: #f5e6d3;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.05em;
}
</style>
