import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyVars,
  boneWorlds,
  evalPose,
  invert,
  multiply,
  pickNext,
  sampleTrack,
  skinMesh,
  varsAt,
  type Mat2D,
  type Puppet,
  type PuppetAnim,
} from '~/composables/ui/puppet';

const close = (a: number[], b: number[], tol = 1e-6) =>
  a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(tol));

const arm: Puppet = {
  size: [100, 100],
  fps: 60,
  images: { img: ['a.webp', 0, 0, 10, 10] },
  bones: [
    { id: 'upper', parent: null, x: 10, y: 10, rotation: 0, length: 20 },
    { id: 'fore', parent: 'upper', rotation: 0, length: 20 },
  ],
  draw: [
    {
      id: 'piece',
      image: 'img',
      opacity: 1,
      mesh: {
        // um vértice preso ao braço (x=20) e um ao antebraço (x=40), na pose esticada
        v: [20, 10, 40, 10],
        uv: [0, 0, 1, 1],
        tri: [0, 1, 1],
        w: [0, 1, 0, 0, 1, 1, 0, 0],
        bones: ['upper', 'fore'],
        bind: [
          [1, 0, 0, 1, 10, 10],
          [1, 0, 0, 1, 30, 10],
        ],
      },
    },
  ],
  anims: [
    {
      name: 'dobra',
      frames: 60,
      tracks: {
        fore: {
          rotation: [
            [0, 0],
            [60, Math.PI / 2],
          ],
        },
        piece: {
          opacity: [
            [0, 1],
            [60, 0],
          ],
        },
      },
    },
  ],
  idleMs: [1000, 2000],
  weights: { idle: 1, gesture: 3 },
};

describe('marionete (player próprio)', () => {
  it('interpola keyframes linearmente e segura nas pontas', () => {
    const k: [number, number][] = [
      [0, 0],
      [10, 1],
      [20, 3],
    ];
    expect(sampleTrack(k, -5)).toBe(0);
    expect(sampleTrack(k, 5)).toBeCloseTo(0.5);
    expect(sampleTrack(k, 15)).toBeCloseTo(2);
    expect(sampleTrack(k, 99)).toBe(3);
  });

  it('inverte e multiplica matrizes afins', () => {
    const m: Mat2D = [0.6, 0.8, -0.8, 0.6, 5, -3];
    close(multiply(m, invert(m)), [1, 0, 0, 1, 0, 0]);
  });

  it('filho começa na ponta do pai e gira em volta dela', () => {
    const w = boneWorlds(arm, evalPose(arm, arm.anims[0]!, 60));
    close(w.fore!.slice(4), [30, 10]);
    close(w.fore!.slice(0, 4), [0, 1, -1, 0]); // 90°
  });

  it('na pose de ligação a malha não se mexe; dobrando, só o vértice do antebraço gira', () => {
    const out = new Float32Array(4);
    skinMesh(arm.draw[0]!.mesh!, boneWorlds(arm, evalPose(arm, null, 0)), out);
    close(Array.from(out), [20, 10, 40, 10], 1e-4);
    skinMesh(arm.draw[0]!.mesh!, boneWorlds(arm, evalPose(arm, arm.anims[0]!, 60)), out);
    close(Array.from(out), [20, 10, 30, 20], 1e-4);
    expect(evalPose(arm, arm.anims[0]!, 30).opacity.piece).toBeCloseTo(0.5);
  });

  it('sorteia parado ou gesto pelos pesos', () => {
    expect(pickNext(arm, () => 0)).toBe(-1); // peso 1 do parado vem primeiro
    expect(pickNext(arm, () => 0.99)).toBe(0);
  });

  it('Gloin real: em repouso as peças visíveis ficam exatamente onde foram pintadas', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/dwarf-crate/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const pose = evalPose(p, null, 0);
    const worlds = boneWorlds(p, pose);
    const visible = p.draw.filter((d) => d.mesh && pose.opacity[d.id]! > 0);
    expect(visible.length).toBeGreaterThan(0);
    for (const d of visible) {
      const out = skinMesh(d.mesh!, worlds, new Float32Array(d.mesh!.v.length));
      const err = Math.max(...Array.from(out).map((x, i) => Math.abs(x - d.mesh!.v[i]!)));
      expect(err).toBeLessThan(0.05);
    }
    // e cada gesto termina de volta no repouso
    for (const a of p.anims) {
      const end = evalPose(p, a, a.frames);
      for (const b of p.bones)
        expect(end.bones[b.id]!.rotation).toBeCloseTo(pose.bones[b.id]!.rotation, 3);
    }
  });

  it('estado entre gestos: efeito sobe aos poucos, respeita o máximo e acende as camadas', () => {
    const p: Puppet = {
      ...arm,
      vars: { dirt: { max: 2, layers: ['l1', 'l2'] } },
      anims: [
        {
          name: 'gesto_b',
          frames: 20,
          tracks: {},
          effects: [{ var: 'dirt', add: 1, from: 10, until: 20 }],
        },
        {
          name: 'gesto_c',
          frames: 20,
          tracks: {},
          weightBy: 'dirt',
          effects: [{ var: 'dirt', to: 0, from: 0, until: 10 }],
        },
      ],
    };
    const [b, c] = p.anims as [PuppetAnim, PuppetAnim];
    expect(varsAt(p, b, 15, { dirt: 0 }).dirt).toBeCloseTo(0.5);
    expect(varsAt(p, b, 20, { dirt: 2 }).dirt).toBe(2); // já no máximo
    expect(varsAt(p, c, 5, { dirt: 2 }).dirt).toBeCloseTo(1);
    const op: Record<string, number> = {};
    applyVars(p, { dirt: 1.5 }, op);
    expect(op).toEqual({ l1: 1, l2: 0.5 });
    // barba limpa: nunca sorteia a limpeza; suja: pode
    for (const r of [0, 0.3, 0.6, 0.99]) expect(pickNext(p, () => r, { dirt: 0 })).not.toBe(1);
    expect(pickNext(p, () => 0.99, { dirt: 2 })).toBe(1);
  });

  it('Gloin real: gole suja a barba e limpar zera', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/dwarf-crate/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const b = p.anims.find((a) => a.name === 'gesto_b')!;
    const c = p.anims.find((a) => a.name === 'gesto_c')!;
    expect(p.vars?.dirt?.layers.length).toBeGreaterThan(0);
    expect(varsAt(p, b, b.frames, { dirt: 0 }).dirt).toBe(1);
    expect(varsAt(p, c, c.frames, { dirt: 3 }).dirt).toBe(0);
    expect(c.weightBy).toBe('dirt');
    // limpa: sem sujeira, as camadas ficam apagadas
    const op: Record<string, number> = {};
    applyVars(p, { dirt: 0 }, op);
    expect(Object.values(op).every((x) => x === 0)).toBe(true);
  });
});
