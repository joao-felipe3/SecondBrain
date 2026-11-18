import { describe, it, expect } from 'vitest';
import {
  HALL_IMAGE,
  HALL_STAGE_MODES,
  coverBox,
  imageToStageRect,
  sceneSpaceStyle,
  imageRectToPercentStyle,
  mobileStageLayout,
  MOBILE_FRAME,
} from '~/composables/ui/useSceneSpace';

const close = (a: number, b: number, eps = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('useSceneSpace', () => {
  it('cover de 5056x3392 num palco 16:9 ocupa a largura e transborda na altura', () => {
    const box = coverBox(HALL_STAGE_MODES.desktop);
    close(box.w, 1);
    close(box.h, 16 / 9 / (HALL_IMAGE.width / HALL_IMAGE.height));
    close(box.x, 0);
    close(box.y, (1 - box.h) * 0.66); // object-position 66%
  });

  it('o ponto de origem do scale fica parado (59.5% 66% no desktop)', () => {
    const box = coverBox(HALL_STAGE_MODES.desktop);
    // ponto da imagem que cai exatamente na origem do palco
    const fx = (0.595 - box.x) / box.w;
    const fy = (0.66 - box.y) / box.h;
    const r = imageToStageRect(
      { x: fx * HALL_IMAGE.width, y: fy * HALL_IMAGE.height, w: 0, h: 0 },
      HALL_STAGE_MODES.desktop,
    );
    close(r.x, 0.595);
    close(r.y, 0.66);
  });

  it('a janela visível do palco 16:9 no desktop corresponde à faixa central da imagem', () => {
    // borda esquerda do palco (x=0) deve corresponder a ~24.5% da largura da imagem
    const left = imageToStageRect(
      { x: 0.245 * HALL_IMAGE.width, y: 0.5 * HALL_IMAGE.height, w: 0, h: 0 },
      HALL_STAGE_MODES.desktop,
    );
    close(left.x, 0, 2e-3);
    const right = imageToStageRect(
      { x: 0.8333 * HALL_IMAGE.width, y: 0.5 * HALL_IMAGE.height, w: 0, h: 0 },
      HALL_STAGE_MODES.desktop,
    );
    close(right.x, 1, 2e-3);
  });

  it('retângulos escalam pelo fator do modo', () => {
    const r = imageToStageRect({ x: 2000, y: 2000, w: 505.6, h: 0 }, HALL_STAGE_MODES.ultrawide);
    close(r.w, 0.1 * 2.3); // 10% da largura da imagem * scale
  });

  it('o estilo do scene space reproduz a mesma transformação de imageToStageRect', () => {
    for (const mode of Object.values(HALL_STAGE_MODES)) {
      const s = sceneSpaceStyle(mode);
      const left = parseFloat(s.left) / 100;
      const top = parseFloat(s.top) / 100;
      const w = parseFloat(s.width) / 100;
      const h = parseFloat(s.height) / 100;
      const [ox, oy] = s.transformOrigin.split(' ').map((v) => parseFloat(v) / 100);
      // ponto arbitrário da imagem: 30% x 60%
      const fx = 0.3;
      const fy = 0.6;
      const viaStyle = {
        x: left + ox * w + (fx - ox) * w * mode.scale,
        y: top + oy * h + (fy - oy) * h * mode.scale,
      };
      const viaFn = imageToStageRect(
        { x: fx * HALL_IMAGE.width, y: fy * HALL_IMAGE.height, w: 0, h: 0 },
        mode,
      );
      close(viaStyle.x, viaFn.x);
      close(viaStyle.y, viaFn.y);
      expect(s.transform).toBe(`scale(${mode.scale})`);
    }
  });

  it('converte retângulo em pixels da imagem para % do scene space', () => {
    const s = imageRectToPercentStyle({ x: 2528, y: 1696, w: 505.6, h: 339.2 });
    expect(s).toEqual({ left: '50%', top: '50%', width: '10%', height: '10%' });
  });
  it('mobile: a faixa enquadrada da imagem preenche a altura da tela e o palco mantém 16:9', () => {
    const vw = 390;
    const vh = 844;
    const L = mobileStageLayout(vw, vh);
    close(L.stageH, L.stageW * (9 / 16));
    // imagem inteira em px, a partir do palco posicionado no mundo
    const img = imageToStageRect(
      { x: 0, y: 0, w: HALL_IMAGE.width, h: HALL_IMAGE.height },
      HALL_STAGE_MODES.desktop,
    );
    const imgTop = L.stageTop + img.y * L.stageH;
    const imgH = img.h * L.stageH;
    close(imgTop + MOBILE_FRAME.top * imgH, 0, 1e-6); // topo da faixa no topo da tela
    close(imgTop + MOBILE_FRAME.bottom * imgH, vh, 1e-6); // base da faixa na base da tela
    // o mundo começa na borda esquerda da imagem e tem a largura dela
    close(L.stageLeft + img.x * L.stageW, 0, 1e-6);
    close(L.worldW, img.w * L.stageW, 1e-6);
    close(L.worldW / imgH, HALL_IMAGE.width / HALL_IMAGE.height, 1e-6);
  });

  it('mobile: o enquadramento nunca passa das linhas que o cover deixa visíveis (sem faixa preta)', () => {
    const box = coverBox(HALL_STAGE_MODES.desktop);
    const visTop = -box.y / box.h;
    const visBottom = (1 - box.y) / box.h;
    expect(MOBILE_FRAME.top).toBeGreaterThanOrEqual(visTop);
    expect(MOBILE_FRAME.bottom).toBeLessThanOrEqual(visBottom);
    // pedir a imagem inteira cai na faixa visível: a caixa do .master-bg cobre a tela de ponta a ponta
    const vh = 844;
    const L = mobileStageLayout(390, vh, { top: 0, bottom: 1, startX: 0.5 });
    const bgTop = L.stageTop + HALL_STAGE_MODES.desktop.posY * (1 - 1.7) * L.stageH;
    close(bgTop, 0, 1e-6);
    close(bgTop + 1.7 * L.stageH, vh, 1e-6);
  });

  it('mobile: a câmera começa centrada no ponto inicial e fica presa às bordas da imagem', () => {
    const L = mobileStageLayout(390, 844);
    expect(L.panMin).toBe(0);
    close(L.panMax, L.worldW - 390, 1e-6);
    close(L.panStart + 195, MOBILE_FRAME.startX * L.worldW, 1e-6);
    // ponto inicial perto da borda: preso ao limite
    expect(mobileStageLayout(390, 844, { ...MOBILE_FRAME, startX: 0.99 }).panStart).toBeCloseTo(
      L.panMax,
      6,
    );
    expect(mobileStageLayout(390, 844, { ...MOBILE_FRAME, startX: 0 }).panStart).toBe(0);
    // tela mais larga que o mundo: centraliza e não arrasta
    const wide = mobileStageLayout(5000, 844);
    expect(wide.panMax).toBe(0);
    close(wide.panStart, (wide.worldW - 5000) / 2, 1e-6);
  });
});
