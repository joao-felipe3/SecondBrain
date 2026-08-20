<template>
  <div v-if="!isMobile" class="diegetic-hotspots-layer">
    <!-- HOTSPOT CENTRAL: ESCADARIA & MEZANINO (CARTOGRAFIA / CALENDÁRIO -> /calendar) -->
    <div
      class="staircase-hotspot-zone"
      :class="{ 'is-active': isStairsHovered }"
      @click="onStairsClick"
      @mouseenter="onStairsHover"
      @mouseleave="onStairsLeave"
    >
      <!-- ILUMINAÇÃO DIEGÉTICA NO ARCO DO MEZANINO AO FOCAR A ESCADARIA -->
      <div class="staircase-mezzanine-glow"></div>
      <div class="staircase-arch-halo"></div>
    </div>

    <!-- FLÂMULA PENDURADA NO MEZANINO BALANÇANDO AO FOCAR A ESCADARIA -->
    <GuildStaircasePennant
      :is-hovered="isStairsHovered"
      :is-zooming="isTransitioning"
      @hover="onStairsHover"
      @leave="onStairsLeave"
      @click="onStairsClick"
    />

    <!-- HOTSPOT DIREITO: PORTAL ANIMADO DA BIBLIOTECA DA GUILDA (/projects) -->
    <GuildLibraryPortal
      :is-transitioning="isTransitioning"
      @hover="onLibraryHover"
      @leave="onLibraryLeave"
      @door-click="onLibraryClick"
    />

    <!-- WIDGET DO LIVRO ABERTO -->
    <div
      class="desk-book-widget-container"
      @click="emit('openReception')"
      @mouseenter="
        emit(
          'updateTooltip',
          '📖 Clique para abrir Grimório Completo da Guilda',
        )
      "
      @mouseleave="emit('updateTooltip', null)"
    >
      <GuildDeskBookWidget />
    </div>

    <!-- EASTER EGG: ADAGA FINCADA NA MADEIRA -->
    <div
      class="hotspot-area dagger-easter-egg-area"
      :class="{ 'animate-dagger-shake': isDaggerShaking }"
      @click="triggerDaggerInteraction"
      @mouseenter="emit('updateTooltip', '🗡️ Testar a lâmina da adaga fincada')"
      @mouseleave="emit('updateTooltip', null)"
    >
      <div class="dagger-highlight-aura"></div>
      <span v-if="isDaggerShaking" class="dagger-sparks">✨</span>
    </div>

    <!-- EASTER EGG: PILHA DE MOEDAS DE OURO -->
    <div
      class="hotspot-area coins-easter-egg-area"
      @click="triggerCoinsInteraction"
      @mouseenter="emit('updateTooltip', '🪙 Tocar moedas de ouro da guilda')"
      @mouseleave="emit('updateTooltip', null)"
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
</template>

<script setup lang="ts">
import { ref } from "vue";
import UiWaxSeal from "~/components/ui/diegetic/UiWaxSeal.vue";
import GuildDeskBookWidget from "~/components/features/hall/GuildDeskBookWidget.vue";
import GuildLibraryPortal from "~/components/features/hall/GuildLibraryPortal.vue";
import GuildStaircasePennant from "~/components/features/hall/GuildStaircasePennant.vue";
import { useGuildAudio } from "~/composables/ui/useGuildAudio";

defineProps<{
  isMobile: boolean;
  isTransitioning?: boolean;
}>();

const emit = defineEmits<{
  (e: "openReception"): void;
  (e: "updateTooltip", tooltip: string | null): void;
  (e: "rightDoorHover"): void;
  (e: "rightDoorLeave"): void;
  (e: "rightDoorClick"): void;
  (e: "stairsHover"): void;
  (e: "stairsLeave"): void;
  (e: "stairsClick"): void;
}>();

const { playCoinsSound, playDaggerSound } = useGuildAudio();

const isStairsHovered = ref(false);

function onStairsHover() {
  isStairsHovered.value = true;
  emit("updateTooltip", "📜 Mezanino da Guilda: Calendário & Cartografia");
  emit("stairsHover");
}

function onStairsLeave() {
  isStairsHovered.value = false;
  emit("updateTooltip", null);
  emit("stairsLeave");
}

function onStairsClick() {
  emit("stairsClick");
}

function onLibraryHover() {
  emit("updateTooltip", "📜 Acessar Biblioteca de Arquivos e Projetos");
  emit("rightDoorHover");
}

function onLibraryLeave() {
  emit("updateTooltip", null);
  emit("rightDoorLeave");
}

function onLibraryClick() {
  emit("rightDoorClick");
}

const isDaggerShaking = ref(false);

interface GoldPopup {
  id: number;
  x: number;
  y: number;
}
const goldPopups = ref<GoldPopup[]>([]);
let goldIdCounter = 0;

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
</script>

<style scoped>
/* CAMADA DE HOTSPOTS DIEGÉTICOS ADICIONAIS */
.diegetic-hotspots-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  transition: transform 0.3s ease;
}

/* SUPER ULTRAWIDE (32:9, 5120x1440 e superior - min-aspect-ratio: 2.4/1): Sincroniza os hotspots com ancoragem 50% 50% e compensação de object-position */
@media (min-aspect-ratio: 2.4/1) {
  .diegetic-hotspots-layer {
    transform: translate(9%, 22.5%) scale(1.353);
    transform-origin: 50% 50%;
  }
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

/* HOTSPOT CENTRAL: ESCADARIA & MEZANINO (/calendar) */
.staircase-hotspot-zone {
  position: absolute;
  top: 13%;
  left: 41.5%;
  width: 12.6%;
  height: 25%;
  cursor: pointer;
  z-index: 5;
  overflow: visible;
  transition: all 0.3s ease;
}

/* BRILHO AMBIENTE DIFUSO DO MEZANINO (SEM CORTES RETANGULARES) */
.staircase-mezzanine-glow {
  position: absolute;
  top: -30%;
  left: -60%;
  width: 220%;
  height: 180%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 120% 100% at 50% 45%,
    rgba(255, 215, 80, 0.32) 0%,
    rgba(245, 158, 11, 0.18) 35%,
    rgba(217, 119, 6, 0.07) 65%,
    transparent 100%
  );
  opacity: 0;
  filter: blur(28px);
  mix-blend-mode: screen;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

/* FOCO / NÚCLEO RADIAL SUAVE NO ARCO SUPERIOR */
.staircase-arch-halo {
  position: absolute;
  top: -10%;
  left: -20%;
  width: 140%;
  height: 110%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 30%,
    rgba(254, 240, 138, 0.42) 0%,
    rgba(250, 204, 21, 0.2) 30%,
    rgba(234, 179, 8, 0.06) 60%,
    transparent 100%
  );
  opacity: 0;
  filter: blur(18px);
  mix-blend-mode: screen;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.staircase-hotspot-zone:hover .staircase-mezzanine-glow,
.staircase-hotspot-zone.is-active .staircase-mezzanine-glow,
.staircase-hotspot-zone:hover .staircase-arch-halo,
.staircase-hotspot-zone.is-active .staircase-arch-halo {
  opacity: 1;
  animation: mezzanineLightPulse 2.8s ease-in-out infinite alternate;
}

@keyframes mezzanineLightPulse {
  0% {
    transform: scale(0.97);
    opacity: 0.85;
  }
  100% {
    transform: scale(1.03);
    opacity: 1;
  }
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
</style>
