<template>
  <header class="guild-top-banner">
    <div class="diegetic-banner-box">
      <span class="banner-icon">🏰</span>
      <div class="banner-text-group">
        <h1 class="banner-title">SAGUÃO CENTRAL DA GUILDA</h1>
        <span class="banner-subtitle"
          >Recepção de Aventureiros & Mural de Missões</span
        >
      </div>

      <!-- Botão Mute / Unmute Diegético -->
      <button
        class="audio-toggle-btn"
        :class="{ 'is-muted': isMuted }"
        @click="emit('toggleMute')"
        :title="
          isMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'
        "
      >
        <span>{{ isMuted ? "🔇" : "🔊" }}</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  isMuted: boolean;
}>();

const emit = defineEmits<{
  (e: "toggleMute"): void;
}>();
</script>

<style scoped>
/* BANNER DIEGÉTICO NO TOPO (HUD LAYER) */
.guild-top-banner {
  position: absolute;
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  pointer-events: auto;
}

.diegetic-banner-box {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border: 2.5px solid var(--guild-wood-mid, #5c3a1e);
  border-radius: 30px;
  padding: 0.5rem 1.6rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow:
    inset 0 0 15px rgba(110, 75, 40, 0.35),
    0 8px 24px rgba(0, 0, 0, 0.7);
}

.banner-icon {
  font-size: 1.6rem;
}

.banner-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.banner-title {
  font-family: var(--font-guild-title, serif);
  font-size: 1.25rem;
  color: var(--guild-wood-dark, #2b1810);
  margin: 0;
  line-height: 1.1;
  letter-spacing: 0.5px;
}

.banner-subtitle {
  font-size: 0.75rem;
  color: hsl(25, 35%, 30%);
  font-weight: 500;
}

.audio-toggle-btn {
  background: rgba(140, 95, 50, 0.2);
  border: 1.5px solid var(--guild-wood-mid, #5c3a1e);
  border-radius: 50%;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.audio-toggle-btn:hover {
  transform: scale(1.1);
  background: rgba(140, 95, 50, 0.4);
}

.audio-toggle-btn.is-muted {
  opacity: 0.6;
}

@media (max-height: 500px) and (orientation: landscape) {
  .guild-top-banner {
    top: 0.35rem;
  }
  .diegetic-banner-box {
    padding: 0.25rem 0.9rem;
    gap: 0.5rem;
  }
  .banner-title {
    font-size: 0.9rem;
  }
  .banner-subtitle {
    font-size: 0.65rem;
  }
  .banner-icon {
    font-size: 1.1rem;
  }
  .audio-toggle-btn {
    width: 26px;
    height: 26px;
    font-size: 0.8rem;
  }
}
</style>
