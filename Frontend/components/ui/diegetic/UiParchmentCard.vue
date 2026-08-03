<template>
  <div
    class="ui-parchment-card"
    :class="[
      `variant-${variant}`,
      {
        'is-elevated': elevated,
        'is-expanded': expanded,
        'is-interactive': interactive
      }
    ]"
    @click="handleClick"
  >
    <!-- Cantoneiras decorativas ou prego rústico opcional -->
    <div v-if="hasPin" class="parchment-pin">
      <div class="pin-head"></div>
    </div>

    <!-- Conteúdo Interno do Pergaminho -->
    <div class="parchment-content">
      <slot />
    </div>

    <!-- Textura de borda queimada/envelhecida -->
    <div class="parchment-vignette"></div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'contract' | 'map' | 'grimoire' | 'scroll'
    elevated?: boolean
    expanded?: boolean
    interactive?: boolean
    hasPin?: boolean
  }>(),
  {
    variant: 'contract',
    elevated: true,
    expanded: false,
    interactive: false,
    hasPin: false
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
.ui-parchment-card {
  background: radial-gradient(
    circle at 50% 40%,
    var(--guild-parchment-base) 0%,
    var(--guild-parchment-dark) 100%
  );
  color: var(--guild-parchment-ink);
  border: 2px solid hsl(32, 40%, 45%);
  border-radius: 6px;
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
  box-shadow:
    inset 0 0 20px rgba(130, 85, 45, 0.25),
    0 6px 18px rgba(20, 15, 10, 0.4);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  font-family: var(--font-guild-body);
}

.ui-parchment-card.is-interactive {
  cursor: pointer;
}

.ui-parchment-card.is-interactive:hover {
  transform: translateY(-4px) rotate(-0.5deg);
  box-shadow:
    inset 0 0 25px rgba(140, 95, 50, 0.35),
    0 12px 28px rgba(20, 15, 10, 0.5);
}

.ui-parchment-card.is-elevated {
  box-shadow:
    inset 0 0 15px rgba(120, 80, 40, 0.3),
    0 10px 30px rgba(0, 0, 0, 0.45);
}

.variant-grimoire {
  background: radial-gradient(
    circle at 50% 30%,
    hsl(38, 55%, 90%) 0%,
    hsl(33, 40%, 80%) 100%
  );
  border: 3px solid var(--guild-wood-mid);
}

.variant-scroll {
  border-radius: 12px;
  border-top: 6px solid var(--guild-wood-light);
  border-bottom: 6px solid var(--guild-wood-dark);
}

.parchment-pin {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
}

.pin-head {
  width: 12px;
  height: 12px;
  background: radial-gradient(circle at 30% 30%, #b5b5b5 0%, #3a3a3a 100%);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.parchment-content {
  position: relative;
  z-index: 2;
}

.parchment-vignette {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 60%,
    rgba(90, 55, 25, 0.2) 100%
  );
  z-index: 1;
}
</style>
