<template>
  <div
    class="ui-grimoire-book"
    :class="{
      'is-interactive': interactive,
      'is-locked': isLocked,
    }"
    :style="bookStyle"
    @click="handleClick"
  >
    <!-- Lombada / Spine com vincos dourados -->
    <div class="book-spine">
      <div class="spine-rib rib-top"></div>
      <div class="spine-rib rib-mid"></div>
      <div class="spine-rib rib-bottom"></div>
    </div>

    <!-- Capa do Livro -->
    <div class="book-cover">
      <!-- Cantoneiras Metálicas -->
      <div class="corner-metal corner-tr"></div>
      <div class="corner-metal corner-br"></div>

      <!-- Fita Marcadora de Página -->
      <div class="bookmark-ribbon"></div>

      <!-- Brasão Central / Insígnia -->
      <div class="cover-emblem">
        <span v-if="isLocked" class="emblem-icon">🔒</span>
        <span v-else class="emblem-icon">📜</span>
      </div>

      <!-- Título do Projeto -->
      <div class="cover-title" :title="title">
        {{ title }}
      </div>

      <!-- Badge de Tarefas / Progresso -->
      <div v-if="taskCount !== undefined || progress !== undefined" class="cover-meta">
        <span v-if="taskCount !== undefined" class="meta-tasks">
          {{ taskCount }} {{ taskCount === 1 ? 'missão' : 'missões' }}
        </span>
        <span v-if="progress !== undefined" class="meta-progress"> {{ Math.round(progress) }}% </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    color?: string;
    taskCount?: number;
    progress?: number;
    isLocked?: boolean;
    interactive?: boolean;
  }>(),
  {
    color: '#8b4513',
    isLocked: false,
    interactive: true,
  },
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

function handleClick(event: MouseEvent) {
  if (props.interactive) {
    emit('click', event);
  }
}

const bookStyle = computed(() => {
  return {
    '--book-accent-color': props.color || '#8b4513',
  };
});
</script>

<style scoped>
.ui-grimoire-book {
  display: flex;
  position: relative;
  width: 140px;
  height: 200px;
  border-radius: 4px 8px 8px 4px;
  box-shadow:
    -3px 0 6px rgba(0, 0, 0, 0.4),
    4px 8px 20px rgba(0, 0, 0, 0.5);
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease;
  user-select: none;
  font-family: var(--font-guild-title, 'Cinzel', serif);
}

.ui-grimoire-book.is-interactive {
  cursor: pointer;
}

.ui-grimoire-book.is-interactive:hover {
  transform: translateY(-8px) scale(1.03) rotate(-1deg);
  box-shadow:
    -4px 0 10px rgba(0, 0, 0, 0.5),
    8px 16px 28px rgba(0, 0, 0, 0.65),
    0 0 15px rgba(234, 179, 8, 0.3);
}

/* Lombada */
.book-spine {
  width: 18px;
  height: 100%;
  background:
    linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.4) 0%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(0, 0, 0, 0.5) 100%
    ),
    var(--book-accent-color);
  border-radius: 4px 0 0 4px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 1.5rem 0;
  box-sizing: border-box;
}

.spine-rib {
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, #ca8a04, #fef08a, #854d0e);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* Capa */
.book-cover {
  flex: 1 1 auto;
  background: radial-gradient(circle at 70% 30%, var(--book-accent-color) 0%, hsl(20, 30%, 12%) 100%);
  border-radius: 0 8px 8px 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-left: none;
  position: relative;
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  overflow: hidden;
}

/* Cantoneiras */
.corner-metal {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #ca8a04;
  pointer-events: none;
}

.corner-tr {
  top: 3px;
  right: 3px;
  border-left: none;
  border-bottom: none;
  border-radius: 0 5px 0 0;
}

.corner-br {
  bottom: 3px;
  right: 3px;
  border-left: none;
  border-top: none;
  border-radius: 0 0 5px 0;
}

/* Fita */
.bookmark-ribbon {
  position: absolute;
  bottom: -6px;
  right: 24px;
  width: 10px;
  height: 18px;
  background: #dc2626;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 75%, 0% 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.cover-emblem {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: radial-gradient(circle, #fde047 0%, #ca8a04 70%, #713f12 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fef08a;
  box-shadow:
    inset 0 0 5px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.5);
  margin-top: 0.5rem;
}

.emblem-icon {
  font-size: 1.25rem;
}

.cover-title {
  color: #fef08a;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  line-height: 1.25;
  margin: 0.5rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.cover-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--font-guild-body, sans-serif);
  font-size: 0.68rem;
  color: hsl(38, 45%, 85%);
  background: rgba(0, 0, 0, 0.35);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 100%;
}
</style>
