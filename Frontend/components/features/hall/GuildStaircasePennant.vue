<template>
  <div
    class="staircase-pennant-wrapper"
    :class="{ 'is-hovered': isHovered, 'is-zooming': isZooming }"
    @click="emit('click')"
    @mouseenter="emit('hover')"
    @mouseleave="emit('leave')"
  >
    <!-- SUPORTE SUPERIOR DE FERRO FORJADO & ANÉIS DE FIXAÇÃO -->
    <div class="iron-beam-bracket">
      <div class="iron-rod"></div>
      <div class="bracket-finial left-finial"></div>
      <div class="bracket-finial right-finial"></div>
      <div class="iron-ring left-ring"></div>
      <div class="iron-ring right-ring"></div>
    </div>

    <!-- FLÂMULA MEDIEVAL PENDURADA (SVG COM DETALHES, TEXTURA E BRILHO RÚNICO) -->
    <div class="pennant-cloth-container">
      <svg
        class="pennant-svg"
        viewBox="0 0 160 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <!-- Gradiente do Tecido de Veludo Real Carmesim / Borgonha -->
          <linearGradient
            id="pennant-fabric-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stop-color="#881337" />
            <stop offset="35%" stop-color="#9f1239" />
            <stop offset="70%" stop-color="#4c0519" />
            <stop offset="100%" stop-color="#2a0410" />
          </linearGradient>

          <!-- Gradiente Dourado Metálico para Bordas e Brasão -->
          <linearGradient
            id="gold-embroidery-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stop-color="#fef08a" />
            <stop offset="25%" stop-color="#facc15" />
            <stop offset="60%" stop-color="#ca8a04" />
            <stop offset="85%" stop-color="#eab308" />
            <stop offset="100%" stop-color="#854d0e" />
          </linearGradient>

          <!-- Gradiente de Brilho de Luz Rúnica -->
          <linearGradient
            id="shimmer-light-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
            <stop offset="50%" stop-color="#fef08a" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>

          <!-- Sombra Interna e Dobras do Tecido -->
          <linearGradient
            id="fabric-fold-shadow"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stop-color="#000000" stop-opacity="0.4" />
            <stop offset="25%" stop-color="#ffffff" stop-opacity="0.1" />
            <stop offset="50%" stop-color="#000000" stop-opacity="0.35" />
            <stop offset="75%" stop-color="#ffffff" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0.45" />
          </linearGradient>

          <!-- Filtro de Glow Dourado para o Brasão -->
          <filter
            id="pennant-gold-glow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <!-- Máscara de Recorte para Conter o Brilho Estritamente Dentro do Tecido da Flâmula -->
          <clipPath id="pennant-cloth-clip">
            <path d="M 15 10 L 145 10 L 145 200 L 80 248 L 15 200 Z" />
          </clipPath>
        </defs>

        <!-- SOMBRA PROJETADA NA PAREDE DA ESCADARIA -->
        <path
          d="M 18 14 L 142 14 L 142 205 L 80 252 L 18 205 Z"
          fill="rgba(0, 0, 0, 0.45)"
          filter="blur(4px)"
          transform="translate(4, 6)"
        />

        <!-- CORPO PRINCIPAL DA FLÂMULA (CORTE EM CAUDA DE ANDORINHA / PONTA DUPLA MEDIEVAL) -->
        <path
          class="pennant-base-cloth"
          d="M 15 10 L 145 10 L 145 200 L 80 248 L 15 200 Z"
          fill="url(#pennant-fabric-grad)"
        />

        <!-- DOBRAS REALISTAS DO TECIDO (ONDULAÇÃO EM PROFUNDIDADE) -->
        <path
          d="M 15 10 L 145 10 L 145 200 L 80 248 L 15 200 Z"
          fill="url(#fabric-fold-shadow)"
          mix-blend-mode="overlay"
        />

        <!-- MOLDURA / BORDADO DOURADO ORNAMENTADO -->
        <path
          d="M 22 16 L 138 16 L 138 193 L 80 236 L 22 193 Z"
          fill="none"
          stroke="url(#gold-embroidery-grad)"
          stroke-width="3"
          stroke-linejoin="round"
        />

        <!-- BORDAS INTERNAS DOURADAS DUPLAS (FILIGRANA) -->
        <path
          d="M 28 22 L 132 22 L 132 187 L 80 226 L 28 187 Z"
          fill="none"
          stroke="url(#gold-embroidery-grad)"
          stroke-width="1.2"
          stroke-opacity="0.75"
          stroke-dasharray="6 3"
        />

        <!-- ORNAMENTO SUPERIOR: TRÊS REBITES DOURADOS -->
        <circle cx="35" cy="16" r="2.5" fill="url(#gold-embroidery-grad)" />
        <circle cx="80" cy="16" r="3" fill="url(#gold-embroidery-grad)" />
        <circle cx="125" cy="16" r="2.5" fill="url(#gold-embroidery-grad)" />

        <!-- BRASÃO CENTRAL DA GUILDA: ASTROLÁBIO / CARTOGRAFIA / CALENDÁRIO COM GLOW -->
        <g class="pennant-crest" filter="url(#pennant-gold-glow)">
          <!-- Círculo Celestial Externo com Graus -->
          <circle
            cx="80"
            cy="95"
            r="32"
            fill="none"
            stroke="url(#gold-embroidery-grad)"
            stroke-width="2"
          />
          <circle
            cx="80"
            cy="95"
            r="26"
            fill="none"
            stroke="url(#gold-embroidery-grad)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />

          <!-- Estrela dos Ventos / Bússola Rúnica Central -->
          <!-- Pontas Cardeais -->
          <polygon
            points="80,68 83,92 80,89 77,92"
            fill="url(#gold-embroidery-grad)"
          />
          <polygon
            points="80,122 83,98 80,101 77,98"
            fill="url(#gold-embroidery-grad)"
          />
          <polygon
            points="53,95 77,92 74,95 77,98"
            fill="url(#gold-embroidery-grad)"
          />
          <polygon
            points="107,95 83,92 86,95 83,98"
            fill="url(#gold-embroidery-grad)"
          />

          <!-- Pontas Colaterais Finas -->
          <polygon
            points="62,77 78,93 75,95 77,91"
            fill="url(#gold-embroidery-grad)"
            opacity="0.8"
          />
          <polygon
            points="98,77 82,93 85,95 83,91"
            fill="url(#gold-embroidery-grad)"
            opacity="0.8"
          />
          <polygon
            points="62,113 78,97 75,95 77,99"
            fill="url(#gold-embroidery-grad)"
            opacity="0.8"
          />
          <polygon
            points="98,113 82,97 85,95 83,99"
            fill="url(#gold-embroidery-grad)"
            opacity="0.8"
          />

          <!-- Núcleo do Astrolábio: Sol & Lua Rúnicos -->
          <circle cx="80" cy="95" r="6.5" fill="url(#gold-embroidery-grad)" />
          <circle cx="80" cy="95" r="4" fill="#4c0519" />
          <circle cx="81" cy="94" r="2" fill="url(#gold-embroidery-grad)" />
        </g>

        <!-- RUNAS DE TEMPO & DIAS GRAVADAS (CARTOGRAFIA DA GUILDA) -->
        <g
          class="pennant-runes"
          stroke="url(#gold-embroidery-grad)"
          stroke-width="1.4"
          stroke-linecap="round"
          opacity="0.85"
        >
          <!-- Runa Superior Esquerda -->
          <path d="M 46 142 L 52 154 L 46 166 M 52 142 L 46 154" />
          <!-- Runa Central (Símbolo de Destino/Ampulheta) -->
          <path d="M 74 146 L 86 146 L 74 162 L 86 162 Z" />
          <!-- Runa Superior Direita -->
          <path d="M 114 142 L 108 154 L 114 166 M 108 142 L 114 154" />
        </g>

        <!-- PINGENTE DOURADO NA PONTA INFERIOR (TASSEL / BORLA DOURADA) -->
        <g class="pennant-tassel" transform="translate(0, 0)">
          <!-- Anel da borla -->
          <circle cx="80" cy="249" r="3.5" fill="url(#gold-embroidery-grad)" />
          <!-- Corpo da borla -->
          <polygon
            points="76,251 84,251 86,260 74,260"
            fill="url(#gold-embroidery-grad)"
          />
        </g>

        <!-- CAMADA DE SHIMMER DE LUZ INTERATIVO NO HOVER (RECORTADA NO FORMATO DO TECIDO) -->
        <g clip-path="url(#pennant-cloth-clip)">
          <rect
            class="pennant-shimmer-sweep"
            x="-160"
            y="0"
            width="160"
            height="260"
            fill="url(#shimmer-light-grad)"
            transform="skewX(-20)"
          />
        </g>
      </svg>
    </div>

    <!-- ETIQUETA DIEGÉTICA FLUTUANTE (📜 Calendário & Cartografia) -->
    <div class="floating-pennant-tag" :class="{ 'is-visible': isHovered }">
      <div class="tag-content">
        <span class="tag-icon">📜</span>
        <div class="tag-text-block">
          <span class="tag-title">Calendário & Eventos</span>
          <span class="tag-subtitle">Mezanino da Guilda</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isHovered?: boolean;
  isZooming?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "hover"): void;
  (e: "leave"): void;
}>();
</script>

<style scoped>
/* CONTAINER PRINCIPAL DO BANNER / FLÂMULA (POSICIONADO NO MEZANINO SOBRE A ESCADARIA) */
.staircase-pennant-wrapper {
  position: absolute;
  top: 26.8%;
  left: 46.5%;
  width: 4.4%;
  aspect-ratio: 160 / 260;
  transform: translateX(-50%);
  cursor: pointer;
  z-index: 6;
  perspective: 800px;
  user-select: none;
}

/* SUPER ULTRAWIDE COMPENSAÇÃO */
@media (min-aspect-ratio: 2.4/1) {
  .staircase-pennant-wrapper {
    transform: translateX(-50%) scale(1.05);
  }
}

/* SUPORTE DE FERRO FORJADO NO TOPO */
.iron-beam-bracket {
  position: absolute;
  top: -4px;
  left: -10%;
  width: 120%;
  height: 10px;
  z-index: 8;
  pointer-events: none;
}

.iron-rod {
  position: absolute;
  top: 3px;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(to bottom, #52525b 0%, #27272a 40%, #09090b 100%);
  border-radius: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.7);
}

.bracket-finial {
  position: absolute;
  top: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, #fef08a 0%, #ca8a04 60%, #713f12 100%);
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.5);
}

.left-finial {
  left: -4px;
}

.right-finial {
  right: -4px;
}

.iron-ring {
  position: absolute;
  top: 0px;
  width: 6px;
  height: 9px;
  border: 1.5px solid #a1a1aa;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.left-ring {
  left: 20%;
}

.right-ring {
  right: 20%;
}

/* CONTAINER DO TECIDO DA FLÂMULA COM BALANÇO DE PÊNDULO / VENTO */
.pennant-cloth-container {
  width: 100%;
  height: 100%;
  transform-origin: top center;
  will-change: transform, filter;
  animation: pennantIdleSway 4.2s ease-in-out infinite alternate;
  transition:
    filter 0.35s ease,
    transform 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.pennant-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* KEYFRAMES: BALANÇO SUAVE DE VENTO EM IDLE (@keyframes pennantIdleSway) */
@keyframes pennantIdleSway {
  0% {
    transform: rotateZ(-1.8deg) rotateY(4deg) skewX(-1deg);
  }
  50% {
    transform: rotateZ(0.8deg) rotateY(-2deg) skewX(0.5deg);
  }
  100% {
    transform: rotateZ(2.2deg) rotateY(-5deg) skewX(1.2deg);
  }
}

/* KEYFRAMES: BALANÇO VIGOROSO DE RAJADA DE VENTO AO FOCAR / HOVER (@keyframes pennantGustSway) */
@keyframes pennantGustSway {
  0% {
    transform: rotateZ(-5.5deg) rotateY(12deg) skewX(-3deg) scale(1.03);
  }
  30% {
    transform: rotateZ(4.8deg) rotateY(-10deg) skewX(2.5deg) scale(1.05);
  }
  60% {
    transform: rotateZ(-3.2deg) rotateY(8deg) skewX(-1.8deg) scale(1.04);
  }
  85% {
    transform: rotateZ(3.8deg) rotateY(-7deg) skewX(2deg) scale(1.04);
  }
  100% {
    transform: rotateZ(-4.5deg) rotateY(10deg) skewX(-2.5deg) scale(1.05);
  }
}

/* ESTADO DE FOCO / HOVER NA FLÂMULA E ESCADARIA */
.staircase-pennant-wrapper:hover .pennant-cloth-container,
.staircase-pennant-wrapper.is-hovered .pennant-cloth-container {
  animation: pennantGustSway 2.4s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 14px rgba(250, 204, 21, 0.75))
    drop-shadow(0 8px 18px rgba(0, 0, 0, 0.8));
}

/* BRILHO PULSANTE NO BRASÃO CENTRAL */
.pennant-crest {
  transition: filter 0.3s ease;
}

.staircase-pennant-wrapper:hover .pennant-crest,
.staircase-pennant-wrapper.is-hovered .pennant-crest {
  filter: drop-shadow(0 0 8px #fde047) drop-shadow(0 0 16px #eab308);
}

/* EFEITO DE VARREDURA DE LUZ NO TECIDO NO HOVER */
.pennant-shimmer-sweep {
  opacity: 0;
  pointer-events: none;
  mix-blend-mode: screen;
}

.staircase-pennant-wrapper:hover .pennant-shimmer-sweep,
.staircase-pennant-wrapper.is-hovered .pennant-shimmer-sweep {
  opacity: 1;
  animation: shimmerSweep 1.6s ease-in-out infinite;
}

@keyframes shimmerSweep {
  0% {
    transform: translateX(-120px) skewX(-20deg);
    opacity: 0;
  }
  40% {
    opacity: 0.8;
  }
  100% {
    transform: translateX(260px) skewX(-20deg);
    opacity: 0;
  }
}

/* ETIQUETA DIEGÉTICA FLUTUANTE */
.floating-pennant-tag {
  position: absolute;
  top: 104%;
  left: 50%;
  transform: translate(-50%, 8px) scale(0.92);
  opacity: 0;
  pointer-events: none;
  z-index: 20;
  transition:
    opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}

.floating-pennant-tag.is-visible {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.tag-content {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 1.5px solid var(--guild-gold-glow, #d4af37);
  border-radius: 8px;
  padding: 0.35rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.75),
    0 0 12px rgba(255, 215, 0, 0.35);
}

.tag-icon {
  font-size: 1.1rem;
}

.tag-text-block {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.tag-title {
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  font-size: 0.85rem;
}

.tag-subtitle {
  font-family: var(--font-guild-body, sans-serif);
  font-size: 0.65rem;
  color: #713f12;
  font-weight: 500;
}
</style>
