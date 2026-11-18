import { describe, it, expect } from 'vitest';
import {
  HALL_IMAGE,
  HALL_STAGE_MODES,
  coverBox,
  imageToStageRect,
  sceneSpaceStyle,
  imageRectToPercentStyle,
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
});
