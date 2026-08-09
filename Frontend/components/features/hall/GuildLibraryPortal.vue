<template>
  <!-- Wrapper da zona da biblioteca -->
  <div ref="wrapperRef" class="library-portal-wrapper">
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
const OPEN_DURATION_MS = 600;
const CLOSE_DURATION_MS = 400;

// ─── Estado ───
const wrapperRef = ref<HTMLElement | null>(null);
const isDoorHovered = ref(false);
const currentFrame = ref(0);
const containerH = ref(0);

// ─── Animacao por requestAnimationFrame ───
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

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
    const t = easeInOutQuad(rawT);
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
/* WRAPPER DA ZONA DA BIBLIOTECA
 * Height define a escala visual; width e gerenciado pelo :style do door-sprite
 * pois cada frame do sprite tem largura diferente (porta em perspectiva).
 */
.library-portal-wrapper {
  position: absolute;
  top: 28%;
  right: -8%;
  height: 55%;
  width: 24%; /* largura generosa para o hitbox e chair overlay nao ficarem cortados */
  z-index: 6;
  overflow: visible;
  pointer-events: none;
}

/* CAMADA 2: dimensoes 100% controladas pelo :style inline */
.door-sprite {
  position: absolute;
  bottom: 0; /* ancora no chao da porta, evita subida visual durante animacao */
  left: 0; /* ancora na dobradica fixa (lado esquerdo) */
  display: block;
  pointer-events: none;
  z-index: 2;
  will-change: transform; /* promove layer GPU sem misturar propriedades de layout (width) com compositor */
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
