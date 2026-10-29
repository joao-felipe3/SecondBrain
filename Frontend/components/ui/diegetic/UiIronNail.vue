<template>
  <div
    class="ui-iron-nail"
    :class="[`nail-size-${size}`, `nail-variant-${variant}`, { 'is-interactive': interactive }]"
    @click="handleClick"
  >
    <div class="nail-head">
      <div class="nail-highlight"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    variant?: 'iron' | 'brass' | 'tack';
    interactive?: boolean;
  }>(),
  {
    size: 'md',
    variant: 'iron',
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
.ui-iron-nail {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  user-select: none;
}

.nail-head {
  border-radius: 50%;
  position: relative;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.6),
    inset 0 -1px 2px rgba(0, 0, 0, 0.7);
  transition: transform 0.15s ease;
}

.nail-highlight {
  position: absolute;
  top: 15%;
  left: 20%;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  filter: blur(0.5px);
}

.nail-variant-iron .nail-head {
  background: radial-gradient(circle at 35% 35%, #64748b 0%, #334155 60%, #0f172a 100%);
  border: 1px solid #1e293b;
}

.nail-variant-brass .nail-head {
  background: radial-gradient(circle at 35% 35%, #facc15 0%, #b45309 60%, #78350f 100%);
  border: 1px solid #78350f;
}

.nail-variant-tack .nail-head {
  background: radial-gradient(circle at 35% 35%, #94a3b8 0%, #475569 60%, #1e293b 100%);
  border: 1px solid #0f172a;
}

.nail-size-sm .nail-head {
  width: 8px;
  height: 8px;
}
.nail-size-md .nail-head {
  width: 12px;
  height: 12px;
}
.nail-size-lg .nail-head {
  width: 18px;
  height: 18px;
}

.ui-iron-nail.is-interactive:hover .nail-head {
  transform: scale(1.15);
}
</style>
