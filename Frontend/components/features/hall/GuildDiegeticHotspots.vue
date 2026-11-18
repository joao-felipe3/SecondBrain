<template>
  <div class="diegetic-hotspots-layer">
    <!-- HOTSPOT CENTRAL: ESCADARIA & MEZANINO (CARTOGRAFIA / CALENDÁRIO -> /calendar) -->
    <div
      class="staircase-hotspot-zone"
      :class="{ 'is-active': isStairsActive }"
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
      :is-hovered="isStairsActive"
      :is-zooming="isTransitioning"
      @hover="onStairsHover"
      @leave="onStairsLeave"
      @click="onStairsClick"
    />

    <!-- HOTSPOT DIREITO: PORTAL ANIMADO DA BIBLIOTECA DA GUILDA (/projects) -->
    <GuildLibraryPortal
      :is-mobile="isMobile"
      :is-transitioning="isTransitioning"
      :force-open="isRightDoorHovered"
      @hover="onLibraryHover"
      @leave="onLibraryLeave"
      @door-click="onLibraryClick"
    />

    <!-- EASTER EGG: CANECA DE HIDROMEL NA MESA -->
    <div
      class="hotspot-area mead-easter-egg-area"
      :class="{ 'animate-mead-toast': isMeadToasting }"
      @click="triggerMeadInteraction"
      @mouseenter="emit('updateTooltip', '🍺 Brindar com Caneca de Hidromel')"
      @mouseleave="emit('updateTooltip', null)"
    >
      <span v-if="isMeadToasting" class="mead-foam-bubbles">🍺✨ Saúde!</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import GuildLibraryPortal from '~/components/features/hall/GuildLibraryPortal.vue';
import GuildStaircasePennant from '~/components/features/hall/GuildStaircasePennant.vue';
import { useGuildAudio } from '~/composables/ui/useGuildAudio';

const props = defineProps<{
  isMobile: boolean;
  isTransitioning?: boolean;
  isRightDoorHovered?: boolean;
  isStairsHovered?: boolean;
}>();

const emit = defineEmits<{
  (e: 'openReception'): void;
  (e: 'updateTooltip', tooltip: string | null): void;
  (e: 'rightDoorHover'): void;
  (e: 'rightDoorLeave'): void;
  (e: 'rightDoorClick'): void;
  (e: 'stairsHover'): void;
  (e: 'stairsLeave'): void;
  (e: 'stairsClick'): void;
}>();

const { playCoinsSound, playPennantFlutterSound } = useGuildAudio();

const isStairsHoveredLocal = ref(false);
const isStairsActive = computed(() => isStairsHoveredLocal.value || Boolean(props.isStairsHovered));

function onStairsHover() {
  if (props.isMobile) return;
  isStairsHoveredLocal.value = true;
  playPennantFlutterSound();
  emit('updateTooltip', '📜 Mezanino da Guilda: Calendário & Cartografia');
  emit('stairsHover');
}

function onStairsLeave() {
  if (props.isMobile) return;
  isStairsHoveredLocal.value = false;
  emit('updateTooltip', null);
  emit('stairsLeave');
}

function onStairsClick() {
  isStairsHoveredLocal.value = true;
  playPennantFlutterSound();
  emit('stairsClick');
}

function onLibraryHover() {
  if (props.isMobile) return;
  emit('updateTooltip', '📜 Acessar Biblioteca de Arquivos e Projetos');
  emit('rightDoorHover');
}

function onLibraryLeave() {
  if (props.isMobile) return;
  emit('updateTooltip', null);
  emit('rightDoorLeave');
}

function onLibraryClick() {
  emit('rightDoorClick');
}

const isMeadToasting = ref(false);

// Easter Egg: Caneca de Hidromel
function triggerMeadInteraction() {
  playCoinsSound();
  isMeadToasting.value = true;
  setTimeout(() => {
    isMeadToasting.value = false;
  }, 900);
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
  /* a camada cobre a cena inteira: sem isso ela engolia o mouse das vinhetas e da folha de missões */
  pointer-events: none;
}

.staircase-hotspot-zone,
.hotspot-area,
.diegetic-hotspots-layer :deep(.staircase-pennant-wrapper) {
  pointer-events: auto;
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
  -webkit-tap-highlight-color: transparent;
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
  -webkit-tap-highlight-color: transparent;
}

/* BRILHO AMBIENTE DIFUSO DO MEZANINO (SUAVE E DIEGÉTICO) */
.staircase-mezzanine-glow {
  position: absolute;
  top: -35%;
  left: -65%;
  width: 230%;
  height: 190%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 120% 100% at 50% 45%,
    rgba(255, 215, 80, 0.16) 0%,
    rgba(245, 158, 11, 0.08) 35%,
    rgba(217, 119, 6, 0.02) 65%,
    transparent 100%
  );
  opacity: 0;
  filter: blur(36px);
  mix-blend-mode: screen;
  transition: opacity 0.45s ease;
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
    rgba(254, 240, 138, 0.2) 0%,
    rgba(250, 204, 21, 0.09) 30%,
    rgba(234, 179, 8, 0.02) 60%,
    transparent 100%
  );
  opacity: 0;
  filter: blur(22px);
  mix-blend-mode: screen;
  transition: opacity 0.45s ease;
  pointer-events: none;
}

.staircase-hotspot-zone:hover .staircase-mezzanine-glow,
.staircase-hotspot-zone.is-active .staircase-mezzanine-glow,
.staircase-hotspot-zone:hover .staircase-arch-halo,
.staircase-hotspot-zone.is-active .staircase-arch-halo {
  opacity: 1;
  animation: mezzanineLightPulse 3s ease-in-out infinite alternate;
}

@keyframes mezzanineLightPulse {
  0% {
    transform: scale(0.98);
    opacity: 0.65;
  }
  100% {
    transform: scale(1.02);
    opacity: 0.9;
  }
}

/* EASTER EGG: CANECA DE HIDROMEL NA MESA */
.mead-easter-egg-area {
  top: 108%;
  left: 25%;
  width: 7%;
  height: 14%;
  z-index: 9;
}

.mead-foam-bubbles {
  position: absolute;
  top: -22px;
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.9rem;
  color: #fef08a;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  pointer-events: none;
  animation: float-up-gold 0.9s ease-out forwards;
}

/* SUBIDA DO "SAÚDE!" DA CANECA */
@keyframes float-up-gold {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.85);
  }
  20% {
    opacity: 1;
    transform: translateY(-8px) scale(1.1);
  }
  80% {
    opacity: 1;
    transform: translateY(-38px) scale(1.02);
  }
  100% {
    opacity: 0;
    transform: translateY(-56px) scale(0.95);
  }
}
</style>
