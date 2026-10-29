<template>
  <div v-if="isMobile" class="mobile-bottom-journal">
    <UiParchmentCard variant="scroll" class="journal-card-container">
      <div class="journal-header">
        <span>📜 Diário de Navegação da Guilda</span>
      </div>
      <div class="journal-buttons-grid">
        <button type="button" class="journal-btn" @click="emit('navigateTasks')">
          <UiWaxSeal color="red" size="sm" icon="⚔️" />
          <span>Missões</span>
        </button>

        <button type="button" class="journal-btn" @click="emit('navigateProjects')">
          <UiWaxSeal color="blue" size="sm" icon="📚" />
          <span>Arquivos</span>
        </button>

        <button type="button" class="journal-btn" @click="emit('navigateCalendar')">
          <UiWaxSeal color="amber" size="sm" icon="🗺️" />
          <span>Mapa</span>
        </button>

        <button type="button" class="journal-btn" @click="emit('openReception')">
          <UiWaxSeal color="gold" size="sm" icon="📖" />
          <span>Grimório</span>
        </button>
      </div>
    </UiParchmentCard>
  </div>
</template>

<script setup lang="ts">
import UiParchmentCard from '~/components/ui/diegetic/UiParchmentCard.vue';
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
</script>

<style scoped>
/* BARRA FLUTUANTE DE NAVEGAÇÃO DIÁRIA (MOBILE) */
.mobile-bottom-journal {
  position: absolute;
  bottom: 1rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 30;
  pointer-events: auto;
}

.journal-card-container {
  padding: 0.65rem 0.75rem !important;
  border: 2px solid var(--guild-wood-mid, #5c3a1e) !important;
}

.journal-header {
  text-align: center;
  font-family: var(--font-guild-title, serif);
  font-size: 0.82rem;
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  margin-bottom: 0.45rem;
}

.journal-buttons-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.45rem;
}

.journal-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.45rem 0.25rem;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(130, 85, 45, 0.35);
  border-radius: 6px;
  text-decoration: none;
  color: var(--guild-wood-dark, #2b1810);
  font-family: var(--font-guild-title, serif);
  font-size: 0.72rem;
  font-weight: bold;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.journal-btn:active {
  background: rgba(255, 255, 255, 0.85);
  transform: scale(0.95);
}
</style>
