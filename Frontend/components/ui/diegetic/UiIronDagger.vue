<template>
  <div
    class="ui-iron-dagger"
    :class="[`dagger-size-${size}`, { 'is-interactive': interactive }]"
    :style="{ transform: `rotate(${angle}deg)` }"
    @click="handleClick"
    title="Contrato Urgente / Atrasado"
  >
    <!-- Pommel -->
    <div class="dagger-pommel"></div>
    <!-- Cabo / Grip com empunhadura -->
    <div class="dagger-grip"></div>
    <!-- Guarda / Crossguard -->
    <div class="dagger-guard"></div>
    <!-- Lâmina de Ferro com vinco central e ponta chanfrada -->
    <div class="dagger-blade">
      <div class="blade-edge-left"></div>
      <div class="blade-fuller"></div>
      <div class="blade-edge-right"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    angle?: number;
    interactive?: boolean;
  }>(),
  {
    size: 'md',
    angle: -18,
    interactive: false,
  },
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

function handleClick(event: MouseEvent) {
  if (props.interactive) {
    emit('click', event);
  }
}
</script>

<style scoped>
.ui-iron-dagger {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  user-select: none;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.6));
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: center bottom;
  pointer-events: auto;
}

.ui-iron-dagger.is-interactive {
  cursor: pointer;
}

.ui-iron-dagger.is-interactive:hover {
  filter: drop-shadow(0 6px 12px rgba(220, 50, 40, 0.6));
  animation: dagger-shiver 0.35s ease;
}

@keyframes dagger-shiver {
  0% {
    transform: rotate(var(--angle, -18deg)) scale(1);
  }
  25% {
    transform: rotate(calc(var(--angle, -18deg) - 4deg)) scale(1.05);
  }
  50% {
    transform: rotate(calc(var(--angle, -18deg) + 3deg)) scale(1.05);
  }
  75% {
    transform: rotate(calc(var(--angle, -18deg) - 2deg)) scale(1.02);
  }
  100% {
    transform: rotate(var(--angle, -18deg)) scale(1);
  }
}

/* Tamanhos */
.dagger-size-sm {
  width: 14px;
  height: 42px;
}
.dagger-size-sm .dagger-pommel {
  width: 6px;
  height: 6px;
}
.dagger-size-sm .dagger-grip {
  width: 4px;
  height: 12px;
}
.dagger-size-sm .dagger-guard {
  width: 14px;
  height: 3px;
}
.dagger-size-sm .dagger-blade {
  width: 6px;
  height: 21px;
}

.dagger-size-md {
  width: 20px;
  height: 60px;
}
.dagger-size-md .dagger-pommel {
  width: 8px;
  height: 8px;
}
.dagger-size-md .dagger-grip {
  width: 5px;
  height: 18px;
}
.dagger-size-md .dagger-guard {
  width: 20px;
  height: 4px;
}
.dagger-size-md .dagger-blade {
  width: 8px;
  height: 30px;
}

.dagger-size-lg {
  width: 28px;
  height: 84px;
}
.dagger-size-lg .dagger-pommel {
  width: 12px;
  height: 12px;
}
.dagger-size-lg .dagger-grip {
  width: 7px;
  height: 26px;
}
.dagger-size-lg .dagger-guard {
  width: 28px;
  height: 6px;
}
.dagger-size-lg .dagger-blade {
  width: 11px;
  height: 40px;
}

/* Partes da Adaga */
.dagger-pommel {
  background: radial-gradient(circle, hsl(42, 60%, 55%), hsl(35, 45%, 30%));
  border-radius: 50%;
  border: 1px solid hsl(30, 40%, 20%);
}

.dagger-grip {
  background: repeating-linear-gradient(
    0deg,
    hsl(15, 30%, 15%),
    hsl(15, 30%, 15%) 2px,
    hsl(28, 40%, 25%) 3px,
    hsl(28, 40%, 25%) 4px
  );
  border-radius: 2px;
  box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.8);
}

.dagger-guard {
  background: linear-gradient(90deg, hsl(35, 50%, 30%), hsl(42, 70%, 50%), hsl(35, 50%, 30%));
  border-radius: 2px;
  border: 1px solid hsl(30, 40%, 20%);
}

.dagger-blade {
  display: flex;
  position: relative;
  background: linear-gradient(90deg, #7a8288 0%, #b8c0c8 45%, #e2e8f0 50%, #9ca3af 55%, #64748b 100%);
  clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
  box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.4);
}

.blade-fuller {
  position: absolute;
  top: 0;
  left: 45%;
  width: 10%;
  height: 75%;
  background: rgba(0, 0, 0, 0.35);
}
</style>
