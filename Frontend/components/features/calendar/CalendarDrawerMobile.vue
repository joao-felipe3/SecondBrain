<template>
  <transition name="drawer-slide">
    <div v-if="isOpen" class="calendar-drawer-backdrop" @click.self="$emit('close')">
      <div class="calendar-drawer-mobile diegetic-parchment">
        <!-- Handle de arrastar / fechar -->
        <div class="drawer-handle-bar" @click="$emit('close')">
          <div class="drawer-handle"></div>
        </div>

        <!-- Cabeçalho do Drawer -->
        <div class="drawer-header">
          <div class="drawer-title-group">
            <span class="drawer-icon">📜</span>
            <h3 class="drawer-title">Missões do Dia</h3>
          </div>
          <span class="drawer-date">{{ formattedDate }}</span>
          <button class="drawer-close-btn" @click="$emit('close')" aria-label="Fechar">✕</button>
        </div>

        <!-- Lista de Tarefas -->
        <div class="drawer-body">
          <div v-if="tasks.length === 0" class="empty-tasks-message">
            <p>Nenhuma missão registrada para este dia.</p>
          </div>

          <div v-else class="drawer-tasks-list">
            <div
              v-for="task in tasks"
              :key="task._id || task.id"
              class="drawer-task-item"
              @click="$emit('select-task', task)"
            >
              <UiWaxSeal
                :color="getSealColor(task)"
                size="sm"
                :label="task.priority?.[0]?.toUpperCase() || 'M'"
              />
              <div class="task-info">
                <span class="task-name">{{ task.name }}</span>
                <span v-if="task.description" class="task-desc">{{ task.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiWaxSeal from '../../ui/diegetic/UiWaxSeal.vue';

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    date: Date | string;
    tasks: any[];
  }>(),
  {
    isOpen: false,
    tasks: () => [],
  },
);

defineEmits<{
  (e: 'close'): void;
  (e: 'select-task', task: any): void;
}>();

const formattedDate = computed(() => {
  const d = new Date(props.date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
});

function getSealColor(task: any): 'red' | 'blue' | 'green' | 'amber' {
  if (task.status === 'done' || task.isConcluded) return 'green';
  if (task.status === 'doing') return 'blue';
  if (task.priority === 'urgent' || task.priority === 'high') return 'red';
  return 'amber';
}
</script>

<style scoped>
.calendar-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.calendar-drawer-mobile {
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  border-radius: 16px 16px 0 0;
  padding: 0.75rem 1.25rem 1.5rem 1.25rem;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

.drawer-handle-bar {
  display: flex;
  justify-content: center;
  padding: 0.35rem 0 0.75rem 0;
  cursor: pointer;
}

.drawer-handle {
  width: 40px;
  height: 4px;
  background: hsl(30, 30%, 40%);
  border-radius: 2px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(130, 85, 45, 0.3);
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
}

.drawer-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.drawer-title {
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 1.1rem;
  color: var(--guild-parchment-ink, #2c1810);
  margin: 0;
}

.drawer-date {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(25, 45%, 35%);
  text-transform: capitalize;
}

.drawer-close-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  color: hsl(25, 40%, 30%);
  cursor: pointer;
  padding: 0.25rem;
}

.drawer-body {
  overflow-y: auto;
  flex: 1 1 auto;
}

.empty-tasks-message {
  text-align: center;
  padding: 2rem 1rem;
  color: hsl(25, 30%, 40%);
  font-style: italic;
}

.drawer-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.drawer-task-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(130, 85, 45, 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drawer-task-item:hover {
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(3px);
}

.task-info {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.task-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: #2c1810;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-desc {
  font-size: 0.75rem;
  color: hsl(25, 30%, 35%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Transições */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
}

.drawer-slide-enter-from .calendar-drawer-mobile,
.drawer-slide-leave-to .calendar-drawer-mobile {
  transform: translateY(100%);
}
</style>
