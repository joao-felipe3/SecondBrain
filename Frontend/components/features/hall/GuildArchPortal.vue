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
        <!-- ClipPath do Arco da Esquerda (Posicionado no Vão Esquerdo do Saguão) -->
        <clipPath id="left-arch-clip">
          <path
            d="M 10 550 L 10 220 Q 65 55 175 55 Q 200 55 200 220 L 200 560 Z"
          />
        </clipPath>

        <!-- Gradiente Radial para Luz Interna Pulsante -->
        <radialGradient id="portal-glow-gradient" cx="17.5%" cy="45%" r="35%">
          <stop offset="0%" stop-color="#ffe082" stop-opacity="0.9" />
          <stop offset="50%" stop-color="#ffb74d" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#f57c00" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- LUZ INTERNA MOVIMENTADA (COLOR-DODGE CLIPADO NO PERFIL DO ARCO) -->
      <g clip-path="url(#left-arch-clip)">
        <rect
          x="0"
          y="0"
          width="1000"
          height="562.5"
          fill="url(#portal-glow-gradient)"
          class="arch-internal-glow"
          :class="{ 'is-hovered': isHovered }"
        />
      </g>

      <!-- PATH INTERATIVO DO ARCO DA ESQUERDA (NO PALCO PANORÂMICO) -->
      <path
        class="portal-arch-left"
        d="M 30 550 L 30 240 Q 30 90 160 90 Q 290 90 290 240 L 290 550 Z"
        @click="emit('click')"
        @mouseenter="emit('hover')"
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

defineProps<{
  isMobile: boolean;
  isHovered: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "hover"): void;
  (e: "leave"): void;
}>();
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

/* PATH INTERATIVO DO ARCO ESQUERDO (SEM DEBUG RÓTULOS/BORDAS) */
.portal-arch-left {
  pointer-events: auto;
  fill: transparent;
  stroke: transparent;
  cursor: pointer;
}

/* LUZ INTERNA DIEGÉTICA NO ARCO DA ESQUERDA (COLOR-DODGE PULSANTE) */
.arch-internal-glow {
  opacity: 0;
  mix-blend-mode: color-dodge;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.arch-internal-glow.is-hovered {
  opacity: 0.55;
  animation: hoverGlowPulse 2.4s ease-in-out infinite alternate;
}

@keyframes hoverGlowPulse {
  0% {
    opacity: 0.35;
    transform: translateY(0px);
  }
  50% {
    opacity: 0.65;
    transform: translateY(-4px);
  }
  100% {
    opacity: 0.4;
    transform: translateY(2px);
  }
}

/* ETIQUETA FLUTUANTE DIEGÉTICA DO ARCO DA ESQUERDA (⚔️ Mural de Missões) */
.floating-arch-tag.left-arch-tag {
  position: absolute;
  top: 48%;
  left: 17.5%;
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
