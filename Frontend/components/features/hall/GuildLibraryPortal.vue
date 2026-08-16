<template>
  <!-- Wrapper da zona da biblioteca -->
  <div ref="wrapperRef" class="library-portal-wrapper">
    <!-- CAMADA 1: Efeito de Vazamento de Luz Omnidirecional com Desvanecimento por Distância -->
    <div
      class="golden-light-leak"
      :class="{ 'is-active': currentFrame > 0 }"
      :style="lightLeakStyle"
    >
      <!-- Brilho Omnidirecional Volumétrico (Radiante em 360 graus com Falloff Suave) -->
      <div class="door-omnidirectional-glow"></div>
      <div class="door-core-halo"></div>
      <div class="door-downward-spill"></div>

      <!-- Poeira Dourada Flutuante na Luz -->
      <div class="light-dust-particles">
        <span class="light-mote mote-1"></span>
        <span class="light-mote mote-2"></span>
        <span class="light-mote mote-3"></span>
        <span class="light-mote mote-4"></span>
      </div>
    </div>

    <!-- CAMADA 2: Sprite Animado da Porta (9 frames de larguras variaveis) -->
    <div class="door-sprite" :style="spriteStyleFull" />

    <!-- CAMADA 3: Overlay da Cadeira (Fica por cima da porta) -->
    <img src="/vfx/chair.png" class="chair-overlay" alt="Cadeira" />

    <!-- Hitbox Transparente de Interacao -->
    <button
      class="door-hitbox"
      @mouseenter="onDoorHover"
      @mouseleave="onDoorLeave"
      @click="onDoorClick"
      title="Biblioteca & Arquivos"
    />

    <!-- Tag Flutuante no Hover -->
    <div class="portal-tooltip" v-if="isDoorHovered">
      📜 Biblioteca & Arquivos
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useGuildAudio } from "~/composables/ui/useGuildAudio";

const props = defineProps<{
  isTransitioning?: boolean;
}>();

const emit = defineEmits<{
  (e: "hover"): void;
  (e: "leave"): void;
  (e: "doorClick"): void;
}>();

const { playDoorOpenSound, playDoorCloseSound } = useGuildAudio();

// ─── Dados do Sprite (offsets em pixels analisados do PNG real) ───
// PNG total: 2584 x 924 px | 9 frames de larguras variaveis
// Frame 0 = porta fechada de frente; Frame 8 = quase totalmente aberta
// offsetY: compensacao vertical (em px do sprite) para ancorar a base da porta.
// Valores positivos deslocam o sprite para baixo (compensam a subida da base no spritesheet).
// Ajuste finamente inspecionando visualmente frame a frame.
const SPRITE_FRAMES = [
  { x: 0, w: 324, offsetY: 0 }, // frame 0 - porta fechada (referencia)
  { x: 327, w: 319, offsetY: 0 }, // frame 1
  // frame 2 (x=647, w=599) removido: largura 2x maior que os demais causava ghost do fundo
  { x: 1247, w: 264, offsetY: 0 }, // frame 3 (agora frame 2 do array)
  { x: 1514, w: 251, offsetY: 10 }, // frame 4
  { x: 1767, w: 238, offsetY: 15 }, // frame 5
  { x: 2007, w: 212, offsetY: 20 }, // frame 6
  { x: 2222, w: 188, offsetY: 30 }, // frame 7
  { x: 2413, w: 167, offsetY: 40 }, // frame 8 - porta quase aberta
] as const;

const SPRITE_HEIGHT = 924;
const OPEN_DURATION_MS = 500;
const CLOSE_DURATION_MS = 380;

// ─── Estado ───
const wrapperRef = ref<HTMLElement | null>(null);
const isDoorHovered = ref(false);
const currentFrame = ref(0);
const containerH = ref(0);

// ─── Animacao por requestAnimationFrame (Curva OutCubic Suave) ───
let animRaf: number | null = null;
let animStartTime: number | null = null;
let animFrom = 0;
let animTo = 0;
let animDuration = OPEN_DURATION_MS;

function cancelAnim() {
  if (animRaf !== null) {
    cancelAnimationFrame(animRaf);
    animRaf = null;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function startAnim(from: number, to: number, duration: number) {
  cancelAnim();
  animFrom = from;
  animTo = to;
  animDuration = duration;
  animStartTime = null;

  function tick(ts: number) {
    if (animStartTime === null) animStartTime = ts;
    const elapsed = ts - animStartTime;
    const rawT = Math.min(elapsed / animDuration, 1);
    const t = easeOutCubic(rawT);
    const frameIndex = Math.round(animFrom + (animTo - animFrom) * t);
    currentFrame.value = Math.max(
      0,
      Math.min(SPRITE_FRAMES.length - 1, frameIndex),
    );
    if (rawT < 1) {
      animRaf = requestAnimationFrame(tick);
    } else {
      animRaf = null;
    }
  }

  animRaf = requestAnimationFrame(tick);
}

// ─── Estilo calculado do sprite em pixels ───
const spriteStyleFull = computed(() => {
  const h = containerH.value;
  if (!h) return {};

  const frame = SPRITE_FRAMES[currentFrame.value];
  if (!frame) return {};
  const scale = h / SPRITE_HEIGHT;
  const scaledTotalW = 2584 * scale;
  const scaledTotalH = SPRITE_HEIGHT * scale;
  const scaledOffsetX = frame.x * scale;
  const scaledOffsetY = frame.offsetY * scale;

  return {
    backgroundImage: "url('/vfx/door-spritesheet.png')",
    backgroundSize: `${scaledTotalW}px ${scaledTotalH}px`,
    backgroundPosition: `-${scaledOffsetX}px ${scaledOffsetY}px`,
    backgroundRepeat: "no-repeat",
    width: `${frame.w * scale}px`,
    height: `${scaledTotalH}px`,
  };
});

// ─── Estilo dinâmico do vazamento de luz alaranjada perfeitamente alinhado às frestas ───
const lightLeakStyle = computed(() => {
  const h = containerH.value;
  if (!h) return { opacity: 0 };
  const scale = h / SPRITE_HEIGHT;
  const initialWidth = 324 * scale;
  const frame = SPRITE_FRAMES[currentFrame.value] || SPRITE_FRAMES[0];
  const doorWidth = frame.w * scale;
  const gapWidth = initialWidth - doorWidth;
  const progress = currentFrame.value / (SPRITE_FRAMES.length - 1);

  if (progress <= 0 || gapWidth <= 2) {
    return { opacity: 0, display: "none" };
  }

  return {
    display: "block",
    opacity: Math.min(progress * 1.1, 0.85),
    left: `${doorWidth - 6}px`,
    width: `${gapWidth + 28}px`,
    height: `${SPRITE_HEIGHT * scale * 0.9}px`,
    transform: `scaleX(${0.4 + progress * 0.6})`,
    transformOrigin: "left center",
  };
});

// ─── Handlers ───
function onDoorHover() {
  isDoorHovered.value = true;
  playDoorOpenSound(OPEN_DURATION_MS);
  emit("hover");
  startAnim(currentFrame.value, SPRITE_FRAMES.length - 1, OPEN_DURATION_MS);
}

function onDoorLeave() {
  isDoorHovered.value = false;
  playDoorCloseSound(CLOSE_DURATION_MS);
  emit("leave");
  startAnim(currentFrame.value, 0, CLOSE_DURATION_MS);
}

function onDoorClick() {
  playDoorOpenSound();
  emit("doorClick");
}

// ─── Lifecycle ───
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (wrapperRef.value) {
    containerH.value = wrapperRef.value.clientHeight;
    ro = new ResizeObserver((entries) => {
      containerH.value = entries[0]?.contentRect.height ?? 0;
    });
    ro.observe(wrapperRef.value);
  }
});

onUnmounted(() => {
  cancelAnim();
  ro?.disconnect();
});
</script>

<style scoped>
/* WRAPPER DA ZONA DA BIBLIOTECA */
.library-portal-wrapper {
  position: absolute;
  top: 28%;
  right: -8%;
  height: 55%;
  width: 24%;
  z-index: 6;
  overflow: visible;
  pointer-events: none;
}

/* CAMADA 1: VAZAMENTO DE LUZ ALARANJADA OMNIDIRECIONAL */
.golden-light-leak {
  position: absolute;
  bottom: -45%;
  top: -22%;
  pointer-events: none;
  z-index: 1;
  mix-blend-mode: screen;
  overflow: visible;
  will-change: left, width, opacity, transform;
}

/* BRILHO OMNIDIRECIONAL VOLUMÉTRICO COM FALLOFF DE DISTÂNCIA SUAVE (SEM CORTE DURO) */
.door-omnidirectional-glow {
  position: absolute;
  top: -15%;
  left: -60%;
  width: 220%;
  height: 180%;
  background: radial-gradient(
    ellipse 160% 150% at 35% 35%,
    rgba(255, 150, 0, 0.45) 0%,
    rgba(245, 124, 0, 0.28) 24%,
    rgba(224, 86, 0, 0.12) 52%,
    rgba(191, 54, 12, 0.04) 75%,
    transparent 100%
  );
  filter: blur(28px);
  animation: omniGlowPulse 3s ease-in-out infinite alternate;
  pointer-events: none;
}

/* NÚCLEO SUAVE DE LUZ NA FRESTA DE ABERTURA (LANTERNA DIEGÉTICA MACIA E DELICADA) */
.door-core-halo {
  position: absolute;
  top: 6%;
  left: -20%;
  width: 140%;
  height: 75%;
  background: radial-gradient(
    circle at 30% 40%,
    rgba(255, 210, 130, 0.3) 0%,
    rgba(245, 130, 0, 0.15) 35%,
    transparent 72%
  );
  filter: blur(32px);
  animation: lanternFlicker 2.8s ease-in-out infinite alternate;
  pointer-events: none;
}

/* PROJEÇÃO ALARANJADA INTENSA DERRAMANDO NO CHÃO DO SAGUÃO (COMPENSANDO TOP -22%) */
.door-downward-spill {
  position: absolute;
  bottom: -20%;
  left: -35%;
  width: 175%;
  height: 70%;
  background: radial-gradient(
    ellipse 140% 110% at 35% 20%,
    rgba(255, 155, 0, 0.88) 0%,
    rgba(245, 120, 0, 0.52) 32%,
    rgba(224, 80, 0, 0.22) 62%,
    rgba(191, 54, 12, 0.05) 82%,
    transparent 100%
  );
  filter: blur(18px);
  animation: downwardSpillPulse 3.2s ease-in-out infinite alternate;
  pointer-events: none;
}

@keyframes lanternFlicker {
  0% {
    opacity: 0.25;
    transform: scale(0.96) translateY(0);
  }
  25% {
    opacity: 0.38;
    transform: scale(1.02) translateY(-1px);
  }
  50% {
    opacity: 0.28;
    transform: scale(0.98) translateY(1px);
  }
  75% {
    opacity: 0.4;
    transform: scale(1.03) translateY(-1px);
  }
  100% {
    opacity: 0.32;
    transform: scale(0.99) translateY(0);
  }
}

@keyframes omniGlowPulse {
  0% {
    opacity: 0.82;
    transform: scale(0.96);
  }
  100% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes downwardSpillPulse {
  0% {
    opacity: 0.8;
    transform: scale(0.97);
  }
  100% {
    opacity: 1;
    transform: scale(1.03);
  }
}

/* POEIRA DOURADA SUSPENSA NO FEIXE DE LUZ DA PORTA */
.light-dust-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.light-mote {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #fff8e1;
  border-radius: 50%;
  box-shadow:
    0 0 8px #ffb300,
    0 0 12px #ffe082;
  opacity: 0;
}

.golden-light-leak.is-active .mote-1 {
  left: 20%;
  top: 40%;
  animation: moteFloat 3s ease-in-out infinite 0.2s;
}

.golden-light-leak.is-active .mote-2 {
  left: 35%;
  top: 60%;
  animation: moteFloat 2.6s ease-in-out infinite 0.7s;
}

.golden-light-leak.is-active .mote-3 {
  left: 15%;
  top: 75%;
  animation: moteFloat 3.4s ease-in-out infinite 1.2s;
}

@keyframes lightRayPulse {
  0% {
    transform: scale(0.96) rotate(-1deg);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.05) rotate(1deg);
    opacity: 1;
  }
}

@keyframes moteFloat {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6);
  }
  40% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(25px, -35px) scale(1.2);
  }
}

/* CAMADA 2: dimensoes 100% controladas pelo :style inline */
.door-sprite {
  position: absolute;
  bottom: 0;
  left: 0;
  display: block;
  pointer-events: none;
  z-index: 2;
  will-change: transform;
}

/* CAMADA 3: OVERLAY DA CADEIRA */
.chair-overlay {
  position: absolute;
  bottom: -5%;
  right: 65%;
  width: 48%;
  height: auto;
  pointer-events: none;
  z-index: 3;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.65));
}

/* HITBOX TRANSPARENTE DE INTERACAO */
.door-hitbox {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  outline: none;
  z-index: 10;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}

/* TAG FLUTUANTE NO HOVER */
.portal-tooltip {
  position: absolute;
  top: 40%;
  right: 50%;
  transform: translate(50%, -50%);
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 2px solid var(--guild-blue-glow, #4fc3f7);
  border-radius: 10px;
  padding: 0.5rem 1.1rem;
  font-family: var(--font-guild-title, serif);
  font-weight: bold;
  font-size: 0.95rem;
  color: var(--guild-wood-dark, #2b1810);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.75),
    0 0 16px rgba(79, 195, 247, 0.5);
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
  animation: tooltipPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes tooltipPop {
  0% {
    opacity: 0;
    transform: translate(50%, calc(-50% + 10px)) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translate(50%, -50%) scale(1);
  }
}
</style>
