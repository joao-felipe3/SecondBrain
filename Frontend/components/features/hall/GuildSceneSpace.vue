<template>
  <!--
    Contêiner que coincide pixel a pixel com a imagem de fundo do saguão (mesmo cover,
    object-position e scale do .master-bg). Filhos usam frações da imagem.
  -->
  <div v-if="!hidden" class="guild-scene-space" :style="vars">
    <slot />

    <!-- Grade de calibração: /?sceneDebug=1 (linhas a cada 5% da imagem) -->
    <div v-if="debug" class="scene-debug-grid" aria-hidden="true">
      <span v-for="n in 19" :key="`v${n}`" class="scene-debug-line is-v" :style="{ left: `${n * 5}%` }">
        <em>{{ (n * 0.05).toFixed(2) }}</em>
      </span>
      <span v-for="n in 19" :key="`h${n}`" class="scene-debug-line is-h" :style="{ top: `${n * 5}%` }">
        <em>{{ (n * 0.05).toFixed(2) }}</em>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { HALL_STAGE_MODES, sceneSpaceStyle } from '~/composables/ui/useSceneSpace';

const props = defineProps<{
  /** mobile/retrato usa outra imagem de fundo: o scene space desktop não se aplica */
  hidden?: boolean;
  /** profundidade dentro da safe-zone (padrão 2: acima do fundo, abaixo dos efeitos) */
  zIndex?: number;
}>();

const route = useRoute();
const debug = computed(() => route.query.sceneDebug === '1');

/**
 * Os dois modos viram variáveis CSS; a escolha fica com a MESMA media query do .master-bg
 * (min-aspect-ratio: 2.4/1). Assim o contêiner nunca diverge do fundo, nem no SSR/hidratação.
 */
function toVars(prefix: string, style: Record<string, string>) {
  return Object.fromEntries(Object.entries(style).map(([k, v]) => [`--${prefix}-${k}`, v]));
}

const vars = computed(() => ({
  zIndex: String(props.zIndex ?? 2),
  ...toVars('d', sceneSpaceStyle(HALL_STAGE_MODES.desktop)),
  ...toVars('u', sceneSpaceStyle(HALL_STAGE_MODES.ultrawide)),
}));
</script>

<style scoped>
.guild-scene-space {
  position: absolute;
  left: var(--d-left);
  top: var(--d-top);
  width: var(--d-width);
  height: var(--d-height);
  transform: var(--d-transform);
  transform-origin: var(--d-transformOrigin);
  pointer-events: none;
  will-change: transform;
  transition: transform 0.3s ease; /* mesma transição do .master-bg */
}

/* mesmo breakpoint e mesmos parâmetros do .master-bg em pages/index.vue */
@media (min-aspect-ratio: 2.4/1) {
  .guild-scene-space {
    left: var(--u-left);
    top: var(--u-top);
    width: var(--u-width);
    height: var(--u-height);
    transform: var(--u-transform);
    transform-origin: var(--u-transformOrigin);
  }
}

.scene-debug-grid {
  position: absolute;
  inset: 0;
  outline: 2px solid rgba(0, 220, 255, 0.9);
  z-index: 100;
}

.scene-debug-line {
  position: absolute;
  background: rgba(255, 40, 40, 0.75);
}

.scene-debug-line.is-v {
  top: 0;
  bottom: 0;
  width: 1px;
}

.scene-debug-line.is-h {
  left: 0;
  right: 0;
  height: 1px;
}

.scene-debug-line em {
  position: absolute;
  font: 600 9px/1 monospace;
  font-style: normal;
  color: #fff;
  background: rgba(200, 0, 0, 0.8);
  padding: 1px 2px;
}

.scene-debug-line.is-v em {
  top: 36%;
  left: 2px;
}

.scene-debug-line.is-h em {
  left: 26%;
  top: 2px;
}
</style>
