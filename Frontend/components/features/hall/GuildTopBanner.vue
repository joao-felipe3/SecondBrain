<template>
  <header class="guild-top-banner">
    <!-- cordas e pregos da placa pendurada (só aparecem no mobile) -->
    <span class="banner-rope rope-left" aria-hidden="true"></span>
    <span class="banner-rope rope-right" aria-hidden="true"></span>
    <div class="diegetic-banner-box">
      <span class="banner-icon" aria-hidden="true">🏰</span>
      <div class="banner-text-group">
        <h1 class="banner-title">SAGUÃO CENTRAL DA GUILDA</h1>
        <span class="banner-subtitle"
          ><span class="subtitle-full">Recepção de Aventureiros & Mural de Missões</span
          ><span class="subtitle-short">Recepção & Mural de Missões</span></span
        >
      </div>

      <!-- Botão Mute / Unmute Diegético -->
      <button
        class="audio-toggle-btn"
        :class="{ 'is-muted': isMuted }"
        @click="emit('toggleMute')"
        :title="isMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'"
      >
        <span>{{ isMuted ? '🔇' : '🔊' }}</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  isMuted: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleMute'): void;
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

.banner-rope,
.subtitle-short {
  display: none;
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

/* MOBILE: placa de madeira pendurada por cordas, título numa linha e proporção de HUD de celular */
@media (max-width: 640px), (orientation: portrait) {
  .guild-top-banner {
    top: calc(14px + env(safe-area-inset-top, 0px));
    width: min(calc(100% - 32px), 360px);
  }

  .banner-rope {
    display: block;
    position: absolute;
    bottom: 100%;
    width: 4px;
    height: calc(30px + env(safe-area-inset-top, 0px));
    border-radius: 2px;
    /* corda torcida */
    background: repeating-linear-gradient(-35deg, hsl(33, 45%, 52%) 0 3px, hsl(28, 40%, 30%) 3px 5px);
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.5);
  }
  .rope-left {
    left: 22%;
  }
  .rope-right {
    right: 22%;
  }
  /* argola de ferro onde a corda encontra a placa */
  .banner-rope::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -7px;
    width: 9px;
    height: 9px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #9ca3af 0%, #374151 70%, #111827 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  .diegetic-banner-box {
    position: relative;
    gap: 0.55rem;
    padding: 0.4rem 0.55rem 0.4rem 0.7rem;
    border-radius: 9px;
    /* moldura de madeira em volta do pergaminho */
    border: 4px solid transparent;
    background:
      radial-gradient(
          ellipse at 50% 40%,
          var(--guild-parchment-base, #f4e4bc) 0%,
          var(--guild-parchment-dark, #d8bc82) 100%
        )
        padding-box,
      repeating-linear-gradient(
          90deg,
          hsl(24, 38%, 30%) 0 7px,
          hsl(22, 42%, 24%) 7px 11px,
          hsl(25, 35%, 34%) 11px 16px
        )
        border-box;
    box-shadow:
      inset 0 0 14px rgba(110, 75, 40, 0.4),
      0 0 0 1px rgba(20, 12, 6, 0.85),
      0 6px 16px rgba(0, 0, 0, 0.65);
  }

  /* filete de tinta interno, como um rótulo pintado */
  .diegetic-banner-box::before {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid rgba(92, 58, 30, 0.45);
    border-radius: 5px;
    pointer-events: none;
  }

  .banner-icon {
    font-size: 1.25rem;
    line-height: 1;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  }

  .banner-text-group {
    flex: 1;
    min-width: 0;
  }

  .banner-title {
    font-size: clamp(0.82rem, 4.1vw, 1.02rem);
    white-space: nowrap;
    letter-spacing: 0.6px;
    text-shadow: 0 1px 0 rgba(255, 245, 220, 0.6);
  }

  /* subtítulo entre dois traços de pena */
  .banner-subtitle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    margin-top: 1px;
    font-size: clamp(0.56rem, 2.6vw, 0.66rem);
    letter-spacing: 0.3px;
    white-space: nowrap;
    color: hsl(25, 38%, 32%);
  }
  .subtitle-full {
    display: none;
  }
  .subtitle-short {
    display: inline;
  }
  .banner-subtitle::before,
  .banner-subtitle::after {
    content: '';
    flex: 1;
    height: 1px;
    min-width: 8px;
    background: linear-gradient(90deg, transparent, rgba(92, 58, 30, 0.6), transparent);
  }

  .audio-toggle-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    font-size: 0.85rem;
    background: radial-gradient(circle at 35% 30%, hsl(36, 45%, 70%) 0%, hsl(30, 40%, 50%) 100%);
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, 0.45),
      0 1px 3px rgba(0, 0, 0, 0.4);
    -webkit-tap-highlight-color: transparent;
  }
  .audio-toggle-btn:active {
    transform: scale(0.92);
  }
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
