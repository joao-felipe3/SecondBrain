<template>
  <!-- CAMINHANTES: NPCs que atravessam o saguão; deve ficar dentro de um GuildSceneSpace -->
  <div class="hall-walkers">
    <div
      v-for="w in views"
      v-show="w.visible"
      :key="w.id"
      class="hall-walker"
      :style="w.style"
      :data-walker="w.id"
    >
      <!-- troca seca de frames (ciclo de caminhada), todos pré-carregados -->
      <img
        v-for="(src, i) in w.frames"
        :key="src"
        :src="src"
        class="hall-walker-frame"
        :class="{ 'is-active': w.frame === i }"
        alt=""
        decoding="async"
        draggable="false"
      />
      <button
        v-if="w.tooltip"
        class="hall-walker-hit"
        type="button"
        :aria-label="w.tooltip"
        @mouseenter="emit('updateTooltip', w.tooltip)"
        @mouseleave="emit('updateTooltip', null)"
        @focus="emit('updateTooltip', w.tooltip)"
        @blur="emit('updateTooltip', null)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useHallWalkers } from '~/composables/features/useHallWalkers';

const emit = defineEmits<{ (e: 'updateTooltip', msg: string | null): void }>();

const route = useRoute();
const freezeT = route.query.walkerT;
const freezeAt =
  typeof freezeT === 'string'
    ? { t: Number(freezeT), frame: Number(route.query.walkerFrame ?? 0) }
    : null;
const { views } = useHallWalkers({ freezeAt });
</script>

<style scoped>
.hall-walkers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hall-walker {
  position: absolute;
  pointer-events: none;
  will-change: left, top, width, height, opacity;
  /* mesma pulsação leve das tochas usada nas vinhetas */
  animation: walkerFlicker 1.6s ease-in-out infinite alternate;
}

.hall-walker-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  visibility: hidden;
  user-select: none;
}

.hall-walker-frame.is-active {
  visibility: visible;
}

.hall-walker-hit {
  position: absolute;
  inset: 4% 22% 8% 22%;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
}

@keyframes walkerFlicker {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hall-walker {
    animation: none;
  }
}
</style>
