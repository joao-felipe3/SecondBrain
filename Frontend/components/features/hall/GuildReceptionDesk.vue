<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="guild-reception-overlay"
      @click.self="close"
    >
      <div class="reception-modal-container animate-grimoire-open">
        <!-- Pergaminho Diegético do Grimório -->
        <UiParchmentCard variant="grimoire" class="grimoire-parchment">
          <!-- Botão Fechar em Selo de Cera -->
          <button class="close-seal-btn" @click="close" title="Fechar Grimório">
            <UiWaxSeal color="red" size="sm" icon="✕" interactive />
          </button>

          <!-- Cabeçalho do Grimório -->
          <div class="grimoire-header">
            <div class="grimoire-emblem">📖</div>
            <h2 class="grimoire-title">Grimório de Registro da Guilda</h2>
            <p class="grimoire-subtitle">
              Sintonizado com o Oráculo de Planejamento & Registro de Aventureiros
            </p>
          </div>

          <hr class="grimoire-divider" />

          <!-- Estatísticas Principais em Grade -->
          <div class="grimoire-stats-grid">
            <div class="stat-card">
              <div class="stat-icon">📜</div>
              <div class="stat-value">{{ completedTasksCount }}</div>
              <div class="stat-label">Contratos Cumpridos</div>
              <div class="stat-sub">{{ totalXp }} XP Acumulado</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">⚔️</div>
              <div class="stat-value">{{ activeTasksCount }}</div>
              <div class="stat-label">Missões em Andamento</div>
              <div class="stat-sub">{{ todoTasksCount }} no Mural de Espera</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">📚</div>
              <div class="stat-value">{{ totalProjectsCount }}</div>
              <div class="stat-label">Projetos Registrados</div>
              <div class="stat-sub">Biblioteca de Arquivos</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">🔥</div>
              <div class="stat-value">{{ streakDays }} dias</div>
              <div class="stat-label">Consistência do Aventureiro</div>
              <div class="stat-sub">Streak Ativo de Foco</div>
            </div>
          </div>

          <!-- Seção de Ações Rápidas -->
          <div class="grimoire-actions">
            <NuxtLink to="/task" class="grimoire-btn btn-primary" @click="close">
              <span>📜 Consultar Mural de Contratos</span>
            </NuxtLink>
            <NuxtLink to="/projects" class="grimoire-btn btn-secondary" @click="close">
              <span>📚 Explorar Arquivos de Projetos</span>
            </NuxtLink>
          </div>
        </UiParchmentCard>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiGuildStore } from '~/stores/uiGuild'
import { useTaskStore } from '~/stores/task'
import { useProjectStore } from '~/stores/project'
import UiParchmentCard from '~/components/ui/diegetic/UiParchmentCard.vue'
import UiWaxSeal from '~/components/ui/diegetic/UiWaxSeal.vue'

const uiGuildStore = useUiGuildStore()
const taskStore = useTaskStore()
const projectStore = useProjectStore()

const isOpen = computed(() => uiGuildStore.isReceptionOpen)

function close() {
  uiGuildStore.closeReceptionModal()
}

// Métricas Computadas
const completedTasksCount = computed(() => {
  return taskStore.tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
})

const activeTasksCount = computed(() => {
  return taskStore.tasks.filter((t) => t.status === 'doing' || t.status === 'in_progress').length
})

const todoTasksCount = computed(() => {
  return taskStore.tasks.filter((t) => t.status === 'todo' || t.status === 'pending').length
})

const totalProjectsCount = computed(() => {
  return projectStore.projects.length
})

const totalXp = computed(() => {
  return completedTasksCount.value * 100
})

const streakDays = computed(() => {
  return taskStore.habitsDashboard?.streaksOver7Days || (completedTasksCount.value > 0 ? 3 : 1)
})
</script>

<style scoped>
.guild-reception-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 10, 5, 0.82);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.reception-modal-container {
  width: 100%;
  max-width: 680px;
}

.grimoire-parchment {
  position: relative;
  border: 4px solid var(--guild-wood-mid) !important;
  border-radius: 12px !important;
  box-shadow:
    inset 0 0 30px rgba(110, 70, 30, 0.35),
    0 16px 48px rgba(0, 0, 0, 0.7) !important;
}

.close-seal-btn {
  position: absolute;
  top: -12px;
  right: -12px;
  background: none;
  border: none;
  cursor: pointer;
  z-index: 10;
}

.grimoire-header {
  text-align: center;
  margin-bottom: 1rem;
}

.grimoire-emblem {
  font-size: 2.5rem;
  margin-bottom: 0.25rem;
}

.grimoire-title {
  font-family: var(--font-guild-title);
  font-size: 1.75rem;
  color: var(--guild-wood-dark);
  margin: 0;
}

.grimoire-subtitle {
  font-size: 0.875rem;
  color: hsl(25, 30%, 35%);
  margin-top: 0.25rem;
  font-style: italic;
}

.grimoire-divider {
  border: none;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--guild-wood-light) 50%,
    transparent 100%
  );
  margin: 1.25rem 0;
}

.grimoire-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 600px) {
  .grimoire-stats-grid {
    grid-template-columns: 1fr;
  }
}

.stat-card {
  background: rgba(255, 255, 255, 0.45);
  border: 1.5px solid rgba(140, 95, 50, 0.3);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  box-shadow: inset 0 0 10px rgba(160, 110, 60, 0.15);
}

.stat-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-family: var(--font-guild-title);
  font-size: 1.75rem;
  font-weight: bold;
  color: var(--guild-wood-dark);
  line-height: 1.2;
}

.stat-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: hsl(25, 40%, 25%);
}

.stat-sub {
  font-size: 0.75rem;
  color: hsl(25, 25%, 45%);
  margin-top: 0.25rem;
}

.grimoire-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 600px) {
  .grimoire-actions {
    flex-direction: column;
  }
}

.grimoire-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.25rem;
  border-radius: 6px;
  text-decoration: none;
  font-family: var(--font-guild-title);
  font-weight: bold;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

.btn-primary {
  background: linear-gradient(135deg, var(--guild-wood-mid) 0%, var(--guild-wood-dark) 100%);
  color: var(--guild-parchment-base);
  border: 1.5px solid var(--guild-gold-glow);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(220, 160, 40, 0.4);
  color: #fff;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.6);
  color: var(--guild-wood-dark);
  border: 1.5px solid var(--guild-wood-mid);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.85);
  transform: translateY(-2px);
}

/* Animação de Entrada do Grimório */
@keyframes grimoire-open {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-grimoire-open {
  animation: grimoire-open 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
