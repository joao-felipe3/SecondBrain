<template>
  <!-- VIDA NA CENA: vinhetas pintadas na própria ilustração; deve ficar dentro do GuildSceneSpace -->
  <div class="hall-life-layer" :class="`is-${layer}`">
    <div
      v-for="v in views"
      :key="v.id"
      :ref="(el) => setVignetteRef(v.id, el)"
      class="hall-vignette"
      :class="[v.lightClass, { 'is-interactive': !!v.tooltip }]"
      :style="v.style"
      :data-vignette="v.id"
    >
      <!-- repouso fixo por baixo: nunca aparece o cenário "vazio" e a volta ao repouso também dissolve -->
      <img
        v-if="v.frames[0] && !(puppetReady[v.id] && !puppetFailed[v.id])"
        :src="v.frames[0].src"
        class="hall-frame hall-frame-base"
        alt=""
        decoding="async"
        draggable="false"
      />
      <!-- NPC marionete: animado em tempo real; o repouso acima fica por baixo até carregar (e se falhar) -->
      <GuildPuppetCanvas
        v-if="v.puppet && !puppetFailed[v.id] && activePuppets.has(v.id)"
        :src="v.puppet.src"
        class="hall-frame-puppet"
        @ready="puppetReady[v.id] = true"
        @failed="puppetFailed[v.id] = true"
        @cue="music.play"
      />
      <img
        v-for="f in v.puppet ? [] : v.frames"
        :key="f.name"
        :src="f.src"
        class="hall-frame"
        :class="{
          'is-active': (active[v.id] ?? v.frames[0]?.name) === f.name,
          'is-previous': previous[v.id] === f.name,
        }"
        :style="{ '--fade': `${fade[v.id] ?? 220}ms` }"
        alt=""
        decoding="async"
        loading="eager"
        draggable="false"
      />
      <!-- hitbox só na metade central do patch (o patch inclui pixels de cenário em volta) -->
      <button
        v-if="v.tooltip"
        class="hall-vignette-hit"
        type="button"
        :aria-label="v.tooltip"
        @mouseenter="emit('updateTooltip', v.tooltip)"
        @mouseleave="emit('updateTooltip', null)"
        @focus="emit('updateTooltip', v.tooltip)"
        @blur="emit('updateTooltip', null)"
        @click="emit('npcClick', v.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import GuildPuppetCanvas from './GuildPuppetCanvas.vue';
import {
  useHallLife,
  puppetReady,
  puppetFailed,
  getBrowserHallFallbackProfile,
  type HallLifeLayer,
} from '~/composables/features/useHallLife';
import { useHallMusic } from '~/composables/ui/useHallMusic';

const props = withDefaults(defineProps<{ layer?: HallLifeLayer }>(), { layer: 'base' });

const emit = defineEmits<{
  (e: 'updateTooltip', msg: string | null): void;
  (e: 'npcClick', id: string): void;
}>();

const { views, active, previous, fade } = useHallLife({ layer: props.layer });
const activePuppets = ref(new Set<string>());
const vignetteElements = new Map<string, Element>();
let proximityObserver: IntersectionObserver | null = null;

function setVignetteRef(id: string, el: Element | null) {
  if (!el) {
    vignetteElements.delete(id);
    return;
  }
  vignetteElements.set(id, el);
  proximityObserver?.observe(el);
}

function setPuppetActive(id: string, active: boolean) {
  const next = new Set(activePuppets.value);
  if (active && getBrowserHallFallbackProfile().allowPuppets) {
    puppetReady[id] = false;
    next.add(id);
  } else {
    next.delete(id);
  }
  activePuppets.value = next;
}

// som do saguão: alaúde do bardo (sincronizado com a mão) + ambiente; liga no primeiro gesto
const music = useHallMusic();
onMounted(() => {
  if (props.layer === 'base') music.arm();
  if ('IntersectionObserver' in window) {
    proximityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const vignette = entry.target as HTMLElement;
          const id = vignette.dataset.vignette;
          if (id) setPuppetActive(id, entry.isIntersecting);
        }
      },
      { rootMargin: '25% 0px', threshold: 0.01 },
    );
    for (const el of vignetteElements.values()) proximityObserver.observe(el);
  } else {
    for (const view of views.value) {
      if (view.puppet) setPuppetActive(view.id, true);
    }
  }
});

onBeforeUnmount(() => {
  proximityObserver?.disconnect();
  proximityObserver = null;
  vignetteElements.clear();
});
</script>

<style scoped>
.hall-life-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hall-vignette {
  position: absolute;
  pointer-events: none;
  /* a luz da tocha/lareira mais próxima pulsa sobre o personagem no mesmo ritmo do GuildVfxLayer */
  animation: hallTorchFlicker 1.6s ease-in-out infinite alternate;
  animation-delay: var(--light-delay, 0s);
  will-change: filter;
}

.hall-vignette.light-hearth {
  animation: hallHearthFlicker 1.4s ease-in-out infinite alternate;
  animation-delay: var(--light-delay, 0s);
}

.hall-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  user-select: none;
}

/* crossfade "por cima": o frame novo surge sobre o anterior, que fica opaco embaixo até o fim
   (dois frames meio transparentes deixariam o repouso vazar no meio do movimento) */
.hall-frame.is-previous {
  opacity: 1;
  z-index: 1;
}

.hall-frame.is-active {
  opacity: 1;
  z-index: 2;
  /* dissolve contínuo: dura o passo inteiro, então o próximo desenho começa quando este termina */
  animation: hall-frame-reveal var(--fade, 220ms) cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes hall-frame-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.hall-frame.hall-frame-base {
  opacity: 1;
  z-index: 0;
}

.hall-vignette-hit {
  position: absolute;
  inset: 18% 22%;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
  border-radius: 40%;
}

.hall-frame-puppet {
  z-index: 3;
}

.hall-vignette.is-interactive:hover .hall-frame.is-active,
.hall-vignette.is-interactive:focus-within .hall-frame.is-active,
.hall-vignette.is-interactive:hover .hall-frame-puppet,
.hall-vignette.is-interactive:focus-within .hall-frame-puppet {
  filter: drop-shadow(0 0 6px rgba(255, 200, 90, 0.55));
}

.hall-vignette-hit:focus-visible {
  outline: 2px solid var(--guild-gold-glow, #ffc83d);
  outline-offset: 2px;
}

/* mesma curva do @keyframes lightPulse das tochas, aplicada como brilho */
@keyframes hallTorchFlicker {
  0% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(calc(1 + var(--light-gain, 0.06)));
  }
  100% {
    filter: brightness(calc(1 + var(--light-gain, 0.06) * 0.15));
  }
}

/* mesma curva do @keyframes hearthPulse da lareira */
@keyframes hallHearthFlicker {
  0% {
    filter: brightness(1);
  }
  100% {
    filter: brightness(calc(1 + var(--light-gain, 0.12)));
  }
}

/* movimento reduzido: só o pulso de luz sai. Os dissolves entre poses ficam, porque um corte
   seco entre desenhos é mais brusco que dissolver (e o Windows liga essa preferência só por
   "efeitos de animação" desligados) */
@media (prefers-reduced-motion: reduce) {
  .hall-vignette {
    animation: none;
  }
}
</style>
