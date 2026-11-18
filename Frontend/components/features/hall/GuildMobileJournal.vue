<template>
  <nav v-if="isMobile" class="mobile-bottom-journal" aria-label="Diário de Navegação da Guilda">
    <div class="journal-plank">
      <!-- rebites de ferro nos cantos da prancha -->
      <span class="rivet rivet-tl" aria-hidden="true"></span>
      <span class="rivet rivet-tr" aria-hidden="true"></span>
      <span class="rivet rivet-bl" aria-hidden="true"></span>
      <span class="rivet rivet-br" aria-hidden="true"></span>

      <!-- fita de pano com o título, presa por cima da prancha -->
      <div class="journal-ribbon">
        <span>Diário de Navegação</span>
      </div>

      <div class="journal-parchment">
        <button
          v-for="item in items"
          :key="item.label"
          type="button"
          class="journal-btn"
          @click="item.action"
        >
          <UiWaxSeal :color="item.color" size="md" :icon="item.icon" />
          <span class="journal-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import UiWaxSeal from '~/components/ui/diegetic/UiWaxSeal.vue';

defineProps<{
  isMobile: boolean;
}>();

const emit = defineEmits<{
  (e: 'openReception'): void;
  (e: 'playDoorOpen'): void;
  (e: 'navigateTasks'): void;
  (e: 'navigateProjects'): void;
  (e: 'navigateCalendar'): void;
}>();

const items = [
  { label: 'Missões', icon: '⚔️', color: 'red', action: () => emit('navigateTasks') },
  { label: 'Arquivos', icon: '📚', color: 'blue', action: () => emit('navigateProjects') },
  { label: 'Mapa', icon: '🗺️', color: 'amber', action: () => emit('navigateCalendar') },
  { label: 'Grimório', icon: '📖', color: 'gold', action: () => emit('openReception') },
] as const;
</script>

<style scoped>
/* BARRA FLUTUANTE DE NAVEGAÇÃO (MOBILE): prancha de madeira com um pergaminho e quatro selos */
.mobile-bottom-journal {
  position: absolute;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  width: min(calc(100% - 32px), 420px);
  transform: translateX(-50%);
  z-index: 30;
  pointer-events: auto;
}

.journal-plank {
  position: relative;
  padding: 6px;
  border-radius: 12px;
  /* veios da madeira */
  background:
    linear-gradient(180deg, rgba(255, 220, 170, 0.12) 0%, transparent 35%, rgba(0, 0, 0, 0.25) 100%),
    repeating-linear-gradient(
      90deg,
      hsl(24, 38%, 28%) 0 9px,
      hsl(22, 42%, 22%) 9px 13px,
      hsl(25, 35%, 32%) 13px 21px
    );
  border: 1px solid rgba(15, 9, 4, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 150, 0.25),
    0 8px 22px rgba(0, 0, 0, 0.7);
}

.rivet {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d1d5db 0%, #4b5563 65%, #111827 100%);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
  z-index: 2;
}
.rivet-tl {
  top: 2px;
  left: 2px;
}
.rivet-tr {
  top: 2px;
  right: 2px;
}
.rivet-bl {
  bottom: 2px;
  left: 2px;
}
.rivet-br {
  bottom: 2px;
  right: 2px;
}

/* fita vermelha com pontas recortadas */
.journal-ribbon {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  padding: 3px 18px 4px;
  background: linear-gradient(180deg, hsl(352, 62%, 42%) 0%, hsl(350, 66%, 30%) 100%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 50%, 100% 100%, 0 100%, 8px 50%);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
  white-space: nowrap;
}
.journal-ribbon span {
  display: block;
  font-family: var(--font-guild-title, serif);
  font-size: 0.68rem;
  letter-spacing: 0.6px;
  color: hsl(42, 90%, 82%);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
}

.journal-parchment {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 14px 4px 6px;
  border-radius: 7px;
  background: radial-gradient(
    ellipse at 50% 35%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  box-shadow:
    inset 0 0 14px rgba(110, 70, 35, 0.45),
    inset 0 0 0 1px rgba(92, 58, 30, 0.35);
}

.journal-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 64px;
  padding: 2px 0;
  background: none;
  border: none;
  color: var(--guild-wood-dark, #2b1810);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* traço de tinta separando os selos */
.journal-btn + .journal-btn::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12%;
  bottom: 12%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(92, 58, 30, 0.45), transparent);
}

.journal-btn :deep(.wax-outer-ring) {
  transition: transform 0.15s ease;
}

.journal-btn:active :deep(.wax-outer-ring) {
  transform: scale(0.88) rotate(-6deg);
}

.journal-label {
  font-family: var(--font-guild-title, serif);
  font-size: 0.72rem;
  letter-spacing: 0.3px;
  line-height: 1;
}
</style>
