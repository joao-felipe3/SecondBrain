<template>
  <div class="mural-flames" aria-hidden="true">
    <div
      v-for="(f, k) in MURAL_FLAMES"
      :key="k"
      class="flame"
      :class="f.kind === 'candle' ? 'is-candle' : 'is-torch'"
      :style="flameStyle(f, k)"
    >
      <div class="flame-glow"></div>
      <div class="fire-sprite"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Chamas animadas sobre as tochas e velas pintadas na arte do mural (mesmo sprite e mesma conta do
// saguão, `GuildVfxLayer.vue`). Ficam no palco, posicionadas em frações do palco já escalado.
import { MURAL_FLAMES, flameStageStyle, type MuralFlame } from '~/composables/ui/useTasksScene';

function flameStyle(f: MuralFlame, k: number): Record<string, string> {
  return { ...flameStageStyle(f), '--flame-delay': `${((k * 0.37) % 1.1).toFixed(2)}s` };
}
</script>

<style scoped>
.mural-flames {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.flame {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center bottom;
}

.is-torch {
  aspect-ratio: 72 / 108;
}

.is-candle {
  aspect-ratio: 14 / 21;
}

/* flipbook de 16 quadros, o mesmo das tochas do saguão */
.fire-sprite {
  width: 100%;
  height: 100%;
  background-image: url('~/assets/img/fire-spritesheet-16.png');
  background-size: 1600% 100%;
  background-repeat: no-repeat;
  animation: muralFire 1s steps(15) infinite;
  animation-delay: var(--flame-delay, 0s);
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  will-change: background-position;
}

.is-candle .fire-sprite {
  animation-duration: 1.1s;
}

/* brilho curto e discreto: a arte já tem a luz pintada; aqui só pulsa um pouco (nada de lavar a parede) */
.flame-glow {
  position: absolute;
  inset: -70%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 180, 60, 0.28) 0%,
    rgba(255, 120, 30, 0.12) 40%,
    transparent 75%
  );
  filter: blur(10px);
  mix-blend-mode: screen;
  will-change: opacity, transform;
  animation: muralGlow 1.5s ease-in-out infinite alternate;
  animation-delay: var(--flame-delay, 0s);
}

.is-candle .flame-glow {
  inset: -110%;
  filter: blur(8px);
}

@keyframes muralFire {
  from {
    background-position: 0% 0;
  }
  to {
    background-position: 100% 0;
  }
}

@keyframes muralGlow {
  0% {
    opacity: 0.5;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.6;
    transform: scale(0.98);
  }
}

/* sem trava de prefers-reduced-motion, como as tochas do saguão: no Windows com "Mostrar animações" desligado
   o navegador reporta reduce e as chamas ficariam congeladas */
</style>
