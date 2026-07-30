<template>
  <div
    class="ui-wax-seal"
    :class="[
      `seal-color-${color}`,
      `seal-size-${size}`,
      { 'is-interactive': interactive }
    ]"
    @click="handleClick"
  >
    <div class="wax-outer-ring">
      <div class="wax-inner-core">
        <span v-if="icon" class="seal-icon">{{ icon }}</span>
        <span v-else-if="label" class="seal-label">{{ label }}</span>
        <span v-else class="seal-emblem">⚔️</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    color?: 'red' | 'blue' | 'green' | 'amber' | 'gold'
    size?: 'sm' | 'md' | 'lg'
    icon?: string
    label?: string
    interactive?: boolean
  }>(),
  {
    color: 'red',
    size: 'md',
    interactive: false
  }
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent) {
  if (props.interactive) {
    emit('click', event)
  }
}
</script>

<style scoped>
.ui-wax-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  user-select: none;
}

.wax-outer-ring {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow:
    inset 0 2px 4px rgba(255, 255, 255, 0.3),
    inset 0 -3px 6px rgba(0, 0, 0, 0.5),
    0 4px 10px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.wax-inner-core {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed rgba(255, 255, 255, 0.4);
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4);
}

/* SIZES */
.seal-size-sm .wax-outer-ring {
  width: 28px;
  height: 28px;
}
.seal-size-sm .wax-inner-core {
  width: 20px;
  height: 20px;
  font-size: 11px;
}

.seal-size-md .wax-outer-ring {
  width: 42px;
  height: 42px;
}
.seal-size-md .wax-inner-core {
  width: 32px;
  height: 32px;
  font-size: 16px;
}

.seal-size-lg .wax-outer-ring {
  width: 58px;
  height: 58px;
}
.seal-size-lg .wax-inner-core {
  width: 44px;
  height: 44px;
  font-size: 22px;
}

/* COLORS */
.seal-color-red .wax-outer-ring {
  background: radial-gradient(circle at 35% 35%, #b91c1c 0%, #7f1d1d 70%, #450a0a 100%);
  color: #fef2f2;
}

.seal-color-blue .wax-outer-ring {
  background: radial-gradient(circle at 35% 35%, #1d4ed8 0%, #1e40af 70%, #172554 100%);
  color: #eff6ff;
}

.seal-color-green .wax-outer-ring {
  background: radial-gradient(circle at 35% 35%, #15803d 0%, #166534 70%, #052e16 100%);
  color: #f0fdf4;
}

.seal-color-amber .wax-outer-ring {
  background: radial-gradient(circle at 35% 35%, #d97706 0%, #b45309 70%, #451a03 100%);
  color: #fffbeb;
}

.seal-color-gold .wax-outer-ring {
  background: radial-gradient(circle at 35% 35%, #f59e0b 0%, #d97706 60%, #78350f 100%);
  color: #78350f;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}

.ui-wax-seal.is-interactive:hover .wax-outer-ring {
  transform: scale(1.12) rotate(4deg);
}

.seal-emblem, .seal-icon, .seal-label {
  font-family: var(--font-guild-title);
  font-weight: bold;
}
</style>
