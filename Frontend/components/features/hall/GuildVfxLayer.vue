<template>
  <div class="vfx-layer">
    <!-- Tocha 1 (Parede Esquerda) -->
    <div class="torch-container torch-1">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 2 (Mural Interno / Quadro de Missões) -->
    <div class="torch-container torch-2">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 3 (Pilastra Centro-Esquerda) -->
    <div class="torch-container torch-3">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 4 (Pilastra Centro-Direita) -->
    <div class="torch-container torch-4">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 5 (Mezanino Superior Esquerdo) -->
    <div class="torch-container torch-5">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 6 (Mezanino Superior Direito) -->
    <div class="torch-container torch-6">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 7 (Térreo Fundo Esquerdo) -->
    <div class="torch-container torch-7">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 8 (Térreo Fundo Direito) -->
    <div class="torch-container torch-8">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 9 (Mezanino Esquerdo Extremo - Parede Escada) -->
    <div class="torch-container torch-9">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 10 (Mezanino Direito Extremo) -->
    <div class="torch-container torch-10">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 11 (Ao lado da pilastra Centro-Esquerda) -->
    <div class="torch-container torch-11">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 12 (Ao lado da pilastra Centro-Direita) -->
    <div class="torch-container torch-12">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Tocha 13 (Parede Esquerda fora da safe zone) -->
    <div class="torch-container torch-13">
      <div class="torch-light-glow"></div>
      <div class="fire-sprite"></div>
    </div>

    <!-- Lareira ao Fundo + Labaredas + Fagulhas (.hearth-flames) -->
    <div class="hearth-area hearth-flames">
      <div class="hearth-fire-glow"></div>
      <div class="hearth-flame-mask">
        <div class="fire-sprite hearth-sprite"></div>
      </div>
      <span class="spark spark-1"></span>
      <span class="spark spark-2"></span>
      <span class="spark spark-3"></span>
      <span class="spark spark-4"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Camada de efeitos visuais (12 tochas + lareira e fagulhas 2D)
</script>

<style scoped>
/* CAMADA DE EFEITOS VISUAIS DE ILUMINAÇÃO & LABAREDAS 2D (VFX LAYER) */
.vfx-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  transition: transform 0.3s ease;
}

/* SUPER ULTRAWIDE (32:9, 5120x1440 e superior - min-aspect-ratio: 2.4/1): Sincroniza as tochas com ancoragem 50% 50% e compensação de object-position */
@media (min-aspect-ratio: 2.4/1) {
  .vfx-layer {
    transform: translate(9%, 22.5%) scale(1.353);
    transform-origin: 50% 50%;
  }
}

/* CONTAINER DAS TOCHAS */
.torch-container {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transform-origin: center bottom;
}

/* LABAREDAS ANIMADAS EM FLIPBOOK RESPONSIVO (16 FRAMES) */
.fire-sprite {
  width: 100%;
  height: 100%;
  background-image: url("~/assets/img/fire-spritesheet-16.png");
  background-size: 1600% 100%; /* 16 frames */
  background-repeat: no-repeat;
  animation: playFire 1s steps(15) infinite;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  will-change: background-position, transform;
}

/* GLOW INTERNO DE LUZ SUAVE DAS TOCHAS (ATMOSFÉRICO) */
.torch-light-glow {
  position: absolute;
  inset: -100%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 185, 50, 0.45) 0%,
    rgba(255, 110, 20, 0.22) 40%,
    rgba(200, 60, 0, 0.05) 75%,
    transparent 100%
  );
  filter: blur(14px);
  mix-blend-mode: screen;
  transform-origin: center;
  will-change: opacity, transform;
  pointer-events: none;
}

/* POSICIONAMENTO EXATO DOS SPRITES DE LABAREDA SOBRE AS TOCHAS (% DO PALCO 16:9) */

/* Tocha 1 (Parede Esquerda) */
.torch-1 {
  top: 31.5%;
  left: 2.2%;
  width: 4%;
  aspect-ratio: 72 / 108;
}
.torch-1 .fire-sprite {
  animation-duration: 1s;
  animation-delay: 0s;
}
.torch-1 .torch-light-glow {
  animation: lightPulse 1.4s ease-in-out infinite alternate;
  animation-delay: 0s;
}

/* Tocha 2 (Mural Interno / Quadro de Missões) */
.torch-2 {
  top: 36.5%;
  left: 15.7%;
  width: 1.8%;
  aspect-ratio: 26 / 39;
}
.torch-2 .fire-sprite {
  animation-duration: 1.2s;
  animation-delay: 0.3s;
}
.torch-2 .torch-light-glow {
  animation: lightPulse 1.7s ease-in-out infinite alternate;
  animation-delay: 0.3s;
}

/* Tocha 3 (Pilastra Centro-Esquerda) */
.torch-3 {
  top: 32%;
  left: 29.3%;
  width: 2.8%;
  aspect-ratio: 46 / 68;
}
.torch-3 .fire-sprite {
  animation-duration: 0.95s;
  animation-delay: 0.15s;
}
.torch-3 .torch-light-glow {
  animation: lightPulse 1.3s ease-in-out infinite alternate;
  animation-delay: 0.15s;
}

/* Tocha 4 (Pilastra Centro-Direita) */
.torch-4 {
  top: 32%;
  left: 60%;
  width: 2.8%;
  aspect-ratio: 48 / 72;
}
.torch-4 .fire-sprite {
  animation-duration: 1.15s;
  animation-delay: 0.5s;
}
.torch-4 .torch-light-glow {
  animation: lightPulse 1.9s ease-in-out infinite alternate;
  animation-delay: 0.5s;
}

/* Tocha 5 (Mezanino Superior Esquerdo - Arco Superior Micro) */
.torch-5 {
  top: 20.7%;
  left: 41.6%;
  width: 1%;
  aspect-ratio: 14 / 21;
}
.torch-5 .fire-sprite {
  animation-duration: 1.1s;
  animation-delay: 0.2s;
}
.torch-5 .torch-light-glow {
  animation: lightPulse 1.6s ease-in-out infinite alternate;
  animation-delay: 0.2s;
}

/* Tocha 6 (Mezanino Superior Direito - Arco Superior Micro) */
.torch-6 {
  top: 20.7%;
  left: 50.3%;
  width: 1%;
  aspect-ratio: 14 / 21;
}
.torch-6 .fire-sprite {
  animation-duration: 1.25s;
  animation-delay: 0.4s;
}
.torch-6 .torch-light-glow {
  animation: lightPulse 1.8s ease-in-out infinite alternate;
  animation-delay: 0.4s;
}

/* Tocha 7 (Térreo Fundo Esquerdo - Arco Inferior Micro) */
.torch-7 {
  top: 38.2%;
  left: 41.4%;
  width: 1%;
  aspect-ratio: 14 / 21;
}
.torch-7 .fire-sprite {
  animation-duration: 1.15s;
  animation-delay: 0.35s;
}
.torch-7 .torch-light-glow {
  animation: lightPulse 1.5s ease-in-out infinite alternate;
  animation-delay: 0.35s;
}

/* Tocha 8 (Térreo Fundo Direito - Arco Inferior Micro) */
.torch-8 {
  top: 38.2%;
  left: 50.1%;
  width: 1%;
  aspect-ratio: 14 / 21;
}
.torch-8 .fire-sprite {
  animation-duration: 1.3s;
  animation-delay: 0.6s;
}
.torch-8 .torch-light-glow {
  animation: lightPulse 1.75s ease-in-out infinite alternate;
  animation-delay: 0.6s;
}

/* Tocha 9 (Mezanino Esquerdo Extremo - Parede Escada) */
.torch-9 {
  top: 17.7%;
  left: 34.7%;
  width: 1.2%;
  aspect-ratio: 14 / 21;
}
.torch-9 .fire-sprite {
  animation-duration: 1.05s;
  animation-delay: 0.1s;
}
.torch-9 .torch-light-glow {
  animation: lightPulse 1.45s ease-in-out infinite alternate;
  animation-delay: 0.1s;
}

/* Tocha 10 (Mezanino Direito Extremo) */
.torch-10 {
  top: 17.5%;
  left: 55.9%;
  width: 1.2%;
  aspect-ratio: 14 / 21;
}
.torch-10 .fire-sprite {
  animation-duration: 1.05s;
  animation-delay: 0.1s;
}
.torch-10 .torch-light-glow {
  animation: lightPulse 1.45s ease-in-out infinite alternate;
  animation-delay: 0.1s;
}

/* Tocha 11 (Ao lado da Pilastra Centro-Esquerda) */
.torch-11 {
  top: 35%;
  left: 21.6%;
  width: 2.4%;
  aspect-ratio: 14 / 21;
}
.torch-11 .fire-sprite {
  animation-duration: 1.1s;
  animation-delay: 0.3s;
}
.torch-11 .torch-light-glow {
  animation: lightPulse 1.6s ease-in-out infinite alternate;
  animation-delay: 0.3s;
}

/* Tocha 12 (Ao lado da pilastra Centro-Direita) */
.torch-12 {
  top: 35%;
  left: 74.7%;
  width: 2.4%;
  aspect-ratio: 14 / 21;
}
.torch-12 .fire-sprite {
  animation-duration: 1.1s;
  animation-delay: 0.3s;
}
.torch-12 .torch-light-glow {
  animation: lightPulse 1.6s ease-in-out infinite alternate;
  animation-delay: 0.3s;
}

/* Tocha 13 (Parede Esquerda fora da safe zone) */
.torch-13 {
  top: 31.5%;
  left: -3.2%;
  width: 4%;
  aspect-ratio: 84 / 108;
}
.torch-13 .fire-sprite {
  animation-duration: 1.3s;
  animation-delay: 0.6s;
}
.torch-13 .torch-light-glow {
  animation: lightPulse 1.75s ease-in-out infinite alternate;
  animation-delay: 0.6s;
}

/* LAREIRA AO FUNDO + LABAREDAS (.hearth-flames) */
.hearth-area.hearth-flames {
  position: absolute;
  top: 44.4%;
  left: 56.4%;
  width: 5.8%;
  aspect-ratio: 21 / 16;
  pointer-events: none;
}

/* MÁSCARA CAVITÁRIA PARA CONTER O FOGO NAS LATERAIS E ACOMPANHAR O ARCO DA LAREIRA */
.hearth-flame-mask {
  position: absolute;
  top: -8%;
  left: 20%;
  width: 60%;
  height: 100%;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
  -webkit-mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 1) 12%,
    rgba(0, 0, 0, 1) 80%,
    rgba(0, 0, 0, 0) 100%
  );
  mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 1) 12%,
    rgba(0, 0, 0, 1) 80%,
    rgba(0, 0, 0, 0) 100%
  );
}

.hearth-flames .fire-sprite {
  width: 100%;
  height: 100%;
  animation-duration: 0.85s;
  animation-delay: 0.2s;
}

/* BRILHO AMBIENTE QUENTE DA LAREIRA AO FUNDO (ATMOSFÉRICO) */
.hearth-fire-glow {
  position: absolute;
  inset: -140%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 160, 30, 0.5) 0%,
    rgba(255, 90, 10, 0.25) 42%,
    rgba(210, 50, 0, 0.06) 75%,
    transparent 100%
  );
  filter: blur(24px);
  mix-blend-mode: screen;
  will-change: opacity, transform;
  animation: hearthPulse 1.4s ease-in-out infinite alternate;
}

/* KEYFRAMES DA LABAREDA RESPONSIVA (16 FRAMES) */
@keyframes playFire {
  from {
    background-position: 0% 0;
  }
  to {
    background-position: 100% 0;
  }
}

/* KEYFRAMES DO PULSO DE LUZ DAS TOCHAS */
@keyframes lightPulse {
  0% {
    opacity: 0.55;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.88;
    transform: scale(1.06);
  }
  100% {
    opacity: 0.6;
    transform: scale(0.98);
  }
}

/* KEYFRAMES DA LAREIRA DO FUNDO */
@keyframes hearthPulse {
  0% {
    opacity: 0.65;
    transform: scale(0.95);
  }
  100% {
    opacity: 0.98;
    transform: scale(1.08);
  }
}

/* FAGULHAS (EMBERS) SUBINDO EM LOOP DA LAREIRA */
.spark {
  position: absolute;
  bottom: 15%;
  width: 2px;
  height: 2px;
  background: #ffea70;
  border-radius: 50%;
  box-shadow:
    0 0 3px #ffaa00,
    0 0 5px #ff4400;
  will-change: opacity, transform;
  animation: sparkRise 1.6s ease-out infinite;
}

.spark-1 {
  left: 28%;
  animation-delay: 0s;
  --drift: -4px;
}

.spark-2 {
  left: 42%;
  animation-delay: 0.4s;
  --drift: 4px;
}

.spark-3 {
  left: 56%;
  animation-delay: 0.8s;
  --drift: -3px;
}

.spark-4 {
  left: 70%;
  animation-delay: 1.2s;
  --drift: 5px;
}

@keyframes sparkRise {
  0% {
    opacity: 1;
    transform: translateY(0) translateX(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-35px) translateX(var(--drift, 6px)) scale(0.3);
  }
}
</style>
