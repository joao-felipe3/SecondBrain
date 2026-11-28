<template>
  <!-- Luz viva da sala: fica entre a arte e os tomos. Tudo em % do palco (= frações da arte). -->
  <div class="library-lights" aria-hidden="true">
    <!-- Janela de vitral: feixes que respiram (nuvens passando) e poeira suspensa dentro deles -->
    <div class="window-glass" />
    <div class="window-floor" />
    <div class="window-beams">
      <span class="beam beam--a"><span class="beam-ray" /></span>
      <span class="beam beam--b"><span class="beam-ray" /></span>
      <span class="beam beam--c"><span class="beam-ray" /></span>
      <div class="dust">
        <span v-for="m in DUST" :key="m.id" class="mote" :style="m.style" />
      </div>
    </div>

    <!-- Lanterna do teto: halo na abóbada, vidro que tremula e poça de luz que balança como pêndulo.
         Cada camada tremula num período diferente (primos entre si): a soma não repete padrão visível. -->
    <div class="lantern-swing">
      <div class="lantern-pool" />
    </div>
    <div class="lantern-halo" />
    <div class="lantern-glass">
      <div class="lantern-core" />
    </div>

    <!-- Tochas e velas: o mesmo flipbook de fogo do saguão e do mural, sobre as chamas pintadas -->
    <div
      v-for="(f, k) in LIBRARY_FLAMES"
      :key="k"
      class="flame"
      :class="f.kind === 'candle' ? 'is-candle' : 'is-torch'"
      :style="flameStyle(f, k)"
    >
      <div class="flame-glow" />
      <div class="fire-sprite" />
    </div>

    <div class="vignette" />
  </div>
</template>

<script setup lang="ts">
import { LIBRARY_FLAMES, libraryFlameStyle, type LibraryFlame } from '~/composables/ui/useLibraryScene';

function flameStyle(f: LibraryFlame, k: number): Record<string, string> {
  return { ...libraryFlameStyle(f), '--flame-delay': `${((k * 0.37) % 1.1).toFixed(2)}s` };
}

// Partículas de poeira com posição e ritmo determinísticos (sem Math.random: igual no SSR e no cliente),
// espalhadas ao longo dos feixes (da janela, ~3% / 40%, até o piso, ~26% / 92%)
const DUST = Array.from({ length: 18 }, (_, i) => {
  const seed = (i * 47) % 100;
  const t = ((i * 0.618) % 1) * 0.9 + 0.05;
  const across = (((i * 29) % 11) - 5) * 0.9;
  return {
    id: i,
    style: {
      left: `${(3 + t * 23 + across * 0.8).toFixed(2)}%`,
      top: `${(40 + t * 52 - across * 0.6).toFixed(2)}%`,
      '--mote-size': `${2 + (seed % 3)}px`,
      '--mote-dur': `${9 + (seed % 9)}s`,
      '--mote-delay': `-${(i * 1.7) % 12}s`,
      '--mote-dx': `${10 + (seed % 30)}px`,
      '--mote-dy': `${-20 - (seed % 40)}px`,
    } as Record<string, string>,
  };
});
</script>

<style scoped>
.library-lights {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* ---------- Janela (esquerda, x 0–6,8% / y 26–57% da arte) ---------- */
.window-glass {
  position: absolute;
  left: -1%;
  top: 25%;
  width: 9%;
  height: 34%;
  background: radial-gradient(
    ellipse at 40% 45%,
    rgba(255, 244, 214, 0.35) 0%,
    rgba(255, 232, 190, 0.12) 45%,
    transparent 75%
  );
  mix-blend-mode: screen;
  animation: windowBreath 7.3s ease-in-out infinite;
}

/* Mancha de sol no piso, ao fim dos feixes: acende e apaga junto com as nuvens */
.window-floor {
  position: absolute;
  left: 13%;
  top: 84%;
  width: 26%;
  height: 16%;
  transform: rotate(-8deg);
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(255, 236, 196, 0.22) 0%,
    rgba(255, 226, 180, 0.08) 45%,
    transparent 72%
  );
  mix-blend-mode: screen;
  animation: windowBreath 7.3s ease-in-out infinite;
}

.window-beams {
  position: absolute;
  inset: 0;
}

/*
 * Cada feixe é uma faixa que nasce na janela e desce em diagonal até o piso. Sem recorte de polígono:
 * as bordas são o próprio degradê (difusas), e o feixe some aos poucos ao longo do comprimento.
 */
.beam {
  position: absolute;
  width: 40%;
  transform-origin: 0 50%;
  mix-blend-mode: screen;
}

.beam-ray {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(255, 232, 190, 0.12) 25%,
    rgba(255, 240, 208, 0.38) 50%,
    rgba(255, 232, 190, 0.12) 75%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(to right, #000 0%, rgba(0, 0, 0, 0.7) 45%, transparent 100%);
  mask-image: linear-gradient(to right, #000 0%, rgba(0, 0, 0, 0.7) 45%, transparent 100%);
  will-change: opacity, transform;
}

/* Três feixes defasados: cada um some quando uma nuvem passa, em ritmos diferentes (primos entre si) */
.beam--a {
  left: 1%;
  top: 33%;
  height: 7%;
  transform: translateY(-50%) rotate(49deg);
}

.beam--a .beam-ray {
  animation: cloudPass 5.3s ease-in-out infinite;
}

.beam--b {
  left: 2.5%;
  top: 41%;
  height: 9%;
  transform: translateY(-50%) rotate(52deg);
}

.beam--b .beam-ray {
  animation: cloudPass 7.9s ease-in-out infinite;
  animation-delay: -3s;
}

.beam--c {
  left: 3.5%;
  top: 50%;
  height: 7%;
  transform: translateY(-50%) rotate(56deg);
}

.beam--c .beam-ray {
  animation: cloudPass 11.3s ease-in-out infinite;
  animation-delay: -7s;
}

.dust {
  position: absolute;
  inset: 0;
}

.mote {
  position: absolute;
  width: var(--mote-size);
  height: var(--mote-size);
  border-radius: 50%;
  background: rgba(255, 240, 210, 0.85);
  box-shadow: 0 0 4px rgba(255, 230, 190, 0.8);
  opacity: 0;
  animation: moteDrift var(--mote-dur) ease-in-out infinite;
  animation-delay: var(--mote-delay);
}

/* ---------- Lanterna (centro x 50%; vidro pintado em x 46,3–53,7% / y 9–18,8%, centro y ≈ 13,9%) ---------- */
/* Só o vidro tremula rápido; as luzes grandes (halo e poça) respiram devagar, como luz de vela de verdade. */
.lantern-glass {
  position: absolute;
  left: 50%;
  top: 13.9%;
  width: 11%;
  height: 17%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(255, 186, 84, 0.55) 0%,
    rgba(255, 132, 36, 0.24) 40%,
    transparent 70%
  );
  mix-blend-mode: screen;
  animation: lanternFlicker 2.3s ease-in-out infinite;
}

/* chama dentro do vidro: tremor miúdo e contínuo */
.lantern-core {
  position: absolute;
  inset: 22% 30%;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 60%, rgba(255, 214, 130, 0.65) 0%, transparent 70%);
  animation: lanternCore 0.9s ease-in-out infinite;
}

/* halo laranja na abóbada e nas colunas em volta da lanterna */
.lantern-halo {
  position: absolute;
  left: 50%;
  top: 14%;
  width: 40%;
  height: 48%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(255, 150, 48, 0.3) 0%,
    rgba(255, 118, 28, 0.11) 45%,
    transparent 70%
  );
  mix-blend-mode: screen;
  animation: lanternHalo 4.3s ease-in-out infinite;
}

/* Balanço: a poça de luz desliza de leve para os lados (sem girar a camada) */
.lantern-swing {
  position: absolute;
  inset: 0;
  animation: lanternSwing 6.1s ease-in-out infinite;
  will-change: transform;
}

/* Poça de luz laranja descendo da lanterna sobre a estante e o tapete */
.lantern-pool {
  position: absolute;
  left: 14%;
  top: 13.9%;
  width: 72%;
  height: 84%;
  background: radial-gradient(
    ellipse 50% 70% at 50% 6%,
    rgba(255, 160, 64, 0.3) 0%,
    rgba(255, 134, 44, 0.13) 38%,
    rgba(255, 116, 32, 0.04) 62%,
    transparent 80%
  );
  mix-blend-mode: screen;
  animation: lanternPoolBreath 5.3s ease-in-out infinite;
}

/* ---------- Chamas ---------- */
.flame {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center bottom;
}

.is-torch {
  aspect-ratio: 64 / 96;
}

.is-candle {
  aspect-ratio: 64 / 96;
}

/* flipbook de 16 quadros, o mesmo das tochas do saguão e do mural */
.fire-sprite {
  width: 100%;
  height: 100%;
  background-image: url('~/assets/img/fire-spritesheet-16.png');
  background-size: 1600% 100%;
  background-repeat: no-repeat;
  animation: libFire 1s steps(15) infinite;
  animation-delay: var(--flame-delay, 0s);
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  will-change: background-position;
}

.is-candle .fire-sprite {
  animation-duration: 1.15s;
}

/* brilho curto: a arte já tem a luz pintada; aqui só pulsa (sem lavar a parede de laranja) */
.flame-glow {
  position: absolute;
  inset: -70%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 180, 60, 0.26) 0%,
    rgba(255, 120, 30, 0.1) 40%,
    transparent 75%
  );
  filter: blur(10px);
  mix-blend-mode: screen;
  will-change: opacity, transform;
  animation: libGlow 1.5s ease-in-out infinite alternate;
  animation-delay: var(--flame-delay, 0s);
}

.is-candle .flame-glow {
  inset: -120%;
  filter: blur(6px);
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(10, 5, 2, 0.45) 100%);
}

/* ---------- Animações ---------- */
@keyframes libFire {
  from {
    background-position: 0% 0;
  }
  to {
    background-position: 100% 0;
  }
}

@keyframes libGlow {
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

@keyframes windowBreath {
  0%,
  100% {
    opacity: 0.85;
  }
  22% {
    opacity: 0.4;
  }
  38% {
    opacity: 0.55;
  }
  55% {
    opacity: 1;
  }
  72% {
    opacity: 0.6;
  }
  86% {
    opacity: 0.95;
  }
}

/* nuvem passando: o feixe quase some e volta; desliza de lado (perpendicular ao feixe) e afina/alarga */
@keyframes cloudPass {
  0%,
  100% {
    opacity: 0.95;
    transform: translateY(0) scaleY(1);
  }
  25% {
    opacity: 0.3;
    transform: translateY(12%) scaleY(0.85);
  }
  45% {
    opacity: 0.12;
    transform: translateY(20%) scaleY(0.8);
  }
  65% {
    opacity: 1;
    transform: translateY(4%) scaleY(1.1);
  }
  82% {
    opacity: 0.6;
    transform: translateY(-8%) scaleY(0.95);
  }
}

@keyframes moteDrift {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  20% {
    opacity: 0.8;
  }
  80% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: translate(var(--mote-dx), var(--mote-dy));
  }
}

/* tremulação irregular de chama dentro do vidro (sem padrão perceptível) */
@keyframes lanternFlicker {
  0%,
  100% {
    opacity: 0.8;
  }
  9% {
    opacity: 1;
  }
  17% {
    opacity: 0.68;
  }
  31% {
    opacity: 0.95;
  }
  44% {
    opacity: 0.74;
  }
  58% {
    opacity: 1;
  }
  71% {
    opacity: 0.64;
  }
  86% {
    opacity: 0.9;
  }
}

@keyframes lanternCore {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1, 1);
  }
  25% {
    opacity: 0.65;
    transform: scale(0.96, 1.03);
  }
  50% {
    opacity: 1;
    transform: scale(1.03, 0.98);
  }
  75% {
    opacity: 0.75;
    transform: scale(0.98, 1.02);
  }
}

@keyframes lanternHalo {
  0%,
  100% {
    opacity: 0.85;
  }
  30% {
    opacity: 1;
  }
  55% {
    opacity: 0.7;
  }
  80% {
    opacity: 0.95;
  }
}

@keyframes lanternPoolBreath {
  0%,
  100% {
    opacity: 0.9;
  }
  35% {
    opacity: 0.72;
  }
  60% {
    opacity: 1;
  }
  85% {
    opacity: 0.8;
  }
}

/* balanço: a poça desliza ~1% para cada lado */
@keyframes lanternSwing {
  0%,
  100% {
    transform: translateX(-1%);
  }
  50% {
    transform: translateX(1%);
  }
}

/* Sem trava de prefers-reduced-motion, como as tochas do saguão e do mural: no Windows com "efeitos de
   animação" desligados o navegador reporta reduce e a sala ficaria congelada. */
</style>
