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

  it('mural real: trechos emendam sem salto, o braço levanta em 3 segmentos com arrasto e as camadas trocam sem dissolver parado', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/board-readers/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    expect(p.weights.idle).toBe(0);
    const idle = evalPose(p, null, 0);
    // parado = quadro 0 = último quadro de qualquer trecho (inclusive os ossos escondidos dos braços)
    for (const a of p.anims) {
      for (const f of [0, a.frames]) {
        const pose = evalPose(p, a, f);
        for (const b of p.bones) {
          expect(pose.bones[b.id]!.rotation).toBeCloseTo(idle.bones[b.id]!.rotation, 4);
          expect(pose.bones[b.id]!.length).toBeCloseTo(idle.bones[b.id]!.length, 2);
        }
        for (const d of p.draw)
          if (d.id.startsWith('pose_') || d.id.startsWith('rosto_')) expect(pose.opacity[d.id]).toBe(0);
      }
    }
    const orc = p.anims.find((a) => a.name === 'gesto_orc_aponta')!;
    const beat = orc.frames / 12;
    const arm = p.draw.find((d) => d.id === 'pose_apontar_orc_mao')!;
    const rest = p.draw.find((d) => d.id === 'pose_apontar_orc_rest')!;
    const tampa = p.draw.find((d) => d.id === 'pose_apontar_orc_tampa')!;
    const [, u, f, m] = arm.mesh!.bones; // ombro preso ao tronco + braço, antebraço, mão
    const abs = (frame: number, id: string) => {
      const w = boneWorlds(p, evalPose(p, orc, frame))[id]!;
      return Math.atan2(w[1], w[0]);
    };
    // em repouso o braço do repouso é o que se vê; no ponto final, só o da pose
    const at = (b: number) => evalPose(p, orc, b * beat).opacity;
    expect(at(0.5)[rest.id]).toBe(0);
    expect(at(1.5)[rest.id]).toBeGreaterThan(0.95); // começou o recuo: troca seca, idêntica ao desenho
    expect(at(4.5)[arm.id]).toBeCloseTo(1, 2);
    expect(at(4.5)[rest.id]).toBeCloseTo(0, 2);
    expect(at(4.5)[tampa.id]).toBe(1);
    // a troca entre os dois braços acontece em movimento (no meio da subida), nunca com o braço parado
    let swapAt = -1;
    for (let b = 1.4; b <= 2.9; b += 0.02) {
      const o = at(b);
      if (swapAt < 0 && o[arm.id]! > 0.5) swapAt = b;
    }
    expect(swapAt).toBeGreaterThan(1.6);
    const speed = (b: number) => Math.abs(abs((b + 0.03) * beat, u!) - abs((b - 0.03) * beat, u!));
    expect(speed(swapAt)).toBeGreaterThan(0.005);
    // arrasto: durante a subida cada segmento está atrás do anterior (o cotovelo e a mão chegam por último)
    const lag = (b: number) => [abs(b * beat, u!), abs(b * beat, f!), abs(b * beat, m!)];
    const final = lag(4.5);
    const mid = lag(2.0);
    const togo = mid.map((x, i) => Math.abs(x - final[i]!));
    expect(togo[1]!).toBeGreaterThan(togo[0]! * 0.99);
    expect(togo[2]!).toBeGreaterThan(togo[1]! * 0.99);
    // passa um pouco do ponto e assenta (mola): o ângulo do braço passa do final e volta
    let overshoot = 0;
    for (let b = 2.2; b <= 3.6; b += 0.02) {
      const sign = Math.sign(final[0]! - abs(1.4 * beat, u!));
      overshoot = Math.max(overshoot, sign * (abs(b * beat, u!) - final[0]!));
    }
    expect(overshoot).toBeGreaterThan(0.005);
    expect(Math.abs(abs(4.5 * beat, u!) - final[0]!)).toBeLessThan(0.01);
    // com o tronco em repouso e o braço no ponto final, a malha da pose quase não se mexe (só mola/tremor)
    const hold = evalPose(p, orc, 4.5 * beat);
    hold.bones.torso = { ...idle.bones.torso! };
    const out = skinMesh(arm.mesh!, boneWorlds(p, hold), new Float32Array(arm.mesh!.v.length));
    const err = Math.max(...Array.from(out).map((x, i) => Math.abs(x - arm.mesh!.v[i]!)));
    expect(err).toBeLessThan(4);
    // e o tronco inclinado leva o braço junto: com ele inclinado a malha se desloca (ombro preso ao corpo)
    const lean = skinMesh(
      arm.mesh!,
      boneWorlds(p, evalPose(p, orc, 4.5 * beat)),
      new Float32Array(arm.mesh!.v.length),
    );
    const moved = Math.max(...Array.from(lean).map((x, i) => Math.abs(x - arm.mesh!.v[i]!)));
    expect(moved).toBeGreaterThan(err);
    // pensando: rosto e mão chegam juntos (rosto cheio quando a mão já está cheia)
    const pensar = p.anims.find((a) => a.name === 'gesto_pensar')!;
    const mid2 = evalPose(p, pensar, 5 * (pensar.frames / 12));
    expect(mid2.opacity.rosto_pensar).toBeCloseTo(1, 2);
    expect(mid2.opacity.pose_pensar_mao).toBeCloseTo(1, 2);
    // respira: o peito expande (escala do tronco) e o repouso pesa mais que os gestos
    const ler = p.anims.find((a) => a.name === 'gesto_ler')!;
    const scales = [0, 1, 2, 3, 4].map(
      (b) => evalPose(p, ler, b * (ler.frames / 12)).bones.torso!.scale,
    );
    expect(Math.max(...scales)).toBeGreaterThan(1.003);
    expect(scales[0]).toBeCloseTo(1, 5);
    expect(ler.weight).toBeGreaterThan(1);
  });

  it('mural real: antebraço e mão crescem do cotovelo ao levantar e as cabeças olham um contrato de cada vez', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/board-readers/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    const idle = evalPose(p, null, 0);
    // parado = quadro 0 = último quadro: escala dos ossos (respiração, ponta dos pés, antebraço) também volta
    for (const a of p.anims)
      for (const f of [0, a.frames]) {
        const pose = evalPose(p, a, f);
        for (const b of p.bones) expect(pose.bones[b.id]!.scale).toBeCloseTo(idle.bones[b.id]!.scale, 4);
      }
    // antebraço e mão: pequenos no começo (a perspectiva ainda fecha o braço atrás do corpo) e inteiros no fim
    const orc = p.anims.find((a) => a.name === 'gesto_orc_aponta')!;
    const beat = orc.frames / 12;
    const fore = p.bones.find((b) => b.id === 'f_apontar_orc')!;
    const hand = p.bones.find((b) => b.id === 'm_apontar_orc')!;
    const sc = (b: number, id: string) => evalPose(p, orc, b * beat).bones[id]!.scale;
    expect(sc(1, fore.id)).toBeLessThan(0.6);
    expect(sc(4.5, fore.id)).toBeCloseTo(1, 2);
    expect(sc(4.5, hand.id)).toBeCloseTo(1, 2);
    let last = 0;
    for (let b = 1.5; b <= 2.6; b += 0.05) {
      const v = sc(b, fore.id);
      expect(v).toBeGreaterThanOrEqual(last - 1e-3); // só cresce enquanto levanta
      last = v;
    }
    const fh = p.draw.find((d) => d.id === 'pose_apontar_orc_fh')!;
    const op = (b: number) => evalPose(p, orc, b * beat).opacity[fh.id]!;
    expect(op(1.45)).toBeLessThan(0.05); // a mão não aparece pronta de repente
    expect(op(4.5)).toBeCloseTo(1, 2);
    // volta: o braço desce até o repouso sem passar do ponto (nada de balanço de pêndulo) e a mão da pose
    // some junto com a troca para o braço do repouso (sem mão fantasma sobre ele)
    const ombroU = 'u_apontar_orc';
    const angU = (b: number) => {
      // ângulo do braço em relação ao ombro (o ombro acompanha o tronco, que respira e se inclina)
      const w = boneWorlds(p, evalPose(p, orc, b * beat));
      return (
        Math.atan2(w[ombroU]![1], w[ombroU]![0]) -
        Math.atan2(w.ombro_apontar_orc![1], w.ombro_apontar_orc![0])
      );
    };
    const restAng = angU(0);
    let before = angU(7.3);
    for (let b = 7.35; b <= 9.6; b += 0.05) {
      const a = angU(b);
      expect(Math.abs(a - restAng)).toBeLessThanOrEqual(Math.abs(before - restAng) + 1e-3);
      expect((a - restAng) * (before - restAng)).toBeGreaterThanOrEqual(-1e-9);
      before = a;
    }
    const resto = p.draw.find((d) => d.id === 'pose_apontar_orc_rest')!;
    const at2 = (b: number) => evalPose(p, orc, b * beat).opacity;
    expect(at2(8.6)[resto.id]).toBeCloseTo(1, 2);
    expect(at2(8.6)[fh.id]).toBeLessThan(0.15);
    // leitura: cada trecho tem poucos olhares (pausas de contemplação), mas juntos mostram as três cabeças
    // do orc, cada uma cheia em algum momento, nunca mais de duas ao mesmo tempo
    const heads = ['orc_esq', 'orc_dir', 'orc_baixo'].map((k) => `rosto_${k}`);
    const peak = new Map(heads.map((h) => [h, 0]));
    for (const nome of ['gesto_ler', 'gesto_ler2']) {
      const a = p.anims.find((x) => x.name === nome)!;
      const doAnim = new Map(heads.map((h) => [h, 0]));
      let parado = 0; // quadros com o repouso (nenhuma cabeça): há pausas, a cabeça não gira sem parar
      for (let f = 0; f <= a.frames; f += 2) {
        const o = evalPose(p, a, f).opacity;
        const on = heads.filter((h) => o[h]! > 0.02);
        expect(on.length).toBeLessThanOrEqual(2);
        expect(heads.reduce((t, h) => t + o[h]!, 0)).toBeLessThan(1.25);
        if (on.length === 0) parado++;
        for (const h of heads) {
          doAnim.set(h, Math.max(doAnim.get(h)!, o[h]!));
          peak.set(h, Math.max(peak.get(h)!, o[h]!));
        }
      }
      expect([...doAnim.values()].filter((v) => v > 0.99).length).toBeGreaterThanOrEqual(2);
      expect(parado * 2).toBeGreaterThan(a.frames * 0.15); // pelo menos ~15% do trecho com a cabeça no repouso
    }
    for (const h of heads) expect(peak.get(h)).toBeGreaterThan(0.99);
    // giro contínuo: cada olhar passa por quadros intermediários, em ordem, e nunca mostra o repouso no meio
    const orcCabecas = p.draw.filter((d) => /^rosto_orc_(esq|dir|baixo)/.test(d.id)).map((d) => d.id);
    const hobCabecas = p.draw.filter((d) => /^rosto_hob_(esq|cima)/.test(d.id)).map((d) => d.id);
    expect(orcCabecas.length).toBeGreaterThanOrEqual(12); // 3 olhares x (q25, meio, q75, final)
    expect(hobCabecas.length).toBeGreaterThanOrEqual(5);
    for (const [nome, grupo] of [
      ['gesto_ler', orcCabecas],
      ['gesto_ler2', orcCabecas],
      ['gesto_ler', hobCabecas],
    ] as [string, string[]][]) {
      const a = p.anims.find((x) => x.name === nome)!;
      const cob: number[] = [];
      for (let f = 0; f <= a.frames; f++) {
        const o = evalPose(p, a, f).opacity;
        cob.push(1 - grupo.reduce((t, id) => t * (1 - (o[id] ?? 0)), 1));
      }
      // blocos de cabeça visível (separados por pelo menos 6 quadros sem nenhuma): sem buraco dentro do bloco
      let i = 0;
      let blocos = 0;
      while (i < cob.length) {
        if (cob[i]! < 0.99) {
          i++;
          continue;
        }
        let fim = i;
        let vazio = 0;
        for (let k = i; k < cob.length; k++) {
          if (cob[k]! < 0.02) vazio++;
          else vazio = 0;
          if (vazio >= 6) break;
          if (cob[k]! >= 0.99) fim = k;
        }
        for (let k = i; k <= fim; k++) expect(cob[k]).toBeGreaterThan(0.9);
        blocos++;
        i = fim + 1;
      }
      expect(blocos).toBeGreaterThanOrEqual(2);
    }
    // ordem dos quadros na entrada: q25 antes do meio, antes do q75, antes do final
    const ler1 = p.anims.find((x) => x.name === 'gesto_ler')!;
    const primeiro = (id: string) => {
      for (let f = 0; f <= ler1.frames; f++) if (evalPose(p, ler1, f).opacity[id]! > 0.5) return f;
      return -1;
    };
    const ordem = ['rosto_orc_esq_q25', 'rosto_orc_esq_m50', 'rosto_orc_esq_q75', 'rosto_orc_esq'].map(
      primeiro,
    );
    expect(ordem.every((f) => f > 0)).toBe(true);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
    // o giro é UMA curva contínua com ease-in/out (arranca e freia uma vez), não uma sequência de pulsos:
    // o "avanço" da pose (0 = repouso ... 4 = final) dura uns 0,5 s e sua velocidade sobe e desce sem patamares
    const avanco = (f: number) => {
      const o = evalPose(p, ler1, f).opacity;
      let idx = 0;
      let resto = 1;
      ['rosto_orc_esq', 'rosto_orc_esq_q75', 'rosto_orc_esq_m50', 'rosto_orc_esq_q25'].forEach(
        (id, k) => {
          idx += resto * o[id]! * (4 - k);
          resto *= 1 - o[id]!;
        },
      );
      return idx;
    };
    const f0 = ordem[0]! - 40;
    const serie = Array.from({ length: 160 }, (_, i) => avanco(f0 + i));
    const ini = serie.findIndex((x) => x > 0.05);
    const fim = serie.findIndex((x) => x > 3.95);
    expect((fim - ini) / 60).toBeGreaterThan(0.9); // contemplando: giro lento
    expect((fim - ini) / 60).toBeLessThan(1.7);
    const vel = serie.slice(ini, fim).map((x, i, a) => (i ? (x - a[i - 1]!) * 60 : 0));
    const pico = Math.max(...vel);
    expect(pico).toBeLessThan(8); // antes: 33 quadros/s (giro de 0,22 s)
    // arranque suave: nos primeiros 0,1 s a velocidade média é bem menor que o pico
    const arranque = vel.slice(1, 7).reduce((t, x) => t + x, 0) / 6;
    expect(arranque).toBeLessThan(pico * 0.7);
    // sem patamar no meio do giro: depois de 25% e até 75% do avanço a velocidade nunca cai abaixo de 40% do pico
    for (let i = 1; i < vel.length; i++) {
      const q = serie[ini + i]!;
      if (q > 1 && q < 3) expect(vel[i]).toBeGreaterThan(pico * 0.4);
    }
    // fluidez: a cabeça gira de verdade (vários graus, não parada) e sem trancos (aceleração limitada)
    for (const nome of ['gesto_ler', 'gesto_ler2']) {
      const a = p.anims.find((x) => x.name === nome)!;
      for (const osso of ['cabeca', 'cabeza']) {
        const th = Array.from(
          { length: a.frames + 1 },
          (_, f) => (evalPose(p, a, f).bones[osso]!.rotation * 180) / Math.PI,
        );
        const vel = th.slice(1).map((x, i) => (x - th[i]!) * 60);
        // aceleração numa janela de 0,1 s (quadro a quadro só mede os vértices da interpolação linear)
        const th6 = th.filter((_, i) => i % 6 === 0);
        const v6 = th6.slice(1).map((x, i) => (x - th6[i]!) * 10);
        const acc = v6.slice(1).map((x, i) => (x - v6[i]!) * 10);
        expect(Math.max(...th) - Math.min(...th)).toBeGreaterThan(5); // antes: ~3,5° e parecia parado
        expect(Math.max(...vel.map(Math.abs))).toBeGreaterThan(3);
        expect(Math.max(...vel.map(Math.abs))).toBeLessThan(40);
        expect(Math.max(...acc.map(Math.abs))).toBeLessThan(400); // sem tranco
      }
    }
    // o giro vem antes da troca de imagem (a cabeça já está virando quando a outra cabeça aparece)
    const ler = p.anims.find((x) => x.name === 'gesto_ler')!;
    const beat2 = ler.frames / 12;
    const ang = (b: number) => (evalPose(p, ler, b * beat2).bones.cabeca!.rotation * 180) / Math.PI;
    expect(Math.abs(ang(1.0) - ang(0.6))).toBeGreaterThan(0.5);
  });

  it('mesa do mapa real: trechos emendam sem salto, o braço sai de trás da barba e as sequências pintadas vão e voltam', () => {
    const p = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../public/vfx/hall-life/planners-table/puppet/puppet.json'),
        'utf-8',
      ),
    ) as Puppet;
    expect(p.weights.idle).toBe(0);
    const idle = evalPose(p, null, 0);
    for (const a of p.anims)
      for (const f of [0, a.frames]) {
        const pose = evalPose(p, a, f);
        for (const b of p.bones) {
          expect(pose.bones[b.id]!.rotation).toBeCloseTo(idle.bones[b.id]!.rotation, 4);
          expect(pose.bones[b.id]!.scale).toBeCloseTo(idle.bones[b.id]!.scale, 4);
        }
        for (const d of p.draw)
          if (d.id.startsWith('pose_') || d.id.startsWith('rosto_')) expect(pose.opacity[d.id]).toBe(0);
      }
    // apontar: o braço da pose e os oclusores (barba, braço da frente) aparecem juntos, por cima dele
    const aponta = p.anims.find((a) => a.name === 'gesto_aponta')!;
    const ids = p.draw.map((d) => d.id);
    const meio = evalPose(p, aponta, (aponta.frames / 12) * 4.5).opacity;
    expect(meio.pose_aponta_fh).toBeCloseTo(1, 2);
    for (const oc of ['pose_aponta_frente0', 'pose_aponta_frente1']) {
      expect(meio[oc]).toBe(1);
      expect(ids.indexOf(oc)).toBeGreaterThan(ids.indexOf('pose_aponta_fh'));
    }
    // cruzar os braços e rir: a sequência chega ao quadro final pintado; os quadros andam presos ao tronco,
    // então o peito continua respirando por baixo deles (antes o corpo congelava quase o trecho inteiro)
    for (const [nome, ultimo, osso] of [
      ['gesto_cruza', 'rosto_w_cross_s12', 'warrior_chest'],
      ['gesto_riem', 'rosto_r_laugh_s15', 'ranger_chest'],
    ] as const) {
      const a = p.anims.find((x) => x.name === nome)!;
      let cheio = -1;
      for (let f = 0; f <= a.frames; f += 2) if (evalPose(p, a, f).opacity[ultimo]! > 0.99) cheio = f;
      expect(cheio).toBeGreaterThan(0);
      expect(p.draw.find((d) => d.id === ultimo)!.mesh.bones).toContain(osso);
      const sc = Array.from({ length: a.frames + 1 }, (_, f) => evalPose(p, a, f).bones[osso]!.scale);
      expect(Math.max(...sc) - Math.min(...sc)).toBeGreaterThan(0.005);
    }
    // cruzar é pose a pose: o quadro de cima está sempre inteiro ou ausente, nunca dois braços misturados (borrão)
    const cruza = p.anims.find((x) => x.name === 'gesto_cruza')!;
    const quadros = p.draw.filter((d) => d.id.startsWith('rosto_w_cross_')).map((d) => d.id);
    expect(quadros.length).toBe(12);
    for (let f = 0; f <= cruza.frames; f++) {
      const op = evalPose(p, cruza, f).opacity;
      const topo = Math.max(...quadros.map((q) => op[q] ?? 0));
      expect(topo < 0.02 || topo > 0.98).toBe(true);
    }
    // parado mas vivo: respiração e balanço grandes o bastante para aparecer nesse tamanho de tela,
    // e a cabeça vai junto com o tronco (filha do peito)
    const estudar = p.anims.find((x) => x.name === 'gesto_estudar')!;
    for (const [peito, cabeca] of [
      ['ranger_chest', 'ranger_head'],
      ['warrior_chest', 'warrior_head'],
    ] as const) {
      expect(p.bones.find((b) => b.id === cabeca)!.parent).toBe(peito);
      const poses = Array.from({ length: estudar.frames + 1 }, (_, f) => evalPose(p, estudar, f));
      const sc = poses.map((q) => q.bones[peito]!.scale);
      const rot = poses.map((q) => (q.bones[peito]!.rotation * 180) / Math.PI);
      expect(Math.max(...sc) - Math.min(...sc)).toBeGreaterThan(0.02);
      expect(Math.max(...rot) - Math.min(...rot)).toBeGreaterThan(1.5);
    }
  });
});
