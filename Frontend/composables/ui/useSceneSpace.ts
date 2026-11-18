/**
 * Espaço da imagem do Saguão ("scene space").
 *
 * O fundo `.master-bg` em `pages/index.vue` é renderizado com `object-fit: cover`,
 * `object-position` e um `transform: scale()` em torno do mesmo ponto. Por isso uma
 * coordenada da imagem (pixel do PNG) NÃO é igual a uma porcentagem da `.safe-zone`.
 *
 * Este módulo reproduz essa geometria num único lugar: `sceneSpaceStyle()` gera o
 * estilo de um contêiner que cobre exatamente a imagem renderizada, de modo que tudo
 * dentro dele pode ser posicionado em frações da imagem (0..1) sem calibração manual.
 *
 * Se o CSS do `.master-bg` mudar, atualize `HALL_STAGE_MODES` aqui.
 */

export const HALL_IMAGE = { width: 5056, height: 3392 } as const;

/** Proporção da `.safe-zone` (palco 16:9). */
export const STAGE_ASPECT = 16 / 9;

export interface StageMode {
  /** object-position e transform-origin do `.master-bg` (frações do palco) */
  posX: number;
  posY: number;
  /** transform: scale() do `.master-bg` */
  scale: number;
}

/** Espelho do CSS de `.master-bg` em `pages/index.vue`. */
export const HALL_STAGE_MODES = {
  /** padrão desktop: `scale(1.7)`, origem/posição `59.5% 66%` */
  desktop: { posX: 0.595, posY: 0.66, scale: 1.7 },
  /** `@media (min-aspect-ratio: 2.4/1)`: `scale(2.3)`, origem/posição `50% 50%` */
  ultrawide: { posX: 0.5, posY: 0.5, scale: 2.3 },
} as const satisfies Record<string, StageMode>;

export type HallStageModeName = keyof typeof HALL_STAGE_MODES;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Caixa (em frações do palco, antes do scale) ocupada pela imagem com `object-fit: cover`.
 */
export function coverBox(
  mode: StageMode,
  image: { width: number; height: number } = HALL_IMAGE,
  stageAspect = STAGE_ASPECT,
): Rect {
  const imageAspect = image.width / image.height;
  // largura e altura relativas ao palco (1 = 100% do palco)
  const w = imageAspect >= stageAspect ? imageAspect / stageAspect : 1;
  const h = imageAspect >= stageAspect ? 1 : stageAspect / imageAspect;
  return { x: (1 - w) * mode.posX, y: (1 - h) * mode.posY, w, h };
}

/**
 * Converte um retângulo em pixels da imagem para frações do palco 16:9 (após o scale).
 * Valores fora de 0..1 estão fora da safe-zone (podem aparecer no letterbox).
 */
export function imageToStageRect(
  rect: Rect,
  mode: StageMode,
  image: { width: number; height: number } = HALL_IMAGE,
  stageAspect = STAGE_ASPECT,
): Rect {
  const box = coverBox(mode, image, stageAspect);
  const toStage = (fx: number, fy: number) => {
    const sx = box.x + fx * box.w;
    const sy = box.y + fy * box.h;
    return {
      x: mode.posX + (sx - mode.posX) * mode.scale,
      y: mode.posY + (sy - mode.posY) * mode.scale,
    };
  };
  const a = toStage(rect.x / image.width, rect.y / image.height);
  const b = toStage((rect.x + rect.w) / image.width, (rect.y + rect.h) / image.height);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;

/**
 * Estilo do contêiner que coincide com a imagem renderizada.
 * Filhos posicionados em `%` dentro dele = frações da imagem.
 */
export function sceneSpaceStyle(
  mode: StageMode,
  image: { width: number; height: number } = HALL_IMAGE,
  stageAspect = STAGE_ASPECT,
): Record<string, string> {
  const box = coverBox(mode, image, stageAspect);
  // a origem do scale é um ponto do palco; expressa no sistema do próprio contêiner
  const originX = (mode.posX - box.x) / box.w;
  const originY = (mode.posY - box.y) / box.h;
  return {
    left: pct(box.x),
    top: pct(box.y),
    width: pct(box.w),
    height: pct(box.h),
    transform: `scale(${mode.scale})`,
    transformOrigin: `${pct(originX)} ${pct(originY)}`,
  };
}

/** Retângulo em pixels da imagem -> estilo `%` dentro do scene space. */
export function imageRectToPercentStyle(
  rect: Rect,
  image: { width: number; height: number } = HALL_IMAGE,
): Record<string, string> {
  return {
    left: pct(rect.x / image.width),
    top: pct(rect.y / image.height),
    width: pct(rect.w / image.width),
    height: pct(rect.h / image.height),
  };
}
