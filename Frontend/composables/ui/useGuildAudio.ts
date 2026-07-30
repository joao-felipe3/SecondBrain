import { ref } from 'vue'

const isMuted = ref(false)
const isAmbientPlaying = ref(false)

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export function useGuildAudio() {
  function toggleMute() {
    isMuted.value = !isMuted.value
    if (isMuted.value && isAmbientPlaying.value) {
      stopAmbientSound()
    }
  }

  // 1. SOM DE MOEDAS METÁLICAS (Clink)
  function playCoinsSound() {
    if (isMuted.value) return
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // 2 tons em rápida sequência simulando moedas colidindo
    const freqs = [1800, 2400, 3200]
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + index * 0.04)

      gain.gain.setValueAtTime(0, now + index * 0.04)
      gain.gain.linearRampToValueAtTime(0.18, now + index * 0.04 + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.04 + 0.25)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + index * 0.04)
      osc.stop(now + index * 0.04 + 0.25)
    })
  }

  // 2. SOM DE ADAGA VIBRANDO (Schwing / Vibrating Steel)
  function playDaggerSound() {
    if (isMuted.value) return
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Impacto grave + ressonância metálica
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.3)

    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.35)

    // Harmônico metálico agudo
    const metalOsc = ctx.createOscillator()
    const metalGain = ctx.createGain()
    metalOsc.type = 'sine'
    metalOsc.frequency.setValueAtTime(880, now)
    metalOsc.frequency.linearRampToValueAtTime(860, now + 0.4)

    metalGain.gain.setValueAtTime(0.15, now)
    metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

    metalOsc.connect(metalGain)
    metalGain.connect(ctx.destination)

    metalOsc.start(now)
    metalOsc.stop(now + 0.4)
  }

  // 3. SOM DE FOLHEAR PAPEL / PÁGINA (Paper Flip)
  function playPaperFlipSound() {
    if (isMuted.value) return
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const bufferSize = ctx.sampleRate * 0.12
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1200, now)
    filter.Q.setValueAtTime(2.5, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    whiteNoise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    whiteNoise.start(now)
  }

  // 4. SOM DE PORTA DE MADEIRA (Door Thud)
  function playDoorOpenSound() {
    if (isMuted.value) return
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.25)

    gain.gain.setValueAtTime(0.25, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.25)
  }

  let ambientNode: AudioBufferSourceNode | null = null

  // 5. ÁUDIO AMBIENTE SINTETIZADO (Estalar de lareira & fundo)
  function startAmbientSound() {
    if (isMuted.value || isAmbientPlaying.value) return
    const ctx = getAudioContext()
    if (!ctx) return

    isAmbientPlaying.value = true
  }

  function stopAmbientSound() {
    isAmbientPlaying.value = false
    if (ambientNode) {
      try {
        ambientNode.stop()
      } catch (e) {}
      ambientNode = null
    }
  }

  function toggleAmbientSound() {
    if (isAmbientPlaying.value) {
      stopAmbientSound()
    } else {
      startAmbientSound()
    }
  }

  return {
    isMuted,
    isAmbientPlaying,
    toggleMute,
    playCoinsSound,
    playDaggerSound,
    playPaperFlipSound,
    playDoorOpenSound,
    toggleAmbientSound,
    startAmbientSound,
    stopAmbientSound
  }
}
