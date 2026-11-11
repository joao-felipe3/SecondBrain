<template>
  <div class="viewport" :class="{ 'is-mobile-view': isMobile }">
    <!-- OVERLAY DE TRANSIÇÃO DE LUZ (FADE DIEGÉTICO DURANTE CAMERA ZOOM) -->
    <div class="light-transition-overlay" :class="{ 'is-active': isTransitioning }"></div>

    <!-- CONTAINER SAFE ZONE 16:9 (WORLD SPACE - PROPORÇÃO TRAVADA 16:9) -->
    <div
      class="safe-zone"
      :class="{
        'is-camera-hovering':
          (isLeftArchHovered || isRightDoorHovered || isStairsHovered) && !isTransitioning,
        'is-camera-zooming': isTransitioning,
      }"
      :style="{
        transformOrigin: zoomTransformOrigin,
      }"
    >
      <!-- IMAGEM DE FUNDO MASTER (DESKTOP 16:9 / MOBILE PORTRAIT) -->
      <img :src="backgroundImageUrl" alt="Saguão da Guilda Master Background" class="master-bg" />

      <!-- CANVAS DE PARTÍCULAS & VFX (LAREIRA E POEIRA DOURADA 60 FPS) -->
      <GuildParticlesCanvas :is-mobile="isMobile" />

      <!-- CAMADA DE EFEITOS VISUAIS DE ILUMINAÇÃO & LABAREDAS 2D (VFX LAYER) -->
      <GuildVfxLayer :is-mobile="isMobile" />

      <!-- VIDA NA CENA (primeiro plano): silhuetas que ficam na frente do fogo/tochas do GuildVfxLayer -->
      <GuildSceneSpace :hidden="isMobile || isPortrait" :z-index="5">
        <GuildNpcLayer layer="foreground" />
        <!-- caminhantes passam na frente das tochas e das vinhetas -->
        <GuildWalkerLayer @update-tooltip="(msg) => (hoverTooltip = msg)" />
      </GuildSceneSpace>

      <!-- VIDA NA CENA: contêiner alinhado à imagem de fundo (frações da imagem); só desktop -->
      <GuildSceneSpace :hidden="isMobile || isPortrait">
        <GuildNpcLayer @update-tooltip="(msg) => (hoverTooltip = msg)" />
      </GuildSceneSpace>

      <!-- NPCS VIVOS & BALÕES DE FALA -->
      <GuildNpcSpeechBubble :is-mobile="isMobile" />

      <!-- ARCO DA ESQUERDA (MURAL DE MISSÕES) -->
      <GuildArchPortal
        :is-mobile="isMobile"
        :is-hovered="isLeftArchHovered"
        @click="handleLeftArchClick"
        @hover="onLeftArchHover"
        @leave="onLeftArchLeave"
      />

      <!-- HOTSPOTS DIEGÉTICOS (BIBLIOTECA, ESCADARIA/FLÂMULA, WIDGET DO LIVRO, EASTER EGGS) -->
      <GuildDiegeticHotspots
        :is-mobile="isMobile"
        :is-transitioning="isTransitioning"
        :is-right-door-hovered="isRightDoorHovered"
        :is-stairs-hovered="isStairsHovered"
        @open-reception="openReception"
        @right-door-hover="onRightDoorHover"
        @right-door-leave="onRightDoorLeave"
        @right-door-click="handleRightDoorClick"
        @stairs-hover="onStairsHover"
        @stairs-leave="onStairsLeave"
        @stairs-click="handleStairsClick"
        @update-tooltip="(msg) => (hoverTooltip = msg)"
      />

      <!-- TOOLTIP DIEGÉTICO FLUTUANTE (DESKTOP) -->
      <Transition name="fade-tooltip">
        <div v-if="hoverTooltip && !isMobile && !isLeftArchHovered" class="diegetic-tooltip-container">
          <UiParchmentCard class="tooltip-parchment-box">
            <span class="tooltip-text">{{ hoverTooltip }}</span>
          </UiParchmentCard>
        </div>
      </Transition>
    </div>

    <!-- CAMADA 3: HUD ANCORADO NA TELA FÍSICA (SCREEN SPACE) -->
    <div class="guild-hud-layer">
      <!-- BANNER SUPERIOR DE BOAS-VINDAS À GUILDA + MUTE CONTROL -->
      <GuildTopBanner :is-muted="isMuted" @toggle-mute="toggleMute" />

      <!-- BARRA FLUTUANTE DE NAVEGAÇÃO DIÁRIA (MOBILE) -->
      <GuildMobileJournal
        :is-mobile="isMobile"
        @open-reception="openReception"
        @play-door-open="playDoorOpenSound"
        @navigate-tasks="handleLeftArchClick"
        @navigate-projects="handleRightDoorClick"
        @navigate-calendar="handleStairsClick"
      />

      <!-- MODAL DIEGÉTICO DE METRICAS (GRIMÓRIO DE REGISTRO) -->
      <GuildReceptionDesk />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useResponsive } from '~/composables/ui/useResponsive';
import { useUiGuildStore } from '~/stores/uiGuild';
import { useTaskStore } from '~/stores/task';
import { useProjectStore } from '~/stores/project';
import { useGuildAudio } from '~/composables/ui/useGuildAudio';

import UiParchmentCard from '~/components/ui/diegetic/UiParchmentCard.vue';
import GuildParticlesCanvas from '~/components/features/hall/GuildParticlesCanvas.vue';
import GuildVfxLayer from '~/components/features/hall/GuildVfxLayer.vue';
import GuildSceneSpace from '~/components/features/hall/GuildSceneSpace.vue';
import GuildNpcLayer from '~/components/features/hall/GuildNpcLayer.vue';
import GuildWalkerLayer from '~/components/features/hall/GuildWalkerLayer.vue';
import GuildNpcSpeechBubble from '~/components/features/hall/GuildNpcSpeechBubble.vue';
import GuildArchPortal from '~/components/features/hall/GuildArchPortal.vue';
import GuildDiegeticHotspots from '~/components/features/hall/GuildDiegeticHotspots.vue';
import GuildTopBanner from '~/components/features/hall/GuildTopBanner.vue';
import GuildMobileJournal from '~/components/features/hall/GuildMobileJournal.vue';
import GuildReceptionDesk from '~/components/features/hall/GuildReceptionDesk.vue';

definePageMeta({
  layout: false,
});

const router = useRouter();
const { isMobile, isPortrait } = useResponsive();
const uiGuildStore = useUiGuildStore();
const taskStore = useTaskStore();
const projectStore = useProjectStore();
const { isMuted, toggleMute, playSFX, playDoorOpenSound, playPortalHumSound, playPennantFlutterSound } =
  useGuildAudio();

// Estado da Animação de Transição (Camera Zoom)
const isTransitioning = ref(false);
const zoomTransformOrigin = ref('16% 45%');

// Estado de Hover/Ativação do Arco da Esquerda (SVG Path)
const isLeftArchHovered = ref(false);
// Estado de Hover/Ativação da Escadaria Central / Mezanino (Flâmula & Calendário)
const isStairsHovered = ref(false);
// Estado de Hover/Ativação do Portal da Direita (Biblioteca)
const isRightDoorHovered = ref(false);
const hoverTooltip = ref<string | null>(null);

// Fundo limpo conforme orientação (Retrato/Mobile -> Entrada-mobile.png, Horizontal -> Entrada-expandida.png)
const backgroundImageUrl = computed(() => {
  return isMobile.value || isPortrait.value
    ? '/imagens/Entrada-mobile.png'
    : '/imagens/Entrada-expandida.png';
});

// Eventos do Arco da Esquerda (Mural de Missões)
function onLeftArchHover() {
  isLeftArchHovered.value = true;
  if (!isTransitioning.value) {
    zoomTransformOrigin.value = '16% 45%';
  }
}

function onLeftArchLeave() {
  if (!isTransitioning.value) {
    isLeftArchHovered.value = false;
  }
}

// Clique/Toque no Arco da Esquerda -> Portal Glow + Camera Zoom + SFX + Redirecionamento para /tasks
function handleLeftArchClick() {
  if (isTransitioning.value) return;

  isLeftArchHovered.value = true;
  isTransitioning.value = true;
  zoomTransformOrigin.value = isMobile.value ? '16% 52%' : '16% 45%';

  if (isMobile.value) {
    playPortalHumSound();
  }
  playSFX('footsteps-stone');

  setTimeout(() => {
    router.push('/tasks');
  }, 600);
}

// Eventos da Escadaria Central / Mezanino (Cartografia & Calendário)
function onStairsHover() {
  isStairsHovered.value = true;
  if (!isTransitioning.value) {
    zoomTransformOrigin.value = '48% 25%';
  }
}

function onStairsLeave() {
  if (!isTransitioning.value) {
    isStairsHovered.value = false;
  }
}

function handleStairsClick() {
  if (isTransitioning.value) return;

  isStairsHovered.value = true;
  isTransitioning.value = true;
  zoomTransformOrigin.value = isMobile.value ? '47% 28%' : '48% 25%';

  if (isMobile.value) {
    playPennantFlutterSound();
  }
  playSFX('footsteps-stone');

  setTimeout(() => {
    router.push('/calendar');
  }, 600);
}

// Eventos da Porta da Direita (Biblioteca de Arquivos & Projetos)
function onRightDoorHover() {
  isRightDoorHovered.value = true;
  if (!isTransitioning.value) {
    zoomTransformOrigin.value = '85% 45%';
  }
}

function onRightDoorLeave() {
  if (!isTransitioning.value) {
    isRightDoorHovered.value = false;
  }
}

function handleRightDoorClick() {
  if (isTransitioning.value) return;

  isRightDoorHovered.value = true;
  isTransitioning.value = true;
  zoomTransformOrigin.value = isMobile.value ? '82% 52%' : '85% 45%';

  if (isMobile.value) {
    playDoorOpenSound(500);
  }
  playSFX('footsteps-stone');

  // Aguarda a abertura dos 9 frames da porta + camera zoom antes de redirecionar para /projects
  setTimeout(() => {
    router.push('/projects');
  }, 650);
}

function openReception() {
  playDoorOpenSound();
  uiGuildStore.openReceptionModal();
}

onMounted(() => {
  uiGuildStore.setActiveRoom('hall');
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
  inset: 0;
  width: 100%;
  height: 100%;
  transform: scale(1.7);
  transform-origin: 59.5% 66%;
  object-fit: cover;
  object-position: 59.5% 66%;
  pointer-events: none;
  z-index: 1;
  will-change: transform;
  transition: transform 0.3s ease;
}

/* SUPER ULTRAWIDE (32:9, 5120x1440 e superior - min-aspect-ratio: 2.4/1): Zoom maior para preencher a largura extrema com ancoragem centralizada 50% 50% */
@media (min-aspect-ratio: 2.4/1) {
  .master-bg {
    transform: scale(2.3);
    transform-origin: 50% 50%;
    object-position: 50% 50%;
  }
}

/* MODO MOBILE E PORTRAIT: MANTÉM O PALCO 16:9 DOS ELEMENTOS DIEGÉTICOS SINCRONIZADO 1:1 COM ENTRADA-MOBILE.PNG (1376x3072) */
.viewport.is-mobile-view .safe-zone {
  --mob-cover-w: max(100vw, calc(100vh * 1376 / 3072));
  width: calc(var(--mob-cover-w) * 1.09775);
  height: auto;
  max-width: none;
  max-height: none;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  left: calc(var(--mob-cover-w) * 0.0529);
  top: calc(var(--mob-cover-w) * -0.06);
}

.viewport.is-mobile-view .master-bg {
  inset: auto;
  left: -0.364%;
  top: -170.422%;
  width: 91.096%;
  height: 361.558%;
  transform: none;
  object-fit: fill;
}

@media (orientation: portrait) {
  .safe-zone {
    --mob-cover-w: max(100vw, calc(100vh * 1376 / 3072));
    width: calc(var(--mob-cover-w) * 1.09775);
    height: auto;
    max-width: none;
    max-height: none;
    aspect-ratio: 16 / 9;
    flex-shrink: 0;
    left: calc(var(--mob-cover-w) * 0.0529);
    top: calc(var(--mob-cover-w) * -0.06);
  }
  .master-bg {
    inset: auto;
    left: -0.364%;
    top: -170.422%;
    width: 91.096%;
    height: 361.558%;
    transform: none;
    object-fit: fill;
  }
}

/* PRÉVIA DO GIRO DE CÂMERA 3D À DIREITA NO HOVER */
.safe-zone.is-camera-hovering {
  transform: scale(1.05) rotateY(-5deg) rotateX(1deg) rotateZ(0.2deg) translateZ(10px) translateX(-10px);
  filter: brightness(1.06) contrast(1.03);
}

/* ESTADO DE ZOOM E GIRO DE CÂMERA ESPACIAL 3D À DIREITA NO CLIQUE */
.safe-zone.is-camera-zooming {
  transform: scale(3.2) rotateY(-12deg) rotateX(3deg) rotateZ(1.5deg) translateZ(140px);
  filter: blur(5px) brightness(1.25);
  transition:
    transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.viewport.is-mobile-view .safe-zone.is-camera-zooming {
  transform: scale(2.4) rotateY(-6deg) rotateX(2deg) translateZ(80px);
  filter: blur(3px) brightness(1.2);
}

/* CAMADA 3: HUD ANCORADO NA TELA FÍSICA (SCREEN SPACE) */
.guild-hud-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px)
    env(safe-area-inset-left, 0px);
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
