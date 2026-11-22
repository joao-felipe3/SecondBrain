<template>
  <!-- camada sobre a folha (160x200 antes da escala do cartão); não captura cliques -->
  <div class="card-accents" :class="`accents-${column}`" aria-hidden="true">
    <span v-if="accents.hourglass" class="accent-hourglass">
      <UiHourglass
        size="md"
        :progress="accents.hourglass.progress"
        :active="accents.hourglass.active"
        :label="`Pomodoros: ${task?.pomodorosDid || 0}/${task?.pomodorosPlanned || 0}`"
      />
    </span>

    <span v-if="accents.medal" class="accent-medal">
      <UiRibbonMedal color="green" size="sm" />
    </span>

    <span v-if="accents.stamp" class="accent-stamp">CUMPRIDO</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiHourglass from '~/components/ui/diegetic/UiHourglass.vue';
import UiRibbonMedal from '~/components/ui/diegetic/UiRibbonMedal.vue';
import { getCardAccents, type AccentColumn } from './cardAccents';

const props = defineProps<{
  task: any;
  column: AccentColumn;
}>();

const accents = computed(() => getCardAccents(props.task, props.column));
</script>

<style scoped>
.card-accents {
  position: absolute;
  left: 0;
  top: 0;
  width: 160px;
  height: 200px;
  pointer-events: none;
  z-index: 420;
}

.card-accents > span {
  position: absolute;
  display: inline-flex;
}

/* canto inferior esquerdo: livre na coluna "Em Andamento" (a medalha só aparece em Cumpridas) */
.accent-hourglass {
  left: 10px;
  bottom: 10px;
  filter: drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.35));
}

.accent-medal {
  left: 8px;
  bottom: 6px;
}

/* carimbo de tinta vermelha, torto e meio gasto */
.accent-stamp {
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%) rotate(-16deg);
  padding: 2px 8px;
  border: 2.5px solid rgba(150, 22, 22, 0.78);
  border-radius: 4px;
  color: rgba(150, 22, 22, 0.82);
  font-family: var(--font-guild-title, 'Irish Grover', cursive);
  font-size: 19px;
  letter-spacing: 2px;
  line-height: 1.1;
  mix-blend-mode: multiply;
  /* tinta falhada */
  mask-image: radial-gradient(circle at 30% 40%, #000 55%, rgba(0, 0, 0, 0.55) 80%);
  -webkit-mask-image: radial-gradient(circle at 30% 40%, #000 55%, rgba(0, 0, 0, 0.55) 80%);
}
</style>
