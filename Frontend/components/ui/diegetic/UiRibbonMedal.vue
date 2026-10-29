<template>
  <div
    class="ui-ribbon-medal"
    :class="[`medal-color-${color}`, `medal-size-${size}`]"
    :title="label || 'Missão Cumprida'"
  >
    <!-- Fita dupla em 'V' -->
    <div class="ribbon-tails">
      <div class="tail tail-left"></div>
      <div class="tail tail-right"></div>
    </div>

    <!-- Medalhão central com selo de cera ou brasão -->
    <div class="medal-seal">
      <span class="medal-icon">{{ icon }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    color?: 'green' | 'gold' | 'blue' | 'red';
    size?: 'sm' | 'md' | 'lg';
    label?: string;
    icon?: string;
  }>(),
  {
    color: 'green',
    size: 'md',
    icon: '✓',
  },
);
</script>

<style scoped>
.ui-ribbon-medal {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  user-select: none;
}

.ribbon-tails {
  position: absolute;
  top: 55%;
  display: flex;
  justify-content: center;
  gap: 2px;
  width: 100%;
  z-index: 1;
}

.tail {
  width: 7px;
  height: 16px;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 80%, 0% 100%);
}

.tail-left {
  transform: rotate(12deg);
}

.tail-right {
  transform: rotate(-12deg);
}

.medal-seal {
  position: relative;
  z-index: 2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  box-shadow:
    0 3px 6px rgba(0, 0, 0, 0.4),
    inset 0 -2px 4px rgba(0, 0, 0, 0.35);
}

/* Cores */
.medal-color-green .tail {
  background: linear-gradient(180deg, #15803d, #166534);
}
.medal-color-green .medal-seal {
  background: radial-gradient(circle, #22c55e 0%, #15803d 70%, #14532d 100%);
  color: #f0fdf4;
  border: 2px solid #86efac;
}

.medal-color-gold .tail {
  background: linear-gradient(180deg, #ca8a04, #854d0e);
}
.medal-color-gold .medal-seal {
  background: radial-gradient(circle, #fde047 0%, #eab308 70%, #a16207 100%);
  color: #422006;
  border: 2px solid #fef08a;
}

.medal-color-blue .tail {
  background: linear-gradient(180deg, #2563eb, #1e40af);
}
.medal-color-blue .medal-seal {
  background: radial-gradient(circle, #60a5fa 0%, #2563eb 70%, #1e3a8a 100%);
  color: #eff6ff;
  border: 2px solid #bfdbfe;
}

.medal-color-red .tail {
  background: linear-gradient(180deg, #dc2626, #991b1b);
}
.medal-color-red .medal-seal {
  background: radial-gradient(circle, #f87171 0%, #dc2626 70%, #7f1d1d 100%);
  color: #fef2f2;
  border: 2px solid #fecaca;
}

/* Tamanhos */
.medal-size-sm {
  width: 18px;
  height: 26px;
}
.medal-size-sm .medal-seal {
  width: 16px;
  height: 16px;
  font-size: 0.65rem;
}
.medal-size-sm .tail {
  width: 5px;
  height: 12px;
}

.medal-size-md {
  width: 26px;
  height: 38px;
}
.medal-size-md .medal-seal {
  width: 24px;
  height: 24px;
  font-size: 0.85rem;
}
.medal-size-md .tail {
  width: 8px;
  height: 18px;
}

.medal-size-lg {
  width: 36px;
  height: 50px;
}
.medal-size-lg .medal-seal {
  width: 32px;
  height: 32px;
  font-size: 1.1rem;
}
.medal-size-lg .tail {
  width: 11px;
  height: 24px;
}
</style>
