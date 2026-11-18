/**
 * Som do saguão: o alaúde do bardo e o ambiente de fundo.
 *
 * A peça é Greensleeves (tradicional inglesa, séc. XVI, domínio público), arranjada em
 * scripts/hall-life/loop_rig.py (melodia + baixo + acorde dedilhado).
 *
 * O alaúde é sintetizado (Karplus-Strong: um ruído curto realimentado por uma linha de atraso do
 * tamanho do período da nota soa como corda dedilhada), sem arquivos de áudio. Cada nota vem da
 * marionete (`GuildPuppetCanvas` -> `cue`) no relógio da animação: a mão desenhada cruza as cordas
 * em cada tempo. Os acordes trocam junto com a mão do braço do alaúde.
 *
 * Navegadores só liberam áudio depois de um gesto do usuário: `arm()` espera o primeiro clique/tecla.
 * Respeita o mudo do saguão (`useGuildAudio().isMuted`).
 */
import { watch } from 'vue';
import { getAudioContext, useGuildAudio } from './useGuildAudio';
import type { PuppetCue } from './puppet';

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequência de uma nota em notação científica ("A4" = 440 Hz, "G#3", "Bb2"). */
export function noteFreq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`nota inválida: ${note}`);
  const midi = 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Corda dedilhada (Karplus-Strong) com decaimento de alaúde: ataque brilhante, cauda curta e quente. */
export function pluckSamples(freq: number, sampleRate: number, seconds = 2.2): Float32Array {
  const n = Math.round(sampleRate * seconds);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const out = new Float32Array(n);
  // excitação: ruído suavizado (palheta de pena, não metálica)
  let prev = 0;
  for (let i = 0; i < period; i++) {
    prev = prev * 0.45 + (Math.random() * 2 - 1) * 0.55;
    out[i] = prev;
  }
  // o fator vale por volta na linha de atraso: graves (menos voltas/s) sustentam mais, como tripa
  const decay = 0.994 + Math.min(0.0045, 40 / freq / 1000);
  for (let i = period; i < n; i++) {
    out[i] = decay * 0.5 * (out[i - period]! + out[Math.max(0, i - period - 1)]!);
  }
  return out;
}

let bus: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let armed = false;

function getBus(ctx: AudioContext): GainNode {
  if (bus) return bus;
  const input = ctx.createGain();
  // caixa do alaúde: corpo ressoando nos médios-graves, sem o brilho metálico
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 240;
  body.Q.value = 1.1;
  body.gain.value = 5;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600; // cordas de tripa: quente, sem brilho metálico
  // salão de pedra: reverberação sintetizada (ruído decaindo ~1,8 s)
  const len = Math.round(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  const master = ctx.createGain();
  master.gain.value = 0.14; // fundo: o bardo está do outro lado do saguão
  input.connect(body).connect(tone);
  tone.connect(master);
  tone.connect(verb).connect(wet).connect(master);
  master.connect(ctx.destination);
  bus = input;
  return bus;
}

function noteBuffer(ctx: AudioContext, note: string): AudioBuffer {
  const key = `${note}@${ctx.sampleRate}`;
  let b = buffers.get(key);
  if (!b) {
    b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2.2), ctx.sampleRate);
    b.getChannelData(0).set(pluckSamples(noteFreq(note), ctx.sampleRate));
    buffers.set(key, b);
  }
  return b;
}

export function useHallMusic() {
  const { isMuted, startAmbientSound, stopAmbientSound } = useGuildAudio();

  /** Libera o áudio no primeiro gesto do usuário e liga o ambiente de fundo do saguão. */
  function arm() {
    if (armed || typeof window === 'undefined') return;
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      armed = true;
      getAudioContext();
      if (!isMuted.value) startAmbientSound();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    watch(isMuted, (muted) => {
      if (!armed) return;
      if (muted) stopAmbientSound();
      else startAmbientSound();
    });
  }

  /** Uma nota do alaúde: soa pela duração escrita e abafa (como o dedo soltando a corda). */
  function play(cue: PuppetCue) {
    if (!armed || isMuted.value) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    // pequena imprecisão humana (±6 ms) para não soar mecânico
    const at = ctx.currentTime + 0.01 + Math.random() * 0.012;
    const ring = Math.min(2.1, cue.seconds + 0.35);
    const src = ctx.createBufferSource();
    src.buffer = noteBuffer(ctx, cue.note);
    const g = ctx.createGain();
    const level = cue.gain * (0.3 + Math.random() * 0.03);
    g.gain.setValueAtTime(level, at);
    g.gain.setValueAtTime(level, at + ring - 0.25);
    g.gain.linearRampToValueAtTime(0.0001, at + ring);
    src.connect(g).connect(getBus(ctx));
    src.start(at);
    src.stop(at + ring + 0.05);
  }

  return { arm, play };
}
