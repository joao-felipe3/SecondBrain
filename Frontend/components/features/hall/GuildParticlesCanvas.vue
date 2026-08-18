<template>
  <canvas ref="canvasRef" class="guild-particles-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animId: number | null = null;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  color: string;
  glowColor: string;
  life: number;
  maxLife: number;
  waveFreq: number;
  waveAmp: number;
  phase: number;
  shimmerSpeed: number;
  hasGlint: boolean;
  type: "ember" | "dust";
}

const particles: Particle[] = [];
const MAX_EMBERS = 45;
const MAX_DUST = 85;

// Estado do ponteiro / cursor do mouse e touch
const pointer = {
  x: -9999,
  y: -9999,
  targetX: -9999,
  targetY: -9999,
  lastX: -9999,
  lastY: -9999,
  vx: 0,
  vy: 0,
  active: false,
  radius: 112, // Raio intermediário suave
};

const GOLD_PALETTE = [
  { main: "#ffd700", glow: "#ffb700" }, // Ouro Nobre
  { main: "#ffe082", glow: "#ffa000" }, // Âmbar Quente
  { main: "#ffec8b", glow: "#ffc107" }, // Ouro Claro
  { main: "#fff4b8", glow: "#ffeb3b" }, // Centelha Brilhante
  { main: "#f5c542", glow: "#e65100" }, // Ouro Antigo
];

const EMBER_PALETTE = [
  { main: "#ffaa00", glow: "#ff5500" },
  { main: "#ff6a00", glow: "#d82b00" },
  { main: "#ffd700", glow: "#ff7b00" },
  { main: "#ff4500", glow: "#b71c1c" },
];

function createEmber(width: number, height: number): Particle {
  // Posição base na lareira ao fundo (~59.3% X, ~49.5% Y em relação ao saguão)
  const baseX = width * 0.593 + (Math.random() * (width * 0.02) - width * 0.01);
  const baseY =
    height * 0.495 + (Math.random() * (height * 0.015) - height * 0.0075);

  const themeIndex = Math.floor(Math.random() * EMBER_PALETTE.length);
  const theme = EMBER_PALETTE[themeIndex] ?? {
    main: "#ffaa00",
    glow: "#ff5500",
  };
  const maxLife = Math.random() * 110 + 60;

  return {
    x: baseX,
    y: baseY,
    vx: (Math.random() - 0.5) * 0.8,
    vy: -(Math.random() * 1.5 + 0.6),
    baseVx: (Math.random() - 0.5) * 0.4,
    baseVy: -(Math.random() * 1.2 + 0.5),
    size: Math.random() * 1.4 + 0.7,
    alpha: 0.1,
    maxAlpha: Math.random() * 0.75 + 0.25,
    color: theme.main,
    glowColor: theme.glow,
    life: 0,
    maxLife,
    waveFreq: Math.random() * 0.08 + 0.04,
    waveAmp: Math.random() * 0.5 + 0.2,
    phase: Math.random() * Math.PI * 2,
    shimmerSpeed: Math.random() * 0.1 + 0.05,
    hasGlint: false,
    type: "ember",
  };
}

function createDust(
  width: number,
  height: number,
  spawnAnywhere = true,
): Particle {
  const themeIndex = Math.floor(Math.random() * GOLD_PALETTE.length);
  const theme = GOLD_PALETTE[themeIndex] ?? {
    main: "#ffd700",
    glow: "#ffb700",
  };
  const size = Math.random() * 2.2 + 0.8;
  const isSpecial = Math.random() < 0.25 && size > 1.6;

  return {
    x: spawnAnywhere ? Math.random() * width : Math.random() < 0.5 ? 0 : width,
    y: spawnAnywhere ? Math.random() * height : Math.random() * height,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.2 - 0.06,
    baseVx: (Math.random() - 0.5) * 0.18,
    baseVy: (Math.random() - 0.5) * 0.15 - 0.05,
    size,
    alpha: 0.05,
    maxAlpha: Math.random() * 0.65 + 0.25,
    color: theme.main,
    glowColor: theme.glow,
    life: spawnAnywhere ? Math.random() * 180 : 0,
    maxLife: Math.random() * 320 + 180,
    waveFreq: Math.random() * 0.03 + 0.015,
    waveAmp: Math.random() * 0.4 + 0.15,
    phase: Math.random() * Math.PI * 2,
    shimmerSpeed: Math.random() * 0.06 + 0.02,
    hasGlint: isSpecial,
    type: "dust",
  };
}

function initParticles(width: number, height: number) {
  particles.length = 0;
  for (let i = 0; i < MAX_EMBERS; i++) {
    particles.push(createEmber(width, height));
  }
  for (let i = 0; i < MAX_DUST; i++) {
    particles.push(createDust(width, height, true));
  }
}

// Atualização de física do ponteiro (interpolação suave)
function updatePointerPhysics() {
  if (pointer.active) {
    // Interpolação elástica para suavizar o movimento do mouse
    pointer.x += (pointer.targetX - pointer.x) * 0.35;
    pointer.y += (pointer.targetY - pointer.y) * 0.35;

    // Cálculo de velocidade do cursor
    if (pointer.lastX > -1000) {
      pointer.vx = (pointer.x - pointer.lastX) * 0.4;
      pointer.vy = (pointer.y - pointer.lastY) * 0.4;
    }
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
  } else {
    pointer.x = -9999;
    pointer.y = -9999;
    pointer.vx *= 0.85;
    pointer.vy *= 0.85;
    pointer.lastX = -9999;
    pointer.lastY = -9999;
  }
}

// Desenhar estrela de 4 pontas cintilante (glint)
function drawGlintStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;

  const length = size * 2.2;
  const thickness = size * 0.45;

  ctx.beginPath();
  // Losango horizontal
  ctx.moveTo(x - length, y);
  ctx.lineTo(x, y - thickness);
  ctx.lineTo(x + length, y);
  ctx.lineTo(x, y + thickness);
  ctx.closePath();
  ctx.fill();

  // Losango vertical
  ctx.beginPath();
  ctx.moveTo(x, y - length);
  ctx.lineTo(x - thickness, y);
  ctx.lineTo(x + length, y);
  ctx.lineTo(x + thickness, y);
  ctx.closePath();
  ctx.fill();

  // Núcleo brilhante
  ctx.beginPath();
  ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  updatePointerPhysics();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const isPointerActive = pointer.active && pointer.x > -1000;
  const pointerRadiusSq = pointer.radius * pointer.radius;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p) continue;
    p.life++;

    // 1. Interação de repulsão orgânica e sutil com o cursor / touch
    let excitedGlow = 0;
    if (isPointerActive) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < pointerRadiusSq && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const norm = 1 - dist / pointer.radius;
        // Força sutil calibrada
        const force = norm * norm * 0.9;

        const nx = dx / dist;
        const ny = dy / dist;

        // Impulso radial equilibrado
        p.vx += nx * force * 0.28;
        p.vy += ny * force * 0.28;

        // Vorticidade sutil com o rastro do cursor
        p.vx += pointer.vx * norm * 0.05;
        p.vy += pointer.vy * norm * 0.05;

        // Excitação de brilho orgânica
        excitedGlow = norm * 0.25;
      }
    }

    // 2. Amortecimento suave de velocidade para retornar harmoniosamente ao fluxo natural
    p.vx += (p.baseVx - p.vx) * 0.065;
    p.vy += (p.baseVy - p.vy) * 0.065;

    // Limite de velocidade para manter movimento calmo e sedoso
    const maxSpeed = 1.8;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed;
      p.vy = (p.vy / speed) * maxSpeed;
    }

    // 3. Atualização de posição com convecção e oscilação orgânica
    p.x += p.vx + Math.sin(p.life * p.waveFreq + p.phase) * p.waveAmp;
    p.y +=
      p.vy +
      Math.cos(p.life * (p.waveFreq * 0.8) + p.phase) * (p.waveAmp * 0.6);

    // 4. Cálculo de transparência e cintilação (shimmer)
    const shimmer = Math.sin(p.life * p.shimmerSpeed + p.phase) * 0.28;
    let baseAlpha = p.maxAlpha + shimmer;

    // Fade in / Fade out nas bordas da vida útil
    if (p.life < p.maxLife * 0.18) {
      baseAlpha *= p.life / (p.maxLife * 0.18);
    } else if (p.life > p.maxLife * 0.78) {
      baseAlpha *= 1 - (p.life - p.maxLife * 0.78) / (p.maxLife * 0.22);
    }

    const currentAlpha = Math.max(0, Math.min(1, baseAlpha + excitedGlow));
    p.alpha = currentAlpha;

    // 5. Renderização da partícula
    if (currentAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = currentAlpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.type === "ember" ? 5 : p.hasGlint ? 6 : 3;
      ctx.shadowColor = p.glowColor;

      // Desenho de ponto ou glint especial
      if (p.hasGlint && p.type === "dust" && shimmer > 0.12) {
        drawGlintStar(ctx, p.x, p.y, p.size * 0.9, p.color, currentAlpha);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // 6. Reciclagem ao expirar ou sair dos limites
    if (
      p.life >= p.maxLife ||
      p.y < -30 ||
      p.y > height + 30 ||
      p.x < -40 ||
      p.x > width + 40
    ) {
      particles[i] =
        p.type === "ember"
          ? createEmber(width, height)
          : createDust(width, height, false);
    }
  }

  ctx.restore();
  animId = requestAnimationFrame(render);
}

// Conversão precisa de coordenadas de tela para o espaço interno do Canvas
function updatePointerCoordinates(clientX: number, clientY: number) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  pointer.targetX = (clientX - rect.left) * scaleX;
  pointer.targetY = (clientY - rect.top) * scaleY;
  pointer.active = true;
}

function handlePointerMove(e: MouseEvent | PointerEvent) {
  updatePointerCoordinates(e.clientX, e.clientY);
}

function handlePointerLeave() {
  pointer.active = false;
}

function handleTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (touch) {
    updatePointerCoordinates(touch.clientX, touch.clientY);
  }
}

function handleTouchEnd() {
  pointer.active = false;
}

function handleResize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement || document.body;

  const width = parent.clientWidth || window.innerWidth || 1920;
  const height = parent.clientHeight || window.innerHeight || 1080;

  // Manter resolução proporcional e nítida
  canvas.width = width;
  canvas.height = height;

  initParticles(canvas.width, canvas.height);
}

onMounted(() => {
  handleResize();
  render();

  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", handlePointerLeave, {
    passive: true,
  });
  window.addEventListener("touchstart", handleTouchMove, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
});

onBeforeUnmount(() => {
  if (animId !== null) {
    cancelAnimationFrame(animId);
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerleave", handlePointerLeave);
    window.removeEventListener("touchstart", handleTouchMove);
    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", handleTouchEnd);
    window.removeEventListener("touchcancel", handleTouchEnd);
  }
});
</script>

<style scoped>
.guild-particles-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15;
  will-change: transform;
}
</style>
