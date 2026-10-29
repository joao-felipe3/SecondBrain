<template>
  <div class="ui-wooden-frame" :class="[`frame-wood-${variant}`, { 'is-elevated': elevated }]">
    <!-- Cantoneiras de Ferro Forjado nos 4 cantos -->
    <template v-if="hasCornerBrackets">
      <div class="bracket bracket-tl"></div>
      <div class="bracket bracket-tr"></div>
      <div class="bracket bracket-bl"></div>
      <div class="bracket bracket-br"></div>
    </template>

    <!-- Header do Frame opcional -->
    <div v-if="$slots.header" class="frame-header">
      <slot name="header" />
    </div>

    <!-- Conteúdo Principal -->
    <div class="frame-body">
      <slot />
    </div>

    <!-- Footer do Frame opcional -->
    <div v-if="$slots.footer" class="frame-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'oak' | 'pine' | 'dark';
    hasCornerBrackets?: boolean;
    elevated?: boolean;
  }>(),
  {
    variant: 'oak',
    hasCornerBrackets: true,
    elevated: true,
  },
);
</script>

<style scoped>
.ui-wooden-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  padding: 1rem;
  box-sizing: border-box;
}

/* Madeiras */
.frame-wood-oak {
  background: linear-gradient(135deg, hsl(24, 40%, 20%) 0%, hsl(20, 45%, 13%) 100%);
  border: 4px solid hsl(25, 35%, 28%);
  box-shadow:
    inset 0 0 25px rgba(0, 0, 0, 0.7),
    0 10px 25px rgba(0, 0, 0, 0.5);
}

.frame-wood-pine {
  background: linear-gradient(135deg, hsl(32, 45%, 28%) 0%, hsl(28, 40%, 18%) 100%);
  border: 4px solid hsl(32, 40%, 38%);
  box-shadow:
    inset 0 0 20px rgba(0, 0, 0, 0.6),
    0 8px 20px rgba(0, 0, 0, 0.45);
}

.frame-wood-dark {
  background: linear-gradient(135deg, hsl(15, 30%, 14%) 0%, hsl(10, 25%, 8%) 100%);
  border: 4px solid hsl(18, 25%, 22%);
  box-shadow:
    inset 0 0 30px rgba(0, 0, 0, 0.85),
    0 12px 30px rgba(0, 0, 0, 0.6);
}

.ui-wooden-frame.is-elevated {
  box-shadow:
    inset 0 0 25px rgba(0, 0, 0, 0.75),
    0 16px 36px rgba(0, 0, 0, 0.65);
}

/* Cantoneiras de Ferro Forjado */
.bracket {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 3px solid #475569;
  z-index: 3;
  pointer-events: none;
}

.bracket-tl {
  top: -2px;
  left: -2px;
  border-right: none;
  border-bottom: none;
  border-radius: 6px 0 0 0;
}
.bracket-tr {
  top: -2px;
  right: -2px;
  border-left: none;
  border-bottom: none;
  border-radius: 0 6px 0 0;
}
.bracket-bl {
  bottom: -2px;
  left: -2px;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 6px;
}
.bracket-br {
  bottom: -2px;
  right: -2px;
  border-left: none;
  border-top: none;
  border-radius: 0 0 6px 0;
}

.frame-header {
  margin-bottom: 0.75rem;
  position: relative;
  z-index: 2;
}

.frame-body {
  flex: 1 1 auto;
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
}

.frame-footer {
  margin-top: 0.75rem;
  position: relative;
  z-index: 2;
}
</style>
