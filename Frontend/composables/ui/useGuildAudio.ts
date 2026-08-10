import { ref } from "vue";

const isMuted = ref(false);
const isAmbientPlaying = ref(false);

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function useGuildAudio() {
  function toggleMute() {
    isMuted.value = !isMuted.value;
    if (isMuted.value && isAmbientPlaying.value) {
      stopAmbientSound();
    }
  }

  // 1. SOM DE MOEDAS METÁLICAS (Clink)
  function playCoinsSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 2 tons em rápida sequência simulando moedas colidindo
    const freqs = [1800, 2400, 3200];
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.04);

      gain.gain.setValueAtTime(0, now + index * 0.04);
      gain.gain.linearRampToValueAtTime(0.18, now + index * 0.04 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.04 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.04);
      osc.stop(now + index * 0.04 + 0.25);
    });
  }

  // 2. SOM DE ADAGA VIBRANDO (Schwing / Vibrating Steel)
  function playDaggerSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Impacto grave + ressonância metálica
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.3);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    // Harmônico metálico agudo
    const metalOsc = ctx.createOscillator();
    const metalGain = ctx.createGain();
    metalOsc.type = "sine";
    metalOsc.frequency.setValueAtTime(880, now);
    metalOsc.frequency.linearRampToValueAtTime(860, now + 0.4);

    metalGain.gain.setValueAtTime(0.15, now);
    metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    metalOsc.connect(metalGain);
    metalGain.connect(ctx.destination);

    metalOsc.start(now);
    metalOsc.stop(now + 0.4);
  }

  // 3. SOM DE FOLHEAR PAPEL / PÁGINA (Paper Flip)
  function playPaperFlipSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(2.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    whiteNoise.start(now);
  }

  // 4. SOM DIEGÉTICO DE RANGER DE PORTA (Carrega .wav ou .wav com ajuste dinâmico de duração)
  let activeDoorAudio: HTMLAudioElement | null = null;
  let activeDoorTimeout: any = null;

  function stopDoorSound() {
    if (activeDoorAudio) {
      try {
        activeDoorAudio.pause();
        activeDoorAudio.currentTime = 0;
      } catch (e) {}
      activeDoorAudio = null;
    }
    if (activeDoorTimeout) {
      clearTimeout(activeDoorTimeout);
      activeDoorTimeout = null;
    }
  }

  function playDoorSound(
    baseName: string,
    targetDurationMs: number = 600,
    volume: number = 0.6,
  ) {
    if (isMuted.value || typeof window === "undefined") return;

    stopDoorSound();

    // Tenta carregar .wav primeiro, depois .wav
    const formats = [`/vfx/${baseName}.wav`, `/vfx/${baseName}.wav`];
    let audio: HTMLAudioElement | null = null;

    const targetSec = targetDurationMs / 1000;

    for (const src of formats) {
      try {
        const a = new Audio(src);
        audio = a;
        break;
      } catch (e) {}
    }

    if (!audio) return;

    audio.volume = volume;

    const applyPlaybackRate = () => {
      if (
        audio &&
        audio.duration &&
        isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        // Adapta a velocidade para coincidir exatamente com a duração da animação (0.5x a 3.0x)
        const rate = audio.duration / targetSec;
        audio.playbackRate = Math.max(0.4, Math.min(3.5, rate));
      }
    };

    audio.addEventListener("loadedmetadata", applyPlaybackRate);
    if (audio.readyState >= 1) {
      applyPlaybackRate();
    }

    activeDoorAudio = audio;

    audio.play().catch(() => {});

    // Interrompe o som exatamente quando a animação termina
    activeDoorTimeout = setTimeout(() => {
      stopDoorSound();
    }, targetDurationMs);
  }

  function playDoorOpenSound(targetDurationMs: number = 600) {
    playDoorSound("door-open", targetDurationMs, 0.6);
  }

  function playDoorCloseSound(targetDurationMs: number = 400) {
    playDoorSound("door-close", targetDurationMs, 0.5);
  }

  // 5. SOM DE PASSOS NA PEDRA (Footsteps on Stone)
  function playFootstepsStoneSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const stepTimes = [0, 0.16, 0.32];

    stepTimes.forEach((delay, idx) => {
      const stepNow = now + delay;

      // Thud grave de impacto na pedra
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(110 - idx * 10, stepNow);
      osc.frequency.exponentialRampToValueAtTime(35, stepNow + 0.1);

      gain.gain.setValueAtTime(0.3, stepNow);
      gain.gain.exponentialRampToValueAtTime(0.001, stepNow + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(stepNow);
      osc.stop(stepNow + 0.12);

      // Ruído de fricção no pedregulho/cascalho
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(600, stepNow);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, stepNow);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, stepNow + 0.08);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(stepNow);
    });
  }

  // 6. SOM DIEGÉTICO DE ZUMBIDO MÁGICO DO PORTAL (Magic Portal Hover SFX)
  function playPortalHumSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Ressonância harmônica mística (Warm portal hum)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.5);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.55);

    // Shimmer etéreo de névoa (Bruma mágica)
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.2);
    filter.Q.setValueAtTime(3, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.06, now + 0.06);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
  }

  // DISPATCHER GERAL DE EFEITOS SONOROS (playSFX)
  function playSFX(sfxName: string) {
    switch (sfxName) {
      case "footsteps-stone":
        playFootstepsStoneSound();
        break;
      case "coins":
        playCoinsSound();
        break;
      case "dagger":
        playDaggerSound();
        break;
      case "paper":
        playPaperFlipSound();
        break;
      case "door":
        playDoorOpenSound();
        break;
      case "portal-hum":
        playPortalHumSound();
        break;
      default:
        playFootstepsStoneSound();
    }
  }

  let ambientNode: AudioBufferSourceNode | null = null;

  // 6. ÁUDIO AMBIENTE SINTETIZADO (Estalar de lareira & fundo)
  function startAmbientSound() {
    if (isMuted.value || isAmbientPlaying.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    isAmbientPlaying.value = true;
  }

  function stopAmbientSound() {
    isAmbientPlaying.value = false;
    if (ambientNode) {
      try {
        ambientNode.stop();
      } catch (e) {}
      ambientNode = null;
    }
  }

  function toggleAmbientSound() {
    if (isAmbientPlaying.value) {
      stopAmbientSound();
    } else {
      startAmbientSound();
    }
  }

  return {
    isMuted,
    isAmbientPlaying,
    toggleMute,
    playSFX,
    playCoinsSound,
    playDaggerSound,
    playPaperFlipSound,
    playDoorOpenSound,
    playDoorCloseSound,
    playPortalHumSound,
    playFootstepsStoneSound,
    toggleAmbientSound,
    startAmbientSound,
    stopAmbientSound,
  };
}
