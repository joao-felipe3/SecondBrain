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
  size: number;
  alpha: number;
  maxAlpha: number;
  color: string;
  life: number;
  maxLife: number;
  type: "ember" | "dust";
}

const particles: Particle[] = [];
const MAX_EMBERS = 50;
const MAX_DUST = 70;

function createEmber(width: number, height: number): Particle {
  // Lareira na arte (região da lareira ao fundo ~59.3% X, ~49.5% Y em relação à safe-zone)
  const baseX = width * 0.593 + (Math.random() * (width * 0.02) - width * 0.01);
  const baseY =
    height * 0.495 + (Math.random() * (height * 0.015) - height * 0.0075);

  const colors = ["#ffaa00", "#ff5500", "#ff2200", "#ffd700", "#ff8800"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return {
    x: baseX,
    y: baseY,
    vx: (Math.random() - 0.5) * 1.0,
    vy: -(Math.random() * 1.6 + 0.6),
    size: Math.random() * 1.5 + 0.8,
    alpha: 0.2,
    maxAlpha: Math.random() * 0.8 + 0.2,
    color,
    life: 0,
    maxLife: Math.random() * 120 + 60,
    type: "ember",
  };
}

function createDust(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.3 - 0.1,
    size: Math.random() * 2.5 + 1.2,
    alpha: 0.1,
    maxAlpha: Math.random() * 0.6 + 0.2,
    color: "#ffec8b",
    life: Math.random() * 150,
    maxLife: Math.random() * 250 + 150,
    type: "dust",
  };
}

function initParticles(width: number, height: number) {
  particles.length = 0;
  for (let i = 0; i < MAX_EMBERS; i++) {
    particles.push(createEmber(width, height));
  }
  for (let i = 0; i < MAX_DUST; i++) {
    particles.push(createDust(width, height));
  }
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.life++;

    p.x += p.vx + Math.sin(p.life * 0.06) * 0.4;
    p.y += p.vy;

    // Fade in/out
    if (p.life < p.maxLife * 0.15) {
      p.alpha = (p.life / (p.maxLife * 0.15)) * p.maxAlpha;
    } else if (p.life > p.maxLife * 0.75) {
      p.alpha =
        (1 - (p.life - p.maxLife * 0.75) / (p.maxLife * 0.25)) * p.maxAlpha;
    } else {
      p.alpha = p.maxAlpha;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    ctx.fillStyle = p.color;
    ctx.shadowBlur = p.type === "ember" ? 4 : 3;
    ctx.shadowColor = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (p.life >= p.maxLife || p.y < 0 || p.x < 0 || p.x > width) {
      particles[i] =
        p.type === "ember"
          ? createEmber(width, height)
          : createDust(width, height);
    }
  }

  ctx.restore();
  animId = requestAnimationFrame(render);
}

function handleResize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement || document.body;

  canvas.width = parent.clientWidth || window.innerWidth || 1920;
  canvas.height = parent.clientHeight || window.innerHeight || 1080;

  initParticles(canvas.width, canvas.height);
}

onMounted(() => {
  handleResize();
  render();

  window.addEventListener("resize", handleResize, { passive: true });
});

onBeforeUnmount(() => {
  if (animId !== null) {
    cancelAnimationFrame(animId);
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleResize);
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
}
</style>
