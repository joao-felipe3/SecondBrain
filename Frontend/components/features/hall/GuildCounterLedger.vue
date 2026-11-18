<template>
  <!--
    MISSÕES DO DIA escritas a tinta na folha de pergaminho pintada no balcão (vinheta counter-ledger).
    A folha é desenho da cena; aqui só entra a escrita, projetada nos 4 cantos da folha (homografia),
    então ela deita no balcão com a mesma perspectiva. Vive dentro do GuildSceneSpace (só desktop).
  -->
  <div ref="root" class="counter-ledger-space">
    <div
      v-if="matrix"
      class="ledger-sheet"
      :style="{ width: `${SHEET_W}px`, height: `${SHEET_H}px`, transform: matrix }"
      role="button"
      tabindex="0"
      aria-label="Missões do dia: abrir o Grimório da Guilda"
      @click="emit('open')"
      @keydown.enter.prevent="emit('open')"
      @mouseenter="emit('updateTooltip', TOOLTIP)"
      @mouseleave="emit('updateTooltip', null)"
      @focus="emit('updateTooltip', TOOLTIP)"
      @blur="emit('updateTooltip', null)"
    >
      <div class="ledger-ink">
        <h3 class="ledger-title">Missões do Dia</h3>
        <svg class="ledger-flourish" viewBox="0 0 200 12" aria-hidden="true">
          <path d="M4 7 C 50 1, 80 11, 100 6 S 160 2, 196 7" />
          <path d="M92 6 q8 -6 16 0 q-8 6 -16 0" />
        </svg>

        <ul v-if="missions.length > 0" class="ledger-list">
          <li
            v-for="task in missions"
            :key="missionId(task)"
            class="ledger-item"
            :class="{ 'is-done': isDone(task) }"
          >
            <button
              type="button"
              class="ledger-check"
              :aria-pressed="isDone(task)"
              :aria-label="`${isDone(task) ? 'Reabrir' : 'Concluir'}: ${missionTitle(task)}`"
              @click.stop="toggleMission(task)"
              @keydown.enter.stop
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path class="box" d="M3 4 L17 3 L16.5 17 L3.5 16.5 Z" />
                <path v-if="isDone(task)" class="tick" d="M5 10 L9 14.5 L18 1" />
              </svg>
            </button>
            <span class="ledger-text">{{ missionTitle(task) }}</span>
          </li>
        </ul>

        <p v-else class="ledger-empty">Tudo em dia!<br />A guilda descansa.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { quadMatrix3d, quadToPx, type Quad } from '~/composables/ui/useQuadTransform';
import { useDailyMissions } from '~/composables/features/useDailyMissions';

const emit = defineEmits<{
  (e: 'updateTooltip', msg: string | null): void;
  (e: 'open'): void;
}>();

const TOOLTIP = '📖 Missões do dia: clique para abrir o Grimório da Guilda';

/** cantos da folha na imagem 5056x3392 (topo-esq, topo-dir, base-dir, base-esq), da vinheta counter-ledger */
const IMAGE_W = 5056;
const IMAGE_H = 3392;
const SHEET_QUAD_PX: Quad = [
  [3288, 2367],
  [3538, 2334],
  [3718, 2469],
  [3438, 2531],
];
const SHEET_QUAD: Quad = SHEET_QUAD_PX.map(
  ([x, y]) => [x / IMAGE_W, y / IMAGE_H] as const,
) as unknown as Quad;

/** tamanho "de papel" da escrita; a projeção leva esse retângulo aos cantos da folha */
const SHEET_W = 250;
const SHEET_H = 210;

const { missions, isDone, missionId, missionTitle, toggleMission } = useDailyMissions();

const root = ref<HTMLElement | null>(null);
const size = ref<{ w: number; h: number } | null>(null);
let observer: ResizeObserver | null = null;

onMounted(() => {
  const el = root.value;
  if (!el) return;
  const measure = () => (size.value = { w: el.clientWidth, h: el.clientHeight });
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

const matrix = computed(() => {
  if (!size.value?.w) return null;
  return quadMatrix3d(SHEET_W, SHEET_H, quadToPx(SHEET_QUAD, size.value.w, size.value.h));
});
</script>

<style scoped>
.counter-ledger-space {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* acima das vinhetas (cada uma tem z-index pela ordem), inclusive da própria folha pintada */
  z-index: 1000;
}

.ledger-sheet {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: auto;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

/* tinta: multiplica sobre o pergaminho (herda a luz e a textura do desenho) */
.ledger-ink {
  position: absolute;
  inset: 20px 14px 34px 30px;
  display: flex;
  flex-direction: column;
  color: #5a3417;
  mix-blend-mode: multiply;
  /* bordas levemente borradas, como tinta absorvida pelo papel */
  filter: blur(0.35px);
  transition: color 0.25s ease;
}

.ledger-sheet:hover .ledger-ink,
.ledger-sheet:focus-visible .ledger-ink {
  color: #3a1d08;
}

.ledger-title {
  margin: 0;
  font-family: var(--font-guild-title, serif);
  font-size: 27px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  letter-spacing: 0.5px;
}

.ledger-flourish {
  width: 70%;
  height: 12px;
  margin: 3px auto 8px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  opacity: 0.8;
}

.ledger-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ledger-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ledger-check {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ledger-check svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ledger-check .box {
  stroke-width: 1.8;
}

.ledger-check .tick {
  stroke-width: 2.6;
  color: #6b1a10;
}

.ledger-check:hover .box,
.ledger-check:focus-visible .box {
  stroke-width: 2.6;
}

.ledger-text {
  min-width: 0;
  font-family: var(--font-guild-script, cursive);
  font-size: 21px;
  font-weight: 700;
  line-height: 1.05;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* concluída: riscada à mão */
.ledger-item.is-done .ledger-text {
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  opacity: 0.55;
}

.ledger-empty {
  margin: 10px 0 0;
  font-family: var(--font-guild-script, cursive);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}
</style>
