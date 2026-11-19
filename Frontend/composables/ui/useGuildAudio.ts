import { ref } from 'vue';

const isMuted = ref(false);
const isAmbientPlaying = ref(false);

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
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

  // 1. SOM DE MOEDAS METÁLICAS (Clink / Chime)
  function playCoinsSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Pequena variação aleatória de pitch para cada clique soar natural e orgânico
    const pitchShift = (Math.random() - 0.5) * 120;

    // Frequências ricas e agudas simulando o tilintar de ouro no balcão
    const freqs = [1900 + pitchShift, 2550 + pitchShift, 3400 + pitchShift];
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.035);

      gain.gain.setValueAtTime(0, now + index * 0.035);
      gain.gain.linearRampToValueAtTime(0.22, now + index * 0.035 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.035 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.035);
      osc.stop(now + index * 0.035 + 0.28);
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

    osc.type = 'triangle';
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
    metalOsc.type = 'sine';
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
    // no primeiro gesto o contexto ainda está suspenso: agenda só depois de retomar
    if (ctx.state !== 'running') {
      ctx
        .resume()
        .then(() => renderPaperFlip(ctx))
        .catch(() => {});
      return;
    }
    renderPaperFlip(ctx);
  }

  /** página virando: sobe com um chiado crocante (fibras do papel) e assenta com um "flap" curto */
  function renderPaperFlip(ctx: AudioContext) {
    const now = ctx.currentTime + 0.01;
    const dur = 0.42;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let crackle = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.004) crackle = 1;
      crackle *= 0.995;
      data[i] = (Math.random() * 2 - 1) * (0.55 + 0.45 * crackle);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.92 + Math.random() * 0.16; // cada folheada um pouco diferente

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 350;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(900, now);
    band.frequency.exponentialRampToValueAtTime(3200, now + 0.22);
    band.frequency.exponentialRampToValueAtTime(1800, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.08); // a página sobe
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.24);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.3); // e assenta
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(highpass).connect(band).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.05);
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

  function playDoorSound(baseName: string, targetDurationMs: number = 600, volume: number = 0.6) {
    if (isMuted.value || typeof window === 'undefined') return;

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
      if (audio && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        // Adapta a velocidade para coincidir exatamente com a duração da animação (0.5x a 3.0x)
        const rate = audio.duration / targetSec;
        audio.playbackRate = Math.max(0.4, Math.min(3.5, rate));
      }
    };

    audio.addEventListener('loadedmetadata', applyPlaybackRate);
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
    playDoorSound('door-open', targetDurationMs, 0.6);
  }

  function playDoorCloseSound(targetDurationMs: number = 400) {
    playDoorSound('door-close', targetDurationMs, 0.5);
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
      osc.type = 'triangle';
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
      noiseFilter.type = 'lowpass';
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

    osc.type = 'sine';
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
    filter.type = 'bandpass';
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

  // 7. SOM DIEGÉTICO SUAVE DE FLUTUAÇÃO DE VELUDO / ESTANDARTE AO VENTO (Pennant Velvet Flutter SFX)
  let lastPennantFlutterTime = 0;

  function playPennantFlutterSound() {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Debounce de 280ms para evitar disparos repetidos ao mover o cursor
    if (now - lastPennantFlutterTime < 0.28) return;
    lastPennantFlutterTime = now;

    // A. Sopro de ar quente e veludo (Ruído filtrado suave)
    const duration = 0.32;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Ruído marrom/rosa suavizado para textura de tecido
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Filtro de passagem de faixa com varredura suave simulando o ondular do tecido
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(750, now + 0.12);
    filter.frequency.exponentialRampToValueAtTime(420, now + duration);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start(now);

    // B. Sub-harmônico sutil de vento/brisa suave
    const breezeOsc = ctx.createOscillator();
    const breezeGain = ctx.createGain();
    breezeOsc.type = 'sine';
    breezeOsc.frequency.setValueAtTime(95, now);
    breezeOsc.frequency.exponentialRampToValueAtTime(65, now + duration);

    breezeGain.gain.setValueAtTime(0, now);
    breezeGain.gain.linearRampToValueAtTime(0.045, now + 0.05);
    breezeGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    breezeOsc.connect(breezeGain);
    breezeGain.connect(ctx.destination);

    breezeOsc.start(now);
    breezeOsc.stop(now + duration);
  }

  // DISPATCHER GERAL DE EFEITOS SONOROS (playSFX)
  function playSFX(sfxName: string) {
    switch (sfxName) {
      case 'footsteps-stone':
        playFootstepsStoneSound();
        break;
      case 'coins':
        playCoinsSound();
        break;
      case 'dagger':
        playDaggerSound();
        break;
      case 'paper':
        playPaperFlipSound();
        break;
      case 'door':
        playDoorOpenSound();
        break;
      case 'portal-hum':
        playPortalHumSound();
        break;
      case 'pennant':
      case 'flutter':
        playPennantFlutterSound();
        break;
      case 'parchment-drag':
        playParchmentDragSound();
        break;
      case 'wax-stamp':
        playWaxStampSound();
        break;
      case 'quill':
        playQuillScratchSound();
        break;
      case 'paper-tear':
        playPaperTearSound();
        break;
      default:
        playFootstepsStoneSound();
    }
  }

  let ambientNode: AudioBufferSourceNode | null = null;

  // 5b. SFX DO MURAL DE CONTRATOS (sintetizados, sem arquivos)

  /** roda `render` com o contexto ativo; no primeiro gesto o contexto ainda pode estar suspenso */
  function withRunningContext(render: (ctx: AudioContext) => void) {
    if (isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      ctx
        .resume()
        .then(() => render(ctx))
        .catch(() => {});
      return;
    }
    render(ctx);
  }

  /** buffer de ruído com envelope de "fibras" (estalos esparsos), base dos sons de papel e pena */
  function noiseBuffer(ctx: AudioContext, dur: number, grain: number) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let crackle = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < grain) crackle = 1;
      crackle *= 0.993;
      data[i] = (Math.random() * 2 - 1) * (0.35 + 0.65 * crackle);
    }
    return buffer;
  }

  /** pergaminho raspando na madeira ao ser arrancado do mural (início do arrasto) */
  function playParchmentDragSound() {
    withRunningContext((ctx) => {
      const now = ctx.currentTime + 0.01;
      const dur = 0.5;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, dur, 0.006);
      src.playbackRate.value = 0.85 + Math.random() * 0.2;

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.7;
      band.frequency.setValueAtTime(1400, now);
      band.frequency.exponentialRampToValueAtTime(2600, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.05);
    });
  }

  /** martelo de cera: baque grave de madeira + "tch" da cera amassando (ao concluir) */
  function playWaxStampSound() {
    withRunningContext((ctx) => {
      const now = ctx.currentTime + 0.01;

      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(150, now);
      thump.frequency.exponentialRampToValueAtTime(55, now + 0.18);
      thumpGain.gain.setValueAtTime(0.0001, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.55, now + 0.008);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      thump.connect(thumpGain).connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.3);

      const squish = ctx.createBufferSource();
      squish.buffer = noiseBuffer(ctx, 0.18, 0.02);
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(1800, now);
      low.frequency.exponentialRampToValueAtTime(400, now + 0.16);
      const squishGain = ctx.createGain();
      squishGain.gain.setValueAtTime(0.0001, now + 0.01);
      squishGain.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
      squishGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      squish.connect(low).connect(squishGain).connect(ctx.destination);
      squish.start(now + 0.01);
      squish.stop(now + 0.22);
    });
  }

  /** pena de ganso riscando o pergaminho: três traços rápidos (ao salvar a edição) */
  function playQuillScratchSound() {
    withRunningContext((ctx) => {
      const start = ctx.currentTime + 0.01;
      const strokes = [
        { at: 0, dur: 0.16 },
        { at: 0.2, dur: 0.12 },
        { at: 0.36, dur: 0.22 },
      ];
      for (const s of strokes) {
        const t = start + s.at;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, s.dur, 0.03);
        src.playbackRate.value = 1.1 + Math.random() * 0.3;
        const high = ctx.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = 2500;
        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.setValueAtTime(4200 + Math.random() * 800, t);
        peak.gain.value = 9;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + s.dur);
        src.connect(high).connect(peak).connect(gain).connect(ctx.destination);
        src.start(t);
        src.stop(t + s.dur + 0.03);
      }
    });
  }

  /** folha rasgando: chiado crescente e áspero que termina num estalo seco (ao excluir) */
  function playPaperTearSound() {
    withRunningContext((ctx) => {
      const now = ctx.currentTime + 0.01;
      const dur = 0.55;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, dur, 0.05);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.setValueAtTime(700, now);
      band.frequency.exponentialRampToValueAtTime(3800, now + dur * 0.85);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.12);
      gain.gain.linearRampToValueAtTime(0.42, now + dur * 0.85);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.05);
    });
  }

  // 6. ÁUDIO AMBIENTE SINTETIZADO (Estalar de lareira & fundo)
  function startAmbientSound() {
    if (isMuted.value || isAmbientPlaying.value) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 1.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    ambientNode = source;
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
    playPennantFlutterSound,
    playFootstepsStoneSound,
    playParchmentDragSound,
    playWaxStampSound,
    playQuillScratchSound,
    playPaperTearSound,
    toggleAmbientSound,
    startAmbientSound,
    stopAmbientSound,
  };
}
