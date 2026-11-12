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

  it('bardo real: os trechos em loop emendam sem salto e a malha parte do desenho', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/stair-bard/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    expect(p.weights.idle).toBe(0); // toca sem parar
    const idle = evalPose(p, null, 0);
    for (const a of p.anims) {
      const start = evalPose(p, a, 0);
      const end = evalPose(p, a, a.frames);
      for (const b of p.bones) {
        expect(start.bones[b.id]!.rotation).toBeCloseTo(end.bones[b.id]!.rotation, 4);
        expect(start.bones[b.id]!.rotation).toBeCloseTo(idle.bones[b.id]!.rotation, 4);
      }
    }
    // com os ossos na pose de ligação, a malha fica exatamente sobre o desenho
    const fig = p.draw.find((d) => d.mesh)!;
    const bind = evalPose(p, null, 0);
    for (const b of p.bones) {
      const m = fig.mesh!.bind[fig.mesh!.bones.indexOf(b.id)];
      if (m && !b.parent) bind.bones[b.id]!.rotation = Math.atan2(m[1], m[0]);
    }
    const mao = p.bones.find((b) => b.parent)!;
    const par = fig.mesh!.bind[fig.mesh!.bones.indexOf(mao.parent!)]!;
    const own = fig.mesh!.bind[fig.mesh!.bones.indexOf(mao.id)]!;
    bind.bones[mao.id]!.rotation = Math.atan2(own[1], own[0]) - Math.atan2(par[1], par[0]);
    const out = skinMesh(fig.mesh!, boneWorlds(p, bind), new Float32Array(fig.mesh!.v.length));
    const err = Math.max(...Array.from(out).map((x, i) => Math.abs(x - fig.mesh!.v[i]!)));
    expect(err).toBeLessThan(0.05);
  });

  it('recepcionista real: escreve sem parar e os trechos emendam sem salto', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/receptionist/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    expect(p.weights.idle).toBe(0);
    const idle = evalPose(p, null, 0);
    for (const a of p.anims) {
      for (const f of [0, a.frames]) {
        const pose = evalPose(p, a, f);
        for (const b of p.bones)
          expect(pose.bones[b.id]!.rotation).toBeCloseTo(idle.bones[b.id]!.rotation, 4);
      }
    }
    // olhando para cima ela para de escrever: a mão fica no lugar do meio do olhar
    const olhar = p.anims.find((a) => a.name === 'gesto_olhar')!;
    const mid = (olhar.frames / 12) * 6;
    const r = (f: number) => evalPose(p, olhar, f).bones.mao!.rotation;
    expect(Math.abs(r(mid) - r(mid + 7))).toBeLessThan(0.002);
  });

  it('recepcionista real: vira a página depois de escrever algumas linhas, um quadro de folha por vez', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/receptionist/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const virar = p.anims.find((a) => a.name === 'gesto_virar')!;
    const escrever = p.anims.find((a) => a.name === 'gesto_escrever')!;
    const folhas = p.draw.filter((d) => d.id.startsWith('pagina')).map((d) => d.id);
    expect(folhas.length).toBeGreaterThan(8);
    // nunca vira sem ter escrito; cada linha escrita deixa a virada mais provável
    expect(virar.weightBy).toBe('linhas');
    expect(pickNext(p, () => 0.999, { linhas: 0 })).not.toBe(p.anims.indexOf(virar));
    expect(varsAt(p, escrever, escrever.frames, { linhas: 2 }).linhas).toBe(3);
    expect(varsAt(p, virar, virar.frames, { linhas: 4 }).linhas).toBe(0);
    // no máximo uma folha visível por quadro (sem "folha dupla"), e nenhuma fora do trecho
    let shown = 0;
    for (let f = 0; f <= virar.frames; f++) {
      const vis = folhas.filter((id) => evalPose(p, virar, f).opacity[id]! > 0.5);
      expect(vis.length).toBeLessThanOrEqual(1);
      shown += vis.length;
    }
    expect(shown).toBeGreaterThan(folhas.length);
    for (const id of folhas) expect(evalPose(p, escrever, escrever.frames / 2).opacity[id]).toBe(0);
  });

  it('recepcionista real: a mão anda até o canto da página (sem saltar) antes da folha subir', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/receptionist/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const virar = p.anims.find((a) => a.name === 'gesto_virar')!;
    const mao = p.draw.find((d) => d.id === 'pose_canto_mao')!;
    const osso = mao.mesh!.bones[1]!;
    const folhas = p.draw.filter((d) => d.id.startsWith('pagina')).map((d) => d.id);
    const at = (f: number) => {
      const pose = evalPose(p, virar, f);
      const m = boneWorlds(p, pose)[osso]!;
      return {
        x: m[4],
        y: m[5],
        op: pose.opacity[mao.id]!,
        folha: folhas.some((id) => pose.opacity[id]! > 0.5),
      };
    };
    let prev = at(0);
    let path = 0;
    let firstFolha = -1;
    let arrived = -1;
    for (let f = 1; f <= virar.frames; f++) {
      const cur = at(f);
      if (cur.op > 0.05 && prev.op > 0.05) {
        const step = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        expect(step).toBeLessThan(25); // anda, não teletransporta
        path += step;
      }
      const home = Math.hypot(cur.x - mao.mesh!.bind[1]![4], cur.y - mao.mesh!.bind[1]![5]);
      if (arrived < 0 && cur.op > 0.99 && home < 0.5) arrived = f;
      if (firstFolha < 0 && cur.folha) firstFolha = f;
      prev = cur;
    }
    expect(path).toBeGreaterThan(300); // vai e volta visível (px do artboard)
    expect(arrived).toBeGreaterThan(0);
    expect(firstFolha).toBeGreaterThan(arrived); // a folha só sobe com a mão já no canto
  });
});
