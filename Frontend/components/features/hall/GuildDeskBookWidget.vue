<template>
  <div class="guild-desk-book-widget">
    <div class="book-page-content">
      <div class="book-widget-header">
        <span class="header-title">📜 MISSÕES DO DIA</span>
      </div>

      <!-- Lista de 3 Micro-tarefas Prioritárias -->
      <div v-if="urgentTasks.length > 0" class="book-tasks-list">
        <div
          v-for="task in urgentTasks"
          :key="task._id || task.id"
          class="book-task-item"
          :class="{ 'is-completed': task.status === 'done' || task.status === 'completed' }"
          @click.stop="toggleTask(task)"
        >
          <div class="custom-handwritten-checkbox">
            <span v-if="task.status === 'done' || task.status === 'completed'">✓</span>
          </div>
          <span class="task-handwritten-text">{{ task.name || task.title }}</span>
        </div>
      </div>

      <div v-else class="book-empty-state">
        <span>Sem missões pendentes! 🏆</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTaskStore } from '~/stores/task'
import { useGuildAudio } from '~/composables/ui/useGuildAudio'
import type { Task } from '~/models/Task'

const taskStore = useTaskStore()
const { playPaperFlipSound } = useGuildAudio()

// Filtra as 3 tarefas pendentes mais urgentes
const urgentTasks = computed(() => {
  const pending = taskStore.tasks.filter(
    (t) => t.status === 'todo' || t.status === 'doing' || t.status === 'pending'
  )
  return pending.slice(0, 3)
})

async function toggleTask(task: Task) {
  playPaperFlipSound()
  const newStatus =
    task.status === 'done' || task.status === 'completed' ? 'todo' : 'done'

  const taskId = (task as any)._id || task.id
  if (taskId) {
    await taskStore.setTaskStatus?.(taskId, newStatus)
  }
}
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
