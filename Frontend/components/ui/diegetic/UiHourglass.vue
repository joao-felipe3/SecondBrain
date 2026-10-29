<template>
  <div
    class="ui-hourglass"
    :class="[`hourglass-size-${size}`, { 'is-active': active }]"
    :title="label || (active ? 'Ampulheta Mágica Ativa' : 'Ampulheta')"
  >
    <!-- Topo de madeira/metal -->
    <div class="hourglass-cap top-cap"></div>
    <div class="hourglass-pillars">
      <div class="pillar left-pillar"></div>
      <div class="pillar right-pillar"></div>
    </div>

    <!-- Vidro duplo -->
    <div class="hourglass-glass">
      <!-- Bulbo Superior -->
      <div class="bulb top-bulb">
        <div class="sand-top" :style="{ height: `${Math.max(0, 100 - progress)}%` }"></div>
      </div>
      <!-- Gargalo / Fluxo -->
      <div class="neck">
        <div v-if="active && progress < 100" class="sand-stream"></div>
      </div>
      <!-- Bulbo Inferior -->
      <div class="bulb bottom-bulb">
        <div class="sand-bottom" :style="{ height: `${Math.min(100, progress)}%` }"></div>
      </div>
    </div>

    <!-- Base de madeira/metal -->
    <div class="hourglass-cap bottom-cap"></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    progress?: number;
    active?: boolean;
    size?: 'sm' | 'md' | 'lg';
    label?: string;
  }>(),
  {
    progress: 50,
    active: false,
    size: 'md',
  },
);
</script>

<style scoped>
.ui-hourglass {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  user-select: none;
}

.hourglass-cap {
  width: 100%;
  background: linear-gradient(90deg, #78350f, #d97706, #78350f);
  border-radius: 2px;
  border: 1px solid #451a03;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  z-index: 2;
}

.hourglass-pillars {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.pillar {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 2px;
  background: linear-gradient(180deg, #b45309, #78350f);
  border-radius: 1px;
}

.left-pillar {
  left: 1px;
}
.right-pillar {
  right: 1px;
}

.hourglass-glass {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  backdrop-filter: blur(1px);
  overflow: hidden;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.bulb {
  width: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  background: rgba(200, 220, 240, 0.05);
}

.top-bulb {
  align-items: flex-end;
  border-radius: 40% 40% 10% 10%;
}

.bottom-bulb {
  align-items: flex-end;
  border-radius: 10% 10% 40% 40%;
}

.neck {
  width: 3px;
  height: 4px;
  position: relative;
}

.sand-top {
  width: 100%;
  background: linear-gradient(180deg, #facc15 0%, #d97706 100%);
  border-radius: 0 0 4px 4px;
  transition: height 0.3s ease;
}

.sand-bottom {
  width: 100%;
  background: linear-gradient(180deg, #f59e0b 0%, #b45309 100%);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.sand-stream {
  width: 1.5px;
  height: 100%;
  margin: 0 auto;
  background: #fde047;
  animation: stream-flow 0.4s infinite linear;
}

@keyframes stream-flow {
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.7;
  }
}

.ui-hourglass.is-active {
  filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.5));
}

/* Tamanhos */
.hourglass-size-sm {
  width: 14px;
  height: 26px;
}
.hourglass-size-sm .hourglass-cap {
  height: 2.5px;
}
.hourglass-size-sm .bulb {
  height: 9px;
}

.hourglass-size-md {
  width: 20px;
  height: 38px;
}
.hourglass-size-md .hourglass-cap {
  height: 3px;
}
.hourglass-size-md .bulb {
  height: 14px;
}

.hourglass-size-lg {
  width: 28px;
  height: 52px;
}
.hourglass-size-lg .hourglass-cap {
  height: 4px;
}
.hourglass-size-lg .bulb {
  height: 20px;
}
</style>
