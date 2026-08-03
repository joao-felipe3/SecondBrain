<template>
  <div v-if="isMobile" class="mobile-bottom-journal">
    <UiParchmentCard variant="scroll" class="journal-card-container">
      <div class="journal-header">
        <span>📜 Diário de Navegação da Guilda</span>
      </div>
      <div class="journal-buttons-grid">
        <NuxtLink to="/tasks" class="journal-btn" @click="emit('playDoorOpen')">
          <UiWaxSeal color="red" size="sm" icon="⚔️" />
          <span>Missões</span>
        </NuxtLink>

        <NuxtLink
          to="/projects"
          class="journal-btn"
          @click="emit('playDoorOpen')"
        >
          <UiWaxSeal color="blue" size="sm" icon="📚" />
          <span>Arquivos</span>
        </NuxtLink>

        <div class="journal-btn" @click="emit('openReception')">
          <UiWaxSeal color="gold" size="sm" icon="📖" />
          <span>Grimório</span>
        </div>
      </div>
    </UiParchmentCard>
  </div>
</template>

<script setup lang="ts">
import UiParchmentCard from "~/components/ui/diegetic/UiParchmentCard.vue";
import UiWaxSeal from "~/components/ui/diegetic/UiWaxSeal.vue";

defineProps<{
  isMobile: boolean;
}>();

const emit = defineEmits<{
  (e: "openReception"): void;
  (e: "playDoorOpen"): void;
}>();
</script>

<style scoped>
/* BARRA FLUTUANTE DE NAVEGAÇÃO DIÁRIA (MOBILE) */
.mobile-bottom-journal {
  position: absolute;
  bottom: 1.25rem;
  left: 1rem;
  right: 1rem;
  z-index: 30;
}

.journal-card-container {
  padding: 0.75rem !important;
  border: 2px solid var(--guild-wood-mid, #5c3a1e) !important;
}

.journal-header {
  text-align: center;
  font-family: var(--font-guild-title, serif);
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--guild-wood-dark, #2b1810);
  margin-bottom: 0.5rem;
}

.journal-buttons-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.journal-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(130, 85, 45, 0.3);
  border-radius: 6px;
  text-decoration: none;
  color: var(--guild-wood-dark, #2b1810);
  font-family: var(--font-guild-title, serif);
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
}

.journal-btn:active {
  background: rgba(255, 255, 255, 0.85);
  transform: scale(0.95);
}
</style>
