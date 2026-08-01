<template>
  <div class="viewport" :class="{ 'is-mobile-view': isMobile }">
    <!-- OVERLAY DE TRANSIÇÃO DE LUZ (FADE DIEGÉTICO DURANTE CAMERA ZOOM) -->
    <div
      class="light-transition-overlay"
      :class="{ 'is-active': isTransitioning }"
    ></div>

    <!-- CONTAINER SAFE ZONE 16:9 (WORLD SPACE - PROPORÇÃO TRAVADA 16:9) -->
    <div
      class="safe-zone"
      :class="{
        'is-camera-hovering': isLeftArchHovered && !isTransitioning,
        'is-camera-zooming': isTransitioning,
      }"
      :style="{
        transformOrigin: zoomTransformOrigin,
      }"
    >
      <!-- IMAGEM DE FUNDO MASTER (5056x3392) ANCORADA NA SAFE-ZONE -->
      <img
        src="/imagens/Entrada-expandida.png"
        alt="Saguão da Guilda Master Background"
        class="master-bg"
      />

      <!-- CANVAS DE PARTÍCULAS & VFX (LAREIRA E POEIRA DOURADA 60 FPS) -->
      <GuildParticlesCanvas />

      <!-- CAMADA DE EFEITOS VISUAIS DE ILUMINAÇÃO & LABAREDAS 2D (VFX LAYER) -->
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

      <!-- NPCS VIVOS & BALÕES DE FALA -->
      <GuildNpcSpeechBubble v-if="!isMobile" />

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
              d="M 30 550 L 30 240 Q 30 90 160 90 Q 290 90 290 240 L 290 550 Z"
            />
          </clipPath>

          <!-- Gradiente Radial para Luz Interna Pulsante -->
          <radialGradient id="portal-glow-gradient" cx="16%" cy="45%" r="35%">
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
            :class="{ 'is-hovered': isLeftArchHovered }"
          />
        </g>

        <!-- PATH INTERATIVO DO ARCO DA ESQUERDA (NO PALCO PANORÂMICO) -->
        <path
          class="portal-arch-left"
          d="M 30 550 L 30 240 Q 30 90 160 90 Q 290 90 290 240 L 290 550 Z"
          @click="handleLeftArchClick"
          @mouseenter="onLeftArchHover"
          @mouseleave="onLeftArchLeave"
        />
      </svg>

      <!-- ETIQUETA FLUTUANTE DINÂMICA (⚔️ Mural de Missões) -->
      <div
        v-if="!isMobile"
        class="floating-arch-tag left-arch-tag"
        :class="{ 'is-visible': isLeftArchHovered }"
      >
        <div class="arch-tag-content">
          <UiWaxSeal color="red" size="sm" icon="⚔️" />
          <span class="arch-tag-text">Mural de Missões</span>
        </div>
      </div>

      <!-- HOTSPOTS DIEGÉTICOS (DIREITO, MESA E EASTER EGGS) -->
      <div v-if="!isMobile" class="diegetic-hotspots-layer">
        <!-- HOTSPOT DIREITO: BIBLIOTECA DE ARQUIVOS DE PROJETOS (/projects) -->
        <NuxtLink
          to="/projects"
          class="hotspot-area arch-library-area"
          @mouseenter="
            hoverTooltip = '📚 Acessar Biblioteca de Arquivos e Projetos'
          "
          @mouseleave="hoverTooltip = null"
        >
          <div class="hotspot-arch-glow glow-rune-blue"></div>
          <div class="hotspot-diegetic-label">
            <UiWaxSeal color="blue" size="sm" icon="📚" />
            <span class="label-title">Biblioteca de Arquivos</span>
          </div>
        </NuxtLink>

        <!-- WIDGET DO LIVRO ABERTO -->
        <div
          class="desk-book-widget-container"
          @click="openReception"
          @mouseenter="
            hoverTooltip = '📖 Clique para abrir Grimório Completo da Guilda'
          "
          @mouseleave="hoverTooltip = null"
        >
          <GuildDeskBookWidget />
        </div>

        <!-- EASTER EGG: ADAGA FINCADA NA MADEIRA -->
        <div
          class="hotspot-area dagger-easter-egg-area"
          :class="{ 'animate-dagger-shake': isDaggerShaking }"
          @click="triggerDaggerInteraction"
          @mouseenter="hoverTooltip = '🗡️ Testar a lâmina da adaga fincada'"
          @mouseleave="hoverTooltip = null"
        >
          <div class="dagger-highlight-aura"></div>
          <span v-if="isDaggerShaking" class="dagger-sparks">✨</span>
        </div>

        <!-- EASTER EGG: PILHA DE MOEDAS DE OURO -->
        <div
          class="hotspot-area coins-easter-egg-area"
          @click="triggerCoinsInteraction"
          @mouseenter="hoverTooltip = '🪙 Tocar moedas de ouro da guilda'"
          @mouseleave="hoverTooltip = null"
        >
          <div class="coins-highlight-aura"></div>
          <div
            v-for="pop in goldPopups"
            :key="pop.id"
            class="floating-gold-popup"
            :style="{ left: `${pop.x}px`, top: `${pop.y}px` }"
          >
            <span>+100 XP 🪙</span>
          </div>
        </div>
      </div>

      <!-- TOOLTIP DIEGÉTICO FLUTUANTE (DESKTOP) -->
      <Transition name="fade-tooltip">
        <div
          v-if="hoverTooltip && !isMobile && !isLeftArchHovered"
          class="diegetic-tooltip-container"
        >
          <UiParchmentCard class="tooltip-parchment-box">
            <span class="tooltip-text">{{ hoverTooltip }}</span>
          </UiParchmentCard>
        </div>
      </Transition>
    </div>

    <!-- CAMADA 3: HUD ANCORADO NA TELA FÍSICA (SCREEN SPACE - ANCHORS NOS 4 CANTOS) -->
    <div class="guild-hud-layer">
      <!-- BANNER SUPERIOR DE BOAS-VINDAS À GUILDA + MUTE CONTROL -->
      <header class="guild-top-banner">
        <div class="diegetic-banner-box">
          <span class="banner-icon">🏰</span>
          <div class="banner-text-group">
            <h1 class="banner-title">SAGUÃO CENTRAL DA GUILDA</h1>
            <span class="banner-subtitle"
              >Recepção de Aventureiros & Mural de Missões</span
            >
          </div>

          <!-- Botão Mute / Unmute Diegético -->
          <button
            class="audio-toggle-btn"
            :class="{ 'is-muted': isMuted }"
            @click="toggleMute"
            :title="
              isMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'
            "
          >
            <span>{{ isMuted ? "🔇" : "🔊" }}</span>
          </button>
        </div>
      </header>

      <!-- BARRA FLUTUANTE DE NAVEGAÇÃO DIÁRIA (MOBILE < 960px) -->
      <div v-if="isMobile" class="mobile-bottom-journal">
        <UiParchmentCard variant="scroll" class="journal-card-container">
          <div class="journal-header">
            <span>📜 Diário de Navegação da Guilda</span>
          </div>
          <div class="journal-buttons-grid">
            <NuxtLink
              to="/tasks"
              class="journal-btn"
              @click="playDoorOpenSound"
            >
              <UiWaxSeal color="red" size="sm" icon="⚔️" />
              <span>Missões</span>
            </NuxtLink>

            <NuxtLink
              to="/projects"
              class="journal-btn"
              @click="playDoorOpenSound"
            >
              <UiWaxSeal color="blue" size="sm" icon="📚" />
              <span>Arquivos</span>
            </NuxtLink>

            <div class="journal-btn" @click="openReception">
              <UiWaxSeal color="gold" size="sm" icon="📖" />
              <span>Grimório</span>
            </div>
          </div>
        </UiParchmentCard>
      </div>

      <!-- MODAL DIEGÉTICO DE METRICAS (GRIMÓRIO DE REGISTRO) -->
      <GuildReceptionDesk />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useResponsive } from "~/composables/ui/useResponsive";
import { useUiGuildStore } from "~/stores/uiGuild";
import { useTaskStore } from "~/stores/task";
import { useProjectStore } from "~/stores/project";
import { useGuildAudio } from "~/composables/ui/useGuildAudio";
import UiParchmentCard from "~/components/ui/diegetic/UiParchmentCard.vue";
import UiWaxSeal from "~/components/ui/diegetic/UiWaxSeal.vue";
import GuildReceptionDesk from "~/components/features/hall/GuildReceptionDesk.vue";
import GuildParticlesCanvas from "~/components/features/hall/GuildParticlesCanvas.vue";
import GuildNpcSpeechBubble from "~/components/features/hall/GuildNpcSpeechBubble.vue";
import GuildDeskBookWidget from "~/components/features/hall/GuildDeskBookWidget.vue";

definePageMeta({
  layout: false,
});

const router = useRouter();
const { isMobile } = useResponsive();
const uiGuildStore = useUiGuildStore();
const taskStore = useTaskStore();
const projectStore = useProjectStore();
const {
  isMuted,
  toggleMute,
  playSFX,
  playCoinsSound,
  playDaggerSound,
  playDoorOpenSound,
} = useGuildAudio();

// Estado da Animação de Transição (Camera Zoom)
const isTransitioning = ref(false);
const zoomTransformOrigin = ref("16% 45%");

// Estado de Hover do Arco da Esquerda (SVG Path)
const isLeftArchHovered = ref(false);

const hoverTooltip = ref<string | null>(null);
const isDaggerShaking = ref(false);

interface GoldPopup {
  id: number;
  x: number;
  y: number;
}
const goldPopups = ref<GoldPopup[]>([]);
let goldIdCounter = 0;

// Fundo limpo conforme especificação (/public/imagens/Entrada-expandida.png)
const backgroundImageUrl = computed(() => {
  return isMobile.value
    ? "/images/guild/Entrada-mobile.png"
    : "/imagens/Entrada-expandida.png";
});

// Eventos do Arco da Esquerda (Mural de Missões)
function onLeftArchHover() {
  isLeftArchHovered.value = true;
  if (!isTransitioning.value) {
    zoomTransformOrigin.value = "16% 45%";
  }
}

function onLeftArchLeave() {
  isLeftArchHovered.value = false;
}

// Clique no Arco da Esquerda -> Camera Zoom + SFX + Redirecionamento para /tasks
function handleLeftArchClick() {
  if (isTransitioning.value) return;

  isTransitioning.value = true;
  zoomTransformOrigin.value = "16% 45%";

  // SFX diegético de passos na pedra
  playSFX("footsteps-stone");

  // Timeline de 500ms antes da transição de rota
  setTimeout(() => {
    router.push("/tasks");
  }, 500);
}

function openReception() {
  playDoorOpenSound();
  uiGuildStore.openReceptionModal();
}

// Easter Egg: Adaga na Madeira
function triggerDaggerInteraction() {
  playDaggerSound();
  isDaggerShaking.value = true;
  setTimeout(() => {
    isDaggerShaking.value = false;
  }, 400);
}

// Easter Egg: Pilha de Moedas
function triggerCoinsInteraction(event: MouseEvent) {
  playCoinsSound();

  const id = ++goldIdCounter;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = event.clientX - rect.left - 20;
  const y = event.clientY - rect.top - 20;

  goldPopups.value.push({ id, x, y });

  setTimeout(() => {
    goldPopups.value = goldPopups.value.filter((p) => p.id !== id);
  }, 1200);
}

onMounted(() => {
  uiGuildStore.setActiveRoom("hall");
  taskStore.loadTasks?.();
  projectStore.loadProjects?.();
});
</script>

<style scoped>
/* VIEWPORT OUTER CONTAINER (100vw x 100vh) */
.viewport {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
  z-index: 100;
}

/* CONTAINER SAFE ZONE 16:9 (WORLD SPACE - PROPORÇÃO TRAVADA 16:9) */
.safe-zone {
  aspect-ratio: 16 / 9;
  position: relative;
  z-index: 2;
  width: 100vw;
  max-height: calc(100vw * 9 / 16);
  height: 100vh;
  max-width: calc(100vh * 16 / 9);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
  perspective-origin: 50% 50%;
  transform-style: preserve-3d;
  will-change: transform, filter;
  transition:
    transform 0.6s cubic-bezier(0.25, 1, 0.5, 1),
    filter 0.6s cubic-bezier(0.25, 1, 0.5, 1);
  overflow: visible;
}

/* IMAGEM MASTER (5056x3392) DE FUNDO PANORÂMICO COM ZOOM & BLEED OPEN-MATTE */
.master-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, 100vw);
  height: max(100%, 100vh);
  transform: translate(-50%, -50%) scale(1.7);
  transform-origin: 59.5% 66%;
  object-fit: cover;
  object-position: 59.5% 66%;
  pointer-events: none;
  z-index: 1;
  will-change: transform;
  transition: transform 0.3s ease;
}

/* Em telas mais altas/quadradas (4:3, Tablet, iPad - max-aspect-ratio: 1.5/1), reduz o zoom para 1.25x para conter a Safe Zone 16:9 sem cortes */
@media (max-aspect-ratio: 1.5/1) {
  .master-bg {
    transform: translate(-50%, -50%) scale(1.55);
  }
}

/* PRÉVIA DO GIRO DE CÂMERA 3D À DIREITA NO HOVER */
.safe-zone.is-camera-hovering {
  transform: scale(1.05) rotateY(-5deg) rotateX(1deg) rotateZ(0.2deg)
    translateZ(10px) translateX(-10px);
  filter: brightness(1.06) contrast(1.03);
}

/* ESTADO DE ZOOM E GIRO DE CÂMERA ESPACIAL 3D À DIREITA NO CLIQUE */
.safe-zone.is-camera-zooming {
  transform: scale(3.2) rotateY(-12deg) rotateX(3deg) rotateZ(1.5deg)
    translateZ(140px);
  filter: blur(5px) brightness(1.25);
  transition:
    transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* CAMADA 3: HUD ANCORADO NA TELA FÍSICA (SCREEN SPACE - ANCHORS NOS 4 CANTOS) */
.guild-hud-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}

/* OVERLAY DE ILUMINAÇÃO TRANSIÇÃO DE TELA (WHITE/GOLD FLASH FADE-IN) */
.light-transition-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(
    circle at 16% 45%,
    rgba(255, 235, 175, 0.95) 0%,
    rgba(255, 170, 60, 0.85) 50%,
    rgba(20, 10, 5, 0.95) 100%
  );
  opacity: 0;
  pointer-events: none;
  z-index: 99;
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.light-transition-overlay.is-active {
  opacity: 1;
  pointer-events: auto;
}

/* CAMADA DE EFEITOS VISUAIS DE ILUMINAÇÃO & LABAREDAS 2D (VFX LAYER) */
.vfx-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
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
  animation: playFire 1s steps(16) infinite;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 50% 50% 40% 40%;
  -webkit-mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 1) 18%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 1) 18%,
    rgba(0, 0, 0, 1) 100%
  );
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
  left: 6.4%;
  width: 5.5%;
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
  top: 40.5%;
  left: 22.9%;
  width: 2.2%;
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
  top: 34.2%;
  left: 34.9%;
  width: 3.6%;
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
  top: 34.2%;
  left: 65.5%;
  width: 3.8%;
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
  top: 25.8%;
  left: 46.7%;
  width: 1.2%;
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
  top: 25.8%;
  left: 54.65%;
  width: 1.2%;
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
  top: 40.8%;
  left: 46.5%;
  width: 1.2%;
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
  top: 40.8%;
  left: 54.25%;
  width: 1.2%;
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
  top: 23.7%;
  left: 40.4%;
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

/* LAREIRA AO FUNDO + LABAREDAS (.hearth-flames) */
.hearth-area.hearth-flames {
  position: absolute;
  top: 45.5%;
  left: 61%;
  width: 5.8%;
  aspect-ratio: 1 / 1;
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
  left: 20%;
  animation-delay: 0s;
  --drift: -8px;
}

.spark-2 {
  left: 45%;
  animation-delay: 0.4s;
  --drift: 6px;
}

.spark-3 {
  left: 70%;
  animation-delay: 0.8s;
  --drift: -4px;
}

.spark-4 {
  left: 85%;
  animation-delay: 1.2s;
  --drift: 10px;
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

/* BANNER DIEGÉTICO NO TOPO (HUD LAYER) */
.guild-top-banner {
  position: absolute;
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  pointer-events: auto;
}

.diegetic-banner-box {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 2.5px solid var(--guild-wood-mid, #5c3a1e);
  border-radius: 30px;
  padding: 0.5rem 1.6rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow:
    inset 0 0 15px rgba(110, 75, 40, 0.35),
    0 8px 24px rgba(0, 0, 0, 0.7);
}

.banner-icon {
  font-size: 1.6rem;
}

.banner-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.banner-title {
  font-family: var(--font-guild-title, serif);
  font-size: 1.25rem;
  color: var(--guild-wood-dark, #2b1810);
  margin: 0;
  line-height: 1.1;
  letter-spacing: 0.5px;
}

.banner-subtitle {
  font-size: 0.75rem;
  color: hsl(25, 35%, 30%);
  font-weight: 500;
}

.audio-toggle-btn {
  background: rgba(140, 95, 50, 0.2);
  border: 1.5px solid var(--guild-wood-mid, #5c3a1e);
  border-radius: 50%;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.audio-toggle-btn:hover {
  transform: scale(1.1);
  background: rgba(140, 95, 50, 0.4);
}

.audio-toggle-btn.is-muted {
  opacity: 0.6;
}

/* CAMADA SVG OVERLAY 16:9 PARA PRECISÃO NO VÃO DE PEDRA */
.guild-svg-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
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
  left: 16%;
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

/* CAMADA DE HOTSPOTS DIEGÉTICOS ADICIONAIS */
.diegetic-hotspots-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
}

.hotspot-area {
  position: absolute;
  cursor: pointer;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

/* BIBLIOTECA DE ARQUIVOS (PORTA DIREITA DA ARTE) */
.arch-library-area {
  top: 25%;
  right: 3%;
  width: 18%;
  height: 60%;
}

/* WIDGET DO LIVRO ABERTO (BALCÃO) */
.desk-book-widget-container {
  position: absolute;
  bottom: 19%;
  left: 64%;
  width: 12%;
  height: 16%;
  cursor: pointer;
  z-index: 8;
}

/* EASTER EGG: ADAGA FINCADA */
.dagger-easter-egg-area {
  bottom: 7%;
  left: 76%;
  width: 4%;
  height: 14%;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dagger-highlight-aura {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 215, 0, 0.05) 0%,
    transparent 75%
  );
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.dagger-easter-egg-area:hover .dagger-highlight-aura {
  opacity: 1;
}

.dagger-sparks {
  position: absolute;
  top: -15px;
  font-size: 1.6rem;
  animation: spark-fade 0.4s ease-out;
}

@keyframes spark-fade {
  0% {
    opacity: 1;
    transform: scale(0.8) translateY(0);
  }
  100% {
    opacity: 0;
    transform: scale(1.5) translateY(-20px);
  }
}

/* EASTER EGG: PILHA DE MOEDAS DE OURO */
.coins-easter-egg-area {
  bottom: 1%;
  left: 79.5%;
  width: 9%;
  height: 10%;
  z-index: 9;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}

.coins-highlight-aura {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 215, 0, 0.05) 0%,
    transparent 75%
  );
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.coins-easter-egg-area:hover .coins-highlight-aura {
  opacity: 1;
}

/* EFEITOS E ANIMAÇÕES DOS OUTROS HOTSPOTS */
.hotspot-arch-glow {
  position: absolute;
  inset: 0;
  border-radius: 40% 40% 0 0;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.arch-library-area:hover .hotspot-arch-glow {
  opacity: 1;
}

.hotspot-diegetic-label {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 2px solid var(--guild-wood-mid, #5c3a1e);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  transition:
    transform 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
  z-index: 2;
}

.arch-library-area:hover .hotspot-diegetic-label {
  transform: translateY(-6px) scale(1.06);
  border-color: var(--guild-blue-glow, #4fc3f7);
  box-shadow: 0 10px 24px rgba(40, 160, 230, 0.5);
}

.label-title {
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  font-size: 0.95rem;
}

/* ANIMAÇÃO SHAKE DE ADAGA */
@keyframes dagger-shake {
  0% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-10deg) scale(1.1);
  }
  50% {
    transform: rotate(10deg) scale(1.1);
  }
  75% {
    transform: rotate(-5deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.animate-dagger-shake {
  animation: dagger-shake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

/* ANIMATED FLOATING GOLD POPUP */
@keyframes float-up-gold {
  0% {
    opacity: 1;
    transform: translateY(0) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translateY(-40px) scale(1.15);
  }
}

.floating-gold-popup {
  position: absolute;
  pointer-events: none;
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.95rem;
  color: #fbbf24;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
  animation: float-up-gold 1.2s ease-out forwards;
  z-index: 50;
  white-space: nowrap;
}

/* TOOLTIP CONTAINER */
.diegetic-tooltip-container {
  position: absolute;
  bottom: 4%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
}

.tooltip-parchment-box {
  background: var(--guild-wood-dark, #1c140e) !important;
  color: var(--guild-parchment-base, #f4e4bc) !important;
  border: 1.5px solid var(--guild-gold-glow, #d4af37) !important;
  padding: 0.5rem 1.5rem !important;
  border-radius: 8px !important;
}

.tooltip-text {
  font-family: var(--font-guild-title, serif);
  font-size: 0.95rem;
  font-weight: bold;
}

/* BARRA FLUTUANTE DE NAVEGAÇÃO DIÁRIA (MOBILE) */
.mobile-bottom-journal {
  position: absolute;
  bottom: 1.25rem;
  left: 1rem;
  right: 1rem;
  z-index: 30;
}

.journal-card-container {
  padding: 0.75rem !important;
  border: 2px solid var(--guild-wood-mid, #5c3a1e) !important;
}

.journal-header {
  text-align: center;
  font-family: var(--font-guild-title, serif);
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  margin-bottom: 0.5rem;
}

.journal-buttons-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.journal-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(130, 85, 45, 0.3);
  border-radius: 6px;
  text-decoration: none;
  color: var(--guild-wood-dark, #2b1810);
  font-family: var(--font-guild-title, serif);
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
}

.journal-btn:active {
  background: rgba(255, 255, 255, 0.85);
  transform: scale(0.95);
}

.fade-tooltip-enter-active,
.fade-tooltip-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-tooltip-enter-from,
.fade-tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
