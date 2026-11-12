import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cuesBetween, evalPose, type Puppet, type PuppetMusic } from '~/composables/ui/puppet';
import { noteFreq, pluckSamples } from '~/composables/ui/useHallMusic';

const music: PuppetMusic = {
  bpm: 60, // 1 tempo = 60 quadros a 60 fps
  bar: 3,
  length: 6,
  events: [
    [0, 'A2', 0.8, 3],
    [0, 'C5', 0.7, 2],
    [1.5, 'E5', 0.7, 0.5],
    [3, 'G2', 0.8, 3],
  ],
};

describe('música do bardo', () => {
  it('cada nota sai uma vez, no quadro do seu tempo, e a música recomeça com o trecho', () => {
    const at = (f0: number, f1: number) => cuesBetween(music, 60, f0, f1).map((c) => c.note);
    expect(at(-1e-6, 0)).toEqual(['A2', 'C5']);
    expect(at(0, 89)).toEqual([]);
    expect(at(89, 90)).toEqual(['E5']); // 1,5 tempo × 60
    expect(at(90, 91)).toEqual([]);
    expect(cuesBetween(music, 60, 0, 90)[0]!.seconds).toBeCloseTo(0.5);
    // trecho de 2 voltas da música: a segunda volta repete as notas
    const all = cuesBetween(music, 60, -1e-6, 12 * 60 - 1e-6);
    expect(all.map((c) => c.beat)).toEqual([0, 0, 1.5, 3, 6, 6, 7.5, 9]);
  });

  it('notas em Hz', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('A2')).toBeCloseTo(110);
    expect(noteFreq('G#3')).toBeCloseTo(207.65, 1);
    expect(noteFreq('Bb2')).toBeCloseTo(116.54, 1);
  });

  it('corda dedilhada: ataque forte e decai (não explode, não some na hora)', () => {
    const s = pluckSamples(110, 44100);
    const rms = (a: number, b: number) =>
      Math.sqrt(s.slice(a, b).reduce((x, v) => x + v * v, 0) / (b - a));
    const start = rms(0, 4410);
    const later = rms(44100, 48510);
    expect(start).toBeGreaterThan(0.05);
    expect(later).toBeLessThan(start);
    expect(later).toBeGreaterThan(start * 0.05);
    expect(s.every((v) => Number.isFinite(v) && Math.abs(v) <= 1.5)).toBe(true);
  });

  it('bardo real: o trecho fecha na música inteira e a mão dos acordes volta ao começo', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/stair-bard/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const m = p.music!;
    const perBeat = (p.fps * 60) / m.bpm;
    for (const a of p.anims) {
      expect((a.frames / perBeat) % m.length).toBe(0);
      const cues = cuesBetween(m, p.fps, -1e-6, a.frames - 1e-6);
      expect(cues).toHaveLength((m.events.length * a.frames) / perBeat / m.length);
      const s = evalPose(p, a, 0).bones.mao_acorde!.rotation;
      expect(evalPose(p, a, a.frames).bones.mao_acorde!.rotation).toBeCloseTo(s, 5);
    }
    // todas as notas são válidas e caem dentro da música
    for (const [beat, note] of m.events) {
      expect(beat).toBeGreaterThanOrEqual(0);
      expect(beat).toBeLessThan(m.length);
      expect(noteFreq(note)).toBeGreaterThan(60);
    }
  });
});
