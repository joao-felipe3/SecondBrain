<template>
  <div class="ui-runic-tile" :class="[`tile-variant-${variant}`, `tile-size-${size}`]">
    <div class="tile-inner">
      <span v-if="icon" class="tile-icon">{{ icon }}</span>
      <span class="tile-label">{{ label }}</span>
      <span v-if="count !== undefined" class="tile-badge">{{ count }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    count?: number;
    icon?: string;
    variant?: 'stone' | 'wood' | 'gold';
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    variant: 'wood',
    size: 'md',
  },
);
</script>

<style scoped>
.ui-runic-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  position: relative;
  user-select: none;
  font-family: var(--font-guild-title, 'Cinzel', serif);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tile-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  justify-content: center;
}

/* Variantes */
.tile-variant-wood {
  background: linear-gradient(180deg, hsl(24, 35%, 26%) 0%, hsl(20, 40%, 16%) 100%);
  border: 1px solid hsl(25, 30%, 35%);
  color: hsl(38, 55%, 85%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    0 3px 6px rgba(0, 0, 0, 0.4);
}

.tile-variant-stone {
  background: linear-gradient(180deg, #475569 0%, #1e293b 100%);
  border: 1px solid #64748b;
  color: #f1f5f9;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 3px 6px rgba(0, 0, 0, 0.5);
}

.tile-variant-gold {
  background: linear-gradient(180deg, hsl(43, 85%, 45%) 0%, hsl(35, 75%, 28%) 100%);
  border: 1px solid hsl(45, 90%, 55%);
  color: #fffbeb;
  box-shadow:
    0 0 10px rgba(234, 179, 8, 0.3),
    0 3px 6px rgba(0, 0, 0, 0.4);
}

/* Tamanhos */
.tile-size-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.tile-size-md {
  padding: 0.5rem 0.85rem;
  font-size: 0.875rem;
  font-weight: 700;
}

.tile-size-lg {
  padding: 0.65rem 1.25rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.tile-icon {
  font-size: 1.1em;
}

.tile-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.4);
  font-size: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-left: 0.25rem;
}
</style>
