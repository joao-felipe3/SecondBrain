<template>
  <div class="guild-hall-fullscreen" :class="{ 'is-mobile-view': isMobile }">
    <!-- IMAGEM DE FUNDO DIEGÉTICA PANORÂMICA (100vw x 100vh) -->
    <div
      class="guild-background-canvas"
      :style="{ backgroundImage: `url(${backgroundImageUrl})` }"
    >
      <!-- CANVAS DE PARTÍCULAS & VFX (LAREIRA E POEIRA DOURADA 60 FPS) -->
      <GuildParticlesCanvas />

      <!-- CAMADA DE ILUMINAÇÃO AMBIENTAL -->
      <div class="ambient-overlay">
        <div class="fireplace-glow torch-flicker-effect"></div>
        <div class="wall-torch-glow torch-left torch-flicker-effect"></div>
        <div class="desk-candle-glow torch-flicker-effect"></div>
      </div>

      <!-- BANNER SUPERIOR DE BOAS-VINDAS À GUILDA + MUTE CONTROL -->
      <header class="guild-top-banner">
        <div class="diegetic-banner-box">
          <span class="banner-icon">🏰</span>
          <div class="banner-text-group">
            <h1 class="banner-title">SAGUÃO CENTRAL DA GUILDA</h1>
            <span class="banner-subtitle">Recepção de Aventureiros & Mural de Missões</span>
          </div>

          <!-- Botão Mute / Unmute Diegético -->
          <button
            class="audio-toggle-btn"
            :class="{ 'is-muted': isMuted }"
            @click="toggleMute"
            :title="isMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'"
          >
            <span>{{ isMuted ? '🔇' : '🔊' }}</span>
          </button>
        </div>
      </header>

      <!-- ESTANDARTE DE STREAK NA PAREDE (CENTRO) -->
      <GuildStreakBanner v-if="!isMobile" />

      <!-- NPCS VIVOS & BALÕES DE FALA (Dwarf & Elf no Centro) -->
      <GuildNpcSpeechBubble v-if="!isMobile" />

      <!-- HOTSPOTS DIEGÉTICOS PRECISAMENTE POSICIONADOS (DESKTOP >= 960px) -->
      <div v-if="!isMobile" class="diegetic-hotspots-layer">
        <!-- 1. HOTSPOT ESQUERDO: MURAL DE CONTRATOS DA GUILDA (/task) -->
        <NuxtLink
          to="/task"
          class="hotspot-area arch-contracts-area"
          @mouseenter="onArchHover('📜 Acessar Mural de Contratos e Missões')"
          @mouseleave="hoverTooltip = null"
        >
          <div class="hotspot-arch-glow glow-rune-gold"></div>
          <div class="hotspot-diegetic-label">
            <UiWaxSeal color="red" size="sm" icon="📜" />
            <span class="label-title">Mural de Contratos</span>
          </div>
        </NuxtLink>

        <!-- 2. HOTSPOT DIREITO: BIBLIOTECA DE ARQUIVOS DE PROJETOS (/projects) -->
        <NuxtLink
          to="/projects"
          class="hotspot-area arch-library-area"
          @mouseenter="onArchHover('📚 Acessar Biblioteca de Arquivos e Projetos')"
          @mouseleave="hoverTooltip = null"
        >
          <div class="hotspot-arch-glow glow-rune-blue"></div>
          <div class="hotspot-diegetic-label">
            <UiWaxSeal color="blue" size="sm" icon="📚" />
            <span class="label-title">Biblioteca de Arquivos</span>
          </div>
        </NuxtLink>

        <!-- 3. WIDGET DO LIVRO ABERTO INTEGRADO À ARTE DO BALCÃO -->
        <div
          class="desk-book-widget-container"
          @click="openReception"
          @mouseenter="hoverTooltip = '📖 Clique para abrir Grimório Completo da Guilda'"
          @mouseleave="hoverTooltip = null"
        >
          <GuildDeskBookWidget />
        </div>

        <!-- 4. EASTER EGG: ADAGA FINCADA NA MADEIRA (SOBRE A ARTE DA MESA) -->
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

        <!-- 5. EASTER EGG: PILHA DE MOEDAS DE OURO (SOBRE A ARTE DA MESA) -->
        <div
          class="hotspot-area coins-easter-egg-area"
          @click="triggerCoinsInteraction"
          @mouseenter="hoverTooltip = '🪙 Tocar moedas de ouro da guilda'"
          @mouseleave="hoverTooltip = null"
        >
          <div class="coins-highlight-aura"></div>
          <!-- Partículas de Gold Flutuante subindo -->
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
        <div v-if="hoverTooltip && !isMobile" class="diegetic-tooltip-container">
          <UiParchmentCard class="tooltip-parchment-box">
            <span class="tooltip-text">{{ hoverTooltip }}</span>
          </UiParchmentCard>
        </div>
      </Transition>

      <!-- BARRA DE COMPACTAÇÃO E NAVEGAÇÃO DIÁRIA (MOBILE < 960px) -->
      <div v-if="isMobile" class="mobile-bottom-journal">
        <UiParchmentCard variant="scroll" class="journal-card-container">
          <div class="journal-header">
            <span>📜 Diário de Navegação da Guilda</span>
          </div>
          <div class="journal-buttons-grid">
            <NuxtLink to="/task" class="journal-btn" @click="playDoorOpenSound">
              <UiWaxSeal color="red" size="sm" icon="📜" />
              <span>Contratos</span>
            </NuxtLink>

            <NuxtLink to="/projects" class="journal-btn" @click="playDoorOpenSound">
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
import { ref, computed, onMounted } from 'vue'
import { useResponsive } from '~/composables/ui/useResponsive'
import { useUiGuildStore } from '~/stores/uiGuild'
import { useTaskStore } from '~/stores/task'
import { useProjectStore } from '~/stores/project'
import { useGuildAudio } from '~/composables/ui/useGuildAudio'
import UiParchmentCard from '~/components/ui/diegetic/UiParchmentCard.vue'
import UiWaxSeal from '~/components/ui/diegetic/UiWaxSeal.vue'
import GuildReceptionDesk from '~/components/features/hall/GuildReceptionDesk.vue'
import GuildParticlesCanvas from '~/components/features/hall/GuildParticlesCanvas.vue'
import GuildNpcSpeechBubble from '~/components/features/hall/GuildNpcSpeechBubble.vue'
import GuildDeskBookWidget from '~/components/features/hall/GuildDeskBookWidget.vue'
import GuildStreakBanner from '~/components/features/hall/GuildStreakBanner.vue'

definePageMeta({
  layout: false
})

const { isMobile } = useResponsive()
const uiGuildStore = useUiGuildStore()
const taskStore = useTaskStore()
const projectStore = useProjectStore()
const {
  isMuted,
  toggleMute,
  playCoinsSound,
  playDaggerSound,
  playDoorOpenSound
} = useGuildAudio()

const hoverTooltip = ref<string | null>(null)
const isDaggerShaking = ref(false)

interface GoldPopup {
  id: number
  x: number
  y: number
}
const goldPopups = ref<GoldPopup[]>([])
let goldIdCounter = 0

const backgroundImageUrl = computed(() => {
  return isMobile.value
    ? '/images/guild/Entrada-mobile.png'
    : '/images/guild/Entrada-web.png'
})

function onArchHover(tooltip: string) {
  hoverTooltip.value = tooltip
}

function openReception() {
  playDoorOpenSound()
  uiGuildStore.openReceptionModal()
}

// Easter Egg: Adaga na Madeira
function triggerDaggerInteraction() {
  playDaggerSound()
  isDaggerShaking.value = true
  setTimeout(() => {
    isDaggerShaking.value = false
  }, 400)
}

// Easter Egg: Pilha de Moedas
function triggerCoinsInteraction(event: MouseEvent) {
  playCoinsSound()

  const id = ++goldIdCounter
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left - 20
  const y = event.clientY - rect.top - 20

  goldPopups.value.push({ id, x, y })

  setTimeout(() => {
    goldPopups.value = goldPopups.value.filter((p) => p.id !== id)
  }, 1200)
}

onMounted(() => {
  uiGuildStore.setActiveRoom('hall')
  taskStore.loadTasks?.()
  projectStore.loadProjects?.()
})
</script>

<style scoped>
.guild-hall-fullscreen {
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background-color: var(--guild-wood-dark);
  z-index: 100;
}

.guild-background-canvas {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  position: relative;
}

/* OVERLAYS DE ILUMINAÇÃO AMBIENTAL */
.ambient-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.fireplace-glow {
  position: absolute;
  top: 35%;
  left: 60%;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 120, 20, 0.32) 0%,
    rgba(255, 60, 0, 0.14) 50%,
    transparent 75%
  );
}

.wall-torch-glow.torch-left {
  position: absolute;
  top: 30%;
  left: 4%;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 150, 30, 0.35) 0%,
    transparent 70%
  );
}

.desk-candle-glow {
  position: absolute;
  bottom: 8%;
  right: 12%;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 180, 50, 0.28) 0%,
    transparent 70%
  );
}

/* BANNER DIEGÉTICO NO TOPO */
.guild-top-banner {
  position: absolute;
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.diegetic-banner-box {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base) 0%,
    var(--guild-parchment-dark) 100%
  );
  border: 2.5px solid var(--guild-wood-mid);
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
  font-family: var(--font-guild-title);
  font-size: 1.25rem;
  color: var(--guild-wood-dark);
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
  border: 1.5px solid var(--guild-wood-mid);
  border-radius: 50%;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
  transition: transform 0.2s ease, background 0.2s ease;
}

.audio-toggle-btn:hover {
  transform: scale(1.1);
  background: rgba(140, 95, 50, 0.4);
}

.audio-toggle-btn.is-muted {
  opacity: 0.6;
}

/* CAMADA DE HOTSPOTS DIEGÉTICOS */
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

/* 1. MURAL DE CONTRATOS (ARCO ESQUERDO DA ARTE) */
.arch-contracts-area {
  top: 25%;
  left: 3%;
  width: 25%;
  height: 70%;
}

/* 2. BIBLIOTECA DE ARQUIVOS (PORTA DIREITA DA ARTE) */
.arch-library-area {
  top: 25%;
  right: 3%;
  width: 18%;
  height: 60%;
}

/* 3. WIDGET DO LIVRO ABERTO (POSICIONADO EXATAMENTE SOBRE O LIVRO DO BALCÃO NO CANTO INFERIOR DIREITO) */
.desk-book-widget-container {
  position: absolute;
  bottom: 19%;
  left: 64%;
  width: 12%;
  height: 16%;
  cursor: pointer;
  z-index: 8;
}

/* 4. EASTER EGG: ADAGA FINCADA NA MADEIRA (POSICIONADO EXATAMENTE SOBRE A ADAGA DA MESA NO CANTO INFERIOR DIREITO) */
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
  0% { opacity: 1; transform: scale(0.8) translateY(0); }
  100% { opacity: 0; transform: scale(1.5) translateY(-20px); }
}

/* 5. EASTER EGG: PILHA DE MOEDAS DE OURO (POSICIONADO EXATAMENTE SOBRE AS MOEDAS DO BALCÃO NO CANTO INFERIOR DIREITO) */
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

/* EFEITOS E ANIMAÇÕES */
.hotspot-arch-glow {
  position: absolute;
  inset: 0;
  border-radius: 40% 40% 0 0;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.arch-contracts-area:hover .hotspot-arch-glow,
.arch-library-area:hover .hotspot-arch-glow {
  opacity: 1;
}

.hotspot-diegetic-label {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base) 0%,
    var(--guild-parchment-dark) 100%
  );
  border: 2px solid var(--guild-wood-mid);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  z-index: 2;
}

.arch-contracts-area:hover .hotspot-diegetic-label {
  transform: translateY(-6px) scale(1.06);
  border-color: var(--guild-gold-glow);
  box-shadow: 0 10px 24px rgba(230, 170, 40, 0.5);
}

.arch-library-area:hover .hotspot-diegetic-label {
  transform: translateY(-6px) scale(1.06);
  border-color: var(--guild-blue-glow);
  box-shadow: 0 10px 24px rgba(40, 160, 230, 0.5);
}

.label-title {
  font-family: var(--font-guild-title);
  font-weight: bold;
  color: var(--guild-wood-dark);
  font-size: 0.95rem;
}

/* ANIMAÇÃO SHAKE DE ADAGA */
@keyframes dagger-shake {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg) scale(1.1); }
  50% { transform: rotate(10deg) scale(1.1); }
  75% { transform: rotate(-5deg); }
  100% { transform: rotate(0deg); }
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
  font-family: var(--font-guild-title);
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
  background: var(--guild-wood-dark) !important;
  color: var(--guild-parchment-base) !important;
  border: 1.5px solid var(--guild-gold-glow) !important;
  padding: 0.5rem 1.5rem !important;
  border-radius: 8px !important;
}

.tooltip-text {
  font-family: var(--font-guild-title);
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
  border: 2px solid var(--guild-wood-mid) !important;
}

.journal-header {
  text-align: center;
  font-family: var(--font-guild-title);
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--guild-wood-dark);
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
  color: var(--guild-wood-dark);
  font-family: var(--font-guild-title);
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
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-tooltip-enter-from,
.fade-tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
