<template>
  <div
    class="staircase-pennant-wrapper"
    :class="{ 'is-hovered': isHovered, 'is-zooming': isZooming }"
    @click="emit('click')"
    @mouseenter="onMouseEnter"
    @mouseleave="emit('leave')"
  >
    <!-- FLÂMULA MEDIEVAL ILUSTRADA INTEGRADA À ARTE DO CENÁRIO -->
    <div class="pennant-cloth-container">
      <svg
        class="pennant-svg"
        viewBox="0 0 160 270"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <!-- Gradiente da Madeira da Haste (Carvalho Natural) -->
          <linearGradient id="rod-wood-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3d1804" />
            <stop offset="50%" stop-color="#5c2b0c" />
            <stop offset="100%" stop-color="#7a3a10" />
          </linearGradient>

          <!-- Gradiente do Tecido: Terracota Nobre Rústico (Mais Quente e Iluminado na Base/Direita) -->
          <linearGradient
            id="pennant-fabric-grad"
            x1="15%"
            y1="10%"
            x2="100%"
            y2="90%"
          >
            <stop offset="0%" stop-color="#731912" />
            <stop offset="35%" stop-color="#872218" />
            <stop offset="70%" stop-color="#9a2a1d" />
            <stop offset="100%" stop-color="#ab3222" />
          </linearGradient>

          <!-- Gradiente da Borda: Ouro Nobre Medieval (Levemente Mais Claro) -->
          <linearGradient
            id="gold-trim-grad"
            x1="10%"
            y1="10%"
            x2="100%"
            y2="90%"
          >
            <stop offset="0%" stop-color="#854d0e" />
            <stop offset="35%" stop-color="#b45309" />
            <stop offset="70%" stop-color="#d97706" />
            <stop offset="100%" stop-color="#eab308" />
          </linearGradient>

          <!-- Iluminação Pulsante da Lareira: Incidente de Baixo-Direita (Lareira no Térreo) -->
          <linearGradient
            id="fireplace-flicker-grad"
            x1="100%"
            y1="100%"
            x2="20%"
            y2="15%"
          >
            <stop offset="0%" stop-color="#f97316" stop-opacity="0.42" />
            <stop offset="35%" stop-color="#ea580c" stop-opacity="0.22" />
            <stop offset="75%" stop-color="#9a3412" stop-opacity="0.05" />
            <stop offset="100%" stop-color="#7c2d12" stop-opacity="0" />
          </linearGradient>

          <!-- Dobras Cel-Shading Suaves e Discretas -->
          <linearGradient
            id="fabric-folds-ambient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stop-color="#2a0602" stop-opacity="0.45" />
            <stop offset="25%" stop-color="#2a0602" stop-opacity="0.1" />
            <stop offset="50%" stop-color="#2a0602" stop-opacity="0.35" />
            <stop offset="75%" stop-color="#2a0602" stop-opacity="0.1" />
            <stop offset="100%" stop-color="#2a0602" stop-opacity="0.2" />
          </linearGradient>

          <!-- Gradiente de Brilho Suave de Shimmer no Hover -->
          <linearGradient
            id="shimmer-light-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
            <stop offset="25%" stop-color="#fed7aa" stop-opacity="0.08" />
            <stop offset="50%" stop-color="#fef08a" stop-opacity="0.22" />
            <stop offset="75%" stop-color="#fed7aa" stop-opacity="0.08" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>

          <!-- Recorte do Tecido para Conter o Brilho -->
          <clipPath id="pennant-cloth-clip">
            <path d="M 18 34 L 142 34 L 142 208 L 80 252 L 18 208 Z" />
          </clipPath>
        </defs>

        <!-- 1. HASTE DE SUSTENTAÇÃO EM MADEIRA ENTALHADA (ROD) -->
        <g class="banner-wooden-rod">
          <!-- Corpo da haste de madeira com iluminação natural -->
          <rect
            x="8"
            y="12"
            width="144"
            height="11"
            rx="4"
            fill="url(#rod-wood-grad)"
            stroke="#26140c"
            stroke-width="2"
          />
          <!-- Frisos e texturas de entalhe na madeira -->
          <line
            x1="20"
            y1="15"
            x2="140"
            y2="15"
            stroke="#d97706"
            stroke-opacity="0.4"
            stroke-width="1"
          />
          <line
            x1="14"
            y1="19"
            x2="146"
            y2="19"
            stroke="#1c0a02"
            stroke-width="1.2"
          />

          <!-- Ponteira Esquerda (Finial com anel dourado) -->
          <ellipse
            cx="8"
            cy="17.5"
            rx="5"
            ry="7"
            fill="#b45309"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="5"
            cy="17.5"
            r="3"
            fill="#4a2007"
            stroke="#26140c"
            stroke-width="1.5"
          />

          <!-- Ponteira Direita (Finial em latão dourado quente) -->
          <ellipse
            cx="152"
            cy="17.5"
            rx="5"
            ry="7"
            fill="#eab308"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="155"
            cy="17.5"
            r="3"
            fill="#78350f"
            stroke="#26140c"
            stroke-width="1.5"
          />
        </g>

        <!-- 2. ALÇAS / TIRAS DE COURO QUE ENVOLVEM A HASTE (4 STRAPS) -->
        <g class="hanging-loops">
          <!-- Alça 1 -->
          <rect
            x="25"
            y="8"
            width="13"
            height="28"
            rx="3"
            fill="#602808"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="31.5"
            cy="27"
            r="1.5"
            fill="#eab308"
            stroke="#26140c"
            stroke-width="1"
          />

          <!-- Alça 2 -->
          <rect
            x="57"
            y="8"
            width="13"
            height="28"
            rx="3"
            fill="#70320a"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="63.5"
            cy="27"
            r="1.5"
            fill="#eab308"
            stroke="#26140c"
            stroke-width="1"
          />

          <!-- Alça 3 -->
          <rect
            x="89"
            y="8"
            width="13"
            height="28"
            rx="3"
            fill="#803c0e"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="95.5"
            cy="27"
            r="1.5"
            fill="#eab308"
            stroke="#26140c"
            stroke-width="1"
          />

          <!-- Alça 4 -->
          <rect
            x="121"
            y="8"
            width="13"
            height="28"
            rx="3"
            fill="#924712"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="127.5"
            cy="27"
            r="1.5"
            fill="#eab308"
            stroke="#26140c"
            stroke-width="1"
          />
        </g>

        <!-- 3. CORPO PRINCIPAL DO ESTANDARTE (MOLDURA DOURADA NOBRE) -->
        <path
          class="pennant-base-trim"
          d="M 18 30 L 142 30 L 142 208 L 80 252 L 18 208 Z"
          fill="url(#gold-trim-grad)"
          stroke="#26140c"
          stroke-width="2.5"
          stroke-linejoin="round"
        />

        <!-- COSTURA INTERNA NA MOLDURA -->
        <path
          d="M 23 35 L 137 35 L 137 204 L 80 245 L 23 204 Z"
          fill="none"
          stroke="#5c2605"
          stroke-width="1.2"
          stroke-dasharray="4 2.5"
          stroke-opacity="0.75"
        />

        <!-- 4. CAMPO INTERNO DE TECIDO VERMELHO-TERRACOTA -->
        <path
          class="pennant-inner-field"
          d="M 27 38 L 133 38 L 133 200 L 80 238 L 27 200 Z"
          fill="url(#pennant-fabric-grad)"
          stroke="#26140c"
          stroke-width="2"
          stroke-linejoin="round"
        />

        <!-- DOBRAS AMBIENTAIS CEL-SHADING -->
        <path
          d="M 27 38 L 133 38 L 133 200 L 80 238 L 27 200 Z"
          fill="url(#fabric-folds-ambient)"
          mix-blend-mode="multiply"
        />

        <!-- CAMADA DE ILUMINAÇÃO PULSANTE DA CHAMA DA LAREIRA (ANIMADA VIA CSS) -->
        <path
          class="hearth-pulsing-light"
          d="M 27 38 L 133 38 L 133 200 L 80 238 L 27 200 Z"
          fill="url(#fireplace-flicker-grad)"
          mix-blend-mode="soft-light"
        />

        <!-- 6. BRASÃO CENTRAL ILUSTRADO: ASTROLÁBIO & CARTOGRAFIA DA GUILDA -->
        <g class="pennant-crest">
          <!-- Círculo Celestial Externo com Traço Ilustrado -->
          <circle
            cx="80"
            cy="104"
            r="33"
            fill="none"
            stroke="#26140c"
            stroke-width="3"
          />
          <circle
            cx="80"
            cy="104"
            r="33"
            fill="none"
            stroke="url(#gold-trim-grad)"
            stroke-width="1.8"
          />

          <!-- Anel Interno Rúnico -->
          <circle
            cx="80"
            cy="104"
            r="26"
            fill="none"
            stroke="#26140c"
            stroke-width="1.8"
          />
          <circle
            cx="80"
            cy="104"
            r="26"
            fill="none"
            stroke="#eab308"
            stroke-width="1.15"
            stroke-dasharray="3 3"
          />

          <!-- Rosa dos Ventos / Bússola Rúnica Central (Linhas de Tinta + Dourado Quente) -->
          <!-- Ponta Norte -->
          <polygon
            points="80,75 84,101 80,98 76,101"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.4"
          />
          <!-- Ponta Sul -->
          <polygon
            points="80,133 84,107 80,110 76,107"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.4"
          />
          <!-- Ponta Oeste -->
          <polygon
            points="51,104 77,100 74,104 77,108"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.4"
          />
          <!-- Ponta Leste -->
          <polygon
            points="109,104 83,100 86,104 83,108"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.4"
          />

          <!-- Pontas Diagonais / Colaterais Estilizadas -->
          <polygon
            points="60,84 78,102 75,104 77,100"
            fill="#d97706"
            stroke="#26140c"
            stroke-width="1"
          />
          <polygon
            points="100,84 82,102 85,104 83,100"
            fill="#d97706"
            stroke="#26140c"
            stroke-width="1"
          />
          <polygon
            points="60,124 78,106 75,104 77,108"
            fill="#d97706"
            stroke="#26140c"
            stroke-width="1"
          />
          <polygon
            points="100,124 82,106 85,104 83,108"
            fill="#d97706"
            stroke="#26140c"
            stroke-width="1"
          />

          <!-- Núcleo do Astrolábio: Disco Solar & Lunar -->
          <circle
            cx="80"
            cy="104"
            r="7"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.6"
          />
          <circle
            cx="80"
            cy="104"
            r="4.2"
            fill="#540a17"
            stroke="#26140c"
            stroke-width="1.2"
          />
          <circle cx="81.2" cy="103" r="1.8" fill="#fbbf24" />
        </g>

        <!-- 7. SÍMBOLOS RÚNICOS DE TEMPO & DIAS GRAVADOS NA PARTE INFERIOR -->
        <g
          class="pennant-runes"
          stroke="url(#gold-trim-grad)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <!-- Runa Ampulheta / Ciclo de Tempo Central -->
          <path d="M 74 154 L 86 154 L 74 172 L 86 172 Z" />
          <line x1="77" y1="163" x2="83" y2="163" />

          <!-- Runa Lunar Esquerda -->
          <path d="M 46 150 L 53 163 L 46 176" />
          <line x1="53" y1="163" x2="43" y2="163" />

          <!-- Runa Solar Direita -->
          <path d="M 114 150 L 107 163 L 114 176" />
          <line x1="107" y1="163" x2="117" y2="163" />
        </g>

        <!-- 8. PINGENTE / BORLA DOURADA NA PONTA INFERIOR (TASSEL MEDIEVAL) -->
        <g class="pennant-tassel">
          <!-- Anel de fixação -->
          <circle
            cx="80"
            cy="254"
            r="4"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.6"
          />
          <!-- Corpo da borla -->
          <polygon
            points="75,257 85,257 88,268 72,268"
            fill="url(#gold-trim-grad)"
            stroke="#26140c"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <!-- Fios da borla -->
          <line
            x1="76"
            y1="258"
            x2="74"
            y2="267"
            stroke="#92400e"
            stroke-width="1"
          />
          <line
            x1="84"
            y1="258"
            x2="86"
            y2="267"
            stroke="#92400e"
            stroke-width="1"
          />
        </g>

        <!-- 9. CAMADA DE SHIMMER SEDOSO NO HOVER (RECORTADA NO FORMATO DO TECIDO) -->
        <g clip-path="url(#pennant-cloth-clip)">
          <rect
            class="pennant-shimmer-sweep"
            x="-160"
            y="0"
            width="160"
            height="270"
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
import { useGuildAudio } from "~/composables/ui/useGuildAudio";

defineProps<{
  isHovered?: boolean;
  isZooming?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "hover"): void;
  (e: "leave"): void;
}>();

const { playPennantFlutterSound } = useGuildAudio();

function onMouseEnter() {
  playPennantFlutterSound();
  emit("hover");
}
</script>

<style scoped>
/* CONTAINER PRINCIPAL DO BANNER / FLÂMULA (POSICIONADO NO MEZANINO SOBRE A ESCADARIA) */
.staircase-pennant-wrapper {
  position: absolute;
  top: 26.2%;
  left: 46.5%;
  width: 4.5%;
  aspect-ratio: 160 / 270;
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

/* ILUMINAÇÃO ORGÂNICA PULSANTE DA CHAMA DA LAREIRA */
.hearth-pulsing-light {
  animation: hearthLightFlicker 2.4s ease-in-out infinite alternate;
  will-change: opacity;
  pointer-events: none;
}

@keyframes hearthLightFlicker {
  0% {
    opacity: 0.65;
  }
  30% {
    opacity: 0.9;
  }
  60% {
    opacity: 0.72;
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0.75;
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
  filter: drop-shadow(0 0 16px rgba(245, 158, 11, 0.35));
}

/* BRILHO PULSANTE NO BRASÃO CENTRAL (DIFUSO E DELICADO) */
.pennant-crest {
  transition: filter 0.3s ease;
}

.staircase-pennant-wrapper:hover .pennant-crest,
.staircase-pennant-wrapper.is-hovered .pennant-crest {
  filter: drop-shadow(0 0 8px rgba(254, 240, 138, 0.5))
    drop-shadow(0 0 18px rgba(234, 179, 8, 0.28));
}

/* EFEITO DE VARREDURA DE LUZ NO TECIDO NO HOVER (SEDOSO E MACIO) */
.pennant-shimmer-sweep {
  opacity: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  filter: blur(4px);
}

.staircase-pennant-wrapper:hover .pennant-shimmer-sweep,
.staircase-pennant-wrapper.is-hovered .pennant-shimmer-sweep {
  opacity: 1;
  animation: shimmerSweep 2.2s ease-in-out infinite;
}

@keyframes shimmerSweep {
  0% {
    transform: translateX(-160px) skewX(-20deg);
    opacity: 0;
  }
  30% {
    opacity: 0.75;
  }
  70% {
    opacity: 0.75;
  }
  100% {
    transform: translateX(300px) skewX(-20deg);
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
