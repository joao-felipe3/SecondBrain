<template>
  <div>
    <!-- CAMADA DE OVERLAY SVG PARA ALINHAMENTO PRECISO (VIEWBOX 1000 x 562.5) -->
    <svg
      v-if="!isMobile"
      class="guild-svg-overlay"
      viewBox="0 0 1000 562.5"
      preserveAspectRatio="none"
    >
      <defs>
        <!-- ClipPath do Arco da Esquerda (Ajustado estritamente ao vão de pedra) -->
        <clipPath id="left-arch-clip">
          <path
            d="M 10 550 L 52 240 Q 52 116 144 116 Q 236 116 236 240 L 236 550 Z"
          />
        </clipPath>

        <!-- Gradiente Radial para Luz Interna Pulsante Suave -->
        <radialGradient id="portal-glow-gradient" cx="14.4%" cy="40%" r="30%">
          <stop offset="0%" stop-color="#ffe082" stop-opacity="0.7" />
          <stop offset="50%" stop-color="#ffb74d" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#f57c00" stop-opacity="0" />
        </radialGradient>

        <!-- Gradiente de Névoa Mágica Rúnica Suave -->
        <radialGradient id="portal-mist-gradient" cx="14.4%" cy="45%" r="35%">
          <stop offset="0%" stop-color="#ffd54f" stop-opacity="0.5" />
          <stop offset="45%" stop-color="#ff8f00" stop-opacity="0.25" />
          <stop offset="85%" stop-color="#bf360c" stop-opacity="0.1" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>

        <!-- Filter Nitido para Brilho Mágico de Runas (Blur Reduzido) -->
        <filter
          id="rune-glow-filter"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
        >
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- LUZ INTERNA & NÉVOA RÚNICA ANIMADA (CLIPADO NO PERFIL DO ARCO) -->
      <g clip-path="url(#left-arch-clip)">
        <!-- Luz Base Interna -->
        <rect
          x="0"
          y="0"
          width="1000"
          height="562.5"
          fill="url(#portal-glow-gradient)"
          class="arch-internal-glow"
          :class="{ 'is-hovered': isHovered }"
        />

        <!-- VÓRTICE DE NÉVOA RÚNICA (ATIVADO NO HOVER DO ARCO) -->
        <g class="runic-fog-group" :class="{ 'is-active': isHovered }">
          <ellipse
            cx="144"
            cy="320"
            rx="90"
            ry="160"
            fill="url(#portal-mist-gradient)"
            class="mist-layer mist-layer-1"
          />
          <ellipse
            cx="144"
            cy="280"
            rx="80"
            ry="140"
            fill="url(#portal-glow-gradient)"
            class="mist-layer mist-layer-2"
          />
        </g>
      </g>

      <!-- CONTORNO DE ENERGIA RÚNICA NÍTIDO NO PERFIL DA PEDRA -->
      <path
        class="portal-energy-contour"
        :class="{ 'is-active': isHovered }"
        d="M 44 460 L 40 240 Q 52 114 128 114 Q 200 128 200 240 L 200 390"
        fill="none"
        stroke="#ffe082"
        stroke-width="2"
        filter="url(#rune-glow-filter)"
      />

      <!-- PATH INTERATIVO DO ARCO DA ESQUERDA (ALINHADO AO VÃO) -->
      <path
        class="portal-arch-left"
        d="M 52 550 L 52 240 Q 52 116 144 116 Q 236 116 236 240 L 236 550 Z"
        @click="emit('click')"
        @mouseenter="handleMouseEnter"
        @mouseleave="emit('leave')"
      />
    </svg>

    <!-- ETIQUETA FLUTUANTE DINÂMICA (⚔️ Mural de Missões) -->
    <div
      v-if="!isMobile"
      class="floating-arch-tag left-arch-tag"
      :class="{ 'is-visible': isHovered }"
    >
      <div class="arch-tag-content">
        <UiWaxSeal color="red" size="sm" icon="⚔️" />
        <span class="arch-tag-text">Mural de Missões</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiWaxSeal from "~/components/ui/diegetic/UiWaxSeal.vue";
import { useGuildAudio } from "~/composables/ui/useGuildAudio";

defineProps<{
  isMobile: boolean;
  isHovered: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "hover"): void;
  (e: "leave"): void;
}>();

const { playPortalHumSound } = useGuildAudio();

function handleMouseEnter() {
  playPortalHumSound();
  emit("hover");
}
</script>

<style scoped>
/* CAMADA SVG OVERLAY 16:9 PARA PRECISÃO NO VÃO DE PEDRA */
.guild-svg-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  transition: transform 0.3s ease;
}

/* SUPER ULTRAWIDE (32:9, 5120x1440 e superior - min-aspect-ratio: 2.4/1): Sincroniza o portal com ancoragem 50% 50% e compensação de object-position */
@media (min-aspect-ratio: 2.4/1) {
  .guild-svg-overlay {
    transform: translate(9%, 22.5%) scale(1.353);
    transform-origin: 50% 50%;
  }
}

/* PATH INTERATIVO DO ARCO ESQUERDO */
.portal-arch-left {
  pointer-events: auto;
  fill: transparent;
  stroke: transparent;
  cursor: pointer;
}

/* LUZ INTERNA DIEGÉTICA NO ARCO DA ESQUERDA (SUAVE E SEM NEVOEIRO DENSE) */
.arch-internal-glow {
  opacity: 0;
  mix-blend-mode: screen;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.arch-internal-glow.is-hovered {
  opacity: 0.28;
  animation: hoverGlowPulse 2.4s ease-in-out infinite alternate;
}

@keyframes hoverGlowPulse {
  0% {
    opacity: 0.2;
    transform: translateY(0px);
  }
  50% {
    opacity: 0.35;
    transform: translateY(-2px);
  }
  100% {
    opacity: 0.25;
    transform: translateY(1px);
  }
}

/* CAMADA DE NÉVOA RÚNICA / PORTAL MÁGICO */
.runic-fog-group {
  opacity: 0;
  mix-blend-mode: screen;
  transition: opacity 0.45s ease-in-out;
  pointer-events: none;
}

.runic-fog-group.is-active {
  opacity: 0.45;
}

.mist-layer {
  transform-origin: 144px 320px;
}

.runic-fog-group.is-active .mist-layer-1 {
  animation: mistSwirlOne 6s ease-in-out infinite alternate;
}

.runic-fog-group.is-active .mist-layer-2 {
  animation: mistSwirlTwo 4.5s ease-in-out infinite alternate;
}

@keyframes mistSwirlOne {
  0% {
    transform: scale(0.96) rotate(-2deg) translateY(0px);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.05) rotate(3deg) translateY(-4px);
    opacity: 0.65;
  }
  100% {
    transform: scale(1.01) rotate(-1deg) translateY(2px);
    opacity: 0.45;
  }
}

@keyframes mistSwirlTwo {
  0% {
    transform: scale(1.02) rotate(2deg) translateY(2px);
    opacity: 0.3;
  }
  50% {
    transform: scale(0.95) rotate(-3deg) translateY(-3px);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.04) rotate(1deg) translateY(-1px);
    opacity: 0.35;
  }
}

/* CONTORNO DE ENERGIA RÚNICA NÍTIDO E FINO */
.portal-energy-contour {
  opacity: 0;
  stroke-dasharray: 800;
  stroke-dashoffset: 800;
  transition:
    opacity 0.4s ease,
    stroke-dashoffset 0.8s ease-in-out;
  pointer-events: none;
}

.portal-energy-contour.is-active {
  opacity: 0.9;
  stroke-dashoffset: 0;
  animation: contourPulse 2s ease-in-out infinite alternate;
}

@keyframes contourPulse {
  0% {
    stroke: #ffe082;
    stroke-width: 2;
  }
  100% {
    stroke: #ffd54f;
    stroke-width: 3;
  }
}

/* ETIQUETA FLUTUANTE DIEGÉTICA DO ARCO DA ESQUERDA (⚔️ Mural de Missões) */
.floating-arch-tag.left-arch-tag {
  position: absolute;
  top: 48%;
  left: 14.4%;
  transform: translate(-50%, calc(-50% + 12px));
  opacity: 0;
  pointer-events: none;
  z-index: 8;
  transition:
    opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-arch-tag.left-arch-tag.is-visible {
  opacity: 1;
  transform: translate(-50%, -50%);
}

.arch-tag-content {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 2px solid var(--guild-gold-glow, #d4af37);
  border-radius: 12px;
  padding: 0.5rem 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.7),
    0 0 16px rgba(255, 180, 50, 0.4);
}

.arch-tag-text {
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  font-size: 1.05rem;
  white-space: nowrap;
}
</style>
