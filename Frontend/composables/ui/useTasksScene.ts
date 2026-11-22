/**
 * Espaço da cena do Mural de Contratos (`/tasks`).
 *
 * O fundo `.mural-bg` em `pages/Task/index.vue` é um `<img>` com `object-fit: cover` dentro de um
 * palco 16:9, ampliado por `transform: scale()` em torno de `object-position`. A geometria é a mesma
 * do saguão (`useSceneSpace.ts`), então as funções de lá são reaproveitadas com a imagem do mural.
 *
 * Diferença importante para o saguão: aqui a UI (colunas do kanban, placas) NÃO fica dentro de uma
 * camada escalada. Cada retângulo é convertido para frações do palco JÁ escalado e vira `left/top/
 * width/height` em %. Assim o texto não borra e `position: fixed` (zoom da folha) continua relativo à
 * tela.
 *
 * Se o CSS de `.mural-bg` mudar, atualize `TASKS_STAGE_MODE` aqui (e o spec).
 */
import { imageToStageRect, type Rect, type StageMode } from './useSceneSpace';

/**
 * `public/imagens/Mural-expandido.webp`: arte regerada pelo usuário (20/11/2026, 4:3), convertida do PNG
 * sem outras edições. O quadro não fica no centro da imagem (centro em ~44.8% da largura): a sala de
 * registro com o arco fica à direita. Mestre PNG fora do repo.
 */
export const TASKS_IMAGE = { width: 4800, height: 3584 } as const;

export const TASKS_BG_URL = '/imagens/Mural-expandido.webp';

/**
 * Espelho do CSS de `.mural-bg`: `object-position`/`transform-origin` `27.5% 47%`, `scale(1.3)`.
 * Num palco 16:9 a imagem 4:3 cobre a largura exata, então só a origem do scale decide o X: 27.5%
 * centraliza o quadro (~12%..88% da largura). Placas a partir de ~8% da altura (placa pendurada do
 * título em cima) e trilho inferior até ~98% (botão "Novo Contrato"); a vertical é o limite do zoom.
 */
export const TASKS_STAGE_MODE: StageMode = { posX: 0.275, posY: 0.47, scale: 1.3 };

export type BoardColumn = 'todo' | 'doing' | 'done';

/**
 * Retângulos medidos na imagem (px), pelos contornos pretos da arte:
 * - `panel`: tábuas vazias entre os postes, onde as folhas são pregadas;
 * - `plaque`: placa rúnica no topo de cada painel, onde vai o título da coluna.
 */
export const BOARD_RECTS: Record<BoardColumn, { panel: Rect; plaque: Rect }> = {
  todo: {
    panel: { x: 1022, y: 1075, w: 625, h: 1456 },
    plaque: { x: 992, y: 872, w: 653, h: 200 },
  },
  doing: {
    panel: { x: 1850, y: 1075, w: 625, h: 1456 },
    plaque: { x: 1830, y: 872, w: 655, h: 200 },
  },
  done: {
    panel: { x: 2668, y: 1075, w: 625, h: 1456 },
    plaque: { x: 2659, y: 872, w: 648, h: 200 },
  },
};

/** Moldura inteira do quadro (com os pés) e o trilho inferior, onde senta o botão de criar. */
export const BOARD_FRAME: Rect = { x: 754, y: 811, w: 2794, h: 2216 };
export const BOARD_BOTTOM_RAIL: Rect = { x: 1022, y: 2614, w: 2270, h: 130 };

export const BOARD_COLUMNS: BoardColumn[] = ['todo', 'doing', 'done'];

/** Chama pintada na arte, em pixels da imagem: eixo vertical, ponta e base (boca da tocha ou pavio). */
export interface MuralFlame {
  kind: 'torch' | 'candle';
  x: number;
  top: number;
  base: number;
}

/** Tochas e velas da arte, onde vão as chamas animadas (`page/MuralFlames.vue`). */
export const MURAL_FLAMES: MuralFlame[] = [
  { kind: 'torch', x: 520, top: 971, base: 1330 }, // parede esquerda
  { kind: 'torch', x: 3585, top: 1110, base: 1470 }, // parede direita, junto ao arco
  { kind: 'torch', x: 3712, top: 1489, base: 1655 }, // sala de registro, ao fundo
  { kind: 'candle', x: 1963, top: 263, base: 372 }, // prateleira, vela da esquerda
  { kind: 'candle', x: 2750, top: 234, base: 368 }, // prateleira, vela da direita
];

/**
 * Posição (em % do palco) do sprite de fogo sobre a chama pintada. O quadro do sprite
 * (`assets/img/fire-spritesheet-16.png`, 64x96) tem a chama da linha 0, cortada reta no topo, até a linha 90.
 * A base da caixa cai sobre a base pintada; o topo fica 4% abaixo do topo pintado, porque o corte reto do
 * sprite é mais largo que a ponta e, na altura do topo pintado, parecia mais alto que a chama original.
 */
const FLAME_TOP_INSET = 0.02;
export function flameStageStyle(
  f: MuralFlame,
  mode: StageMode = TASKS_STAGE_MODE,
): Record<string, string> {
  const top = f.top + (f.base - f.top) * FLAME_TOP_INSET;
  const h = (f.base - top) / (90 / 96);
  const w = (h * 64) / 96;
  const r = tasksStageRect({ x: f.x - w / 2, y: top, w, h }, mode);
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w) };
}

/** Retângulo da imagem -> frações do palco 16:9 (após o scale do fundo). */
export function tasksStageRect(rect: Rect, mode: StageMode = TASKS_STAGE_MODE): Rect {
  return imageToStageRect(rect, mode, TASKS_IMAGE);
}

const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;

/** Estilo absoluto (em % do palco) para um retângulo da imagem. */
export function tasksStageStyle(rect: Rect, mode: StageMode = TASKS_STAGE_MODE): Record<string, string> {
  const r = tasksStageRect(rect, mode);
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

const cqw = (v: number) => `${+(v * 100).toFixed(4)}cqw`;
const cqh = (v: number) => `${+(v * 100).toFixed(4)}cqh`;

/**
 * Variáveis CSS com a posição de cada coluna e placa, consumidas pelo KanbanBoard no layout `scene`
 * (`--col-todo-x`, `--plaque-done-w`, ...). Saem em unidades de container (`cqw`/`cqh`) do palco
 * (`.mural-stage { container-type: size }`), então valem em qualquer elemento dentro dele, sem
 * depender de qual é o containing block (a placa do cabeçalho é filha da coluna, por exemplo).
 */
export function boardCssVars(mode: StageMode = TASKS_STAGE_MODE): Record<string, string> {
  const vars: Record<string, string> = {};
  const put = (prefix: string, rect: Rect) => {
    const r = tasksStageRect(rect, mode);
    vars[`${prefix}-x`] = cqw(r.x);
    vars[`${prefix}-y`] = cqh(r.y);
    vars[`${prefix}-w`] = cqw(r.w);
    vars[`${prefix}-h`] = cqh(r.h);
  };
  for (const col of BOARD_COLUMNS) {
    put(`--col-${col}`, BOARD_RECTS[col].panel);
    put(`--plaque-${col}`, BOARD_RECTS[col].plaque);
  }
  put('--rail', BOARD_BOTTOM_RAIL);
  put('--frame', BOARD_FRAME);
  return vars;
}

/**
 * Modo compacto (diário com abas, sem cena): retrato, largura < 640 (igual ao `useResponsive`)
 * ou altura < 560 (celular deitado não comporta o quadro de 3 colunas legível).
 */
export function isCompactMural(width: number, height: number): boolean {
  return height > width || width < 640 || height < 560;
}

/**
 * Escala das folhas dentro de um painel: o maior número de folhas por linha (até `maxPerRow`) que
 * mantém a folha legível (`minScale`), sem passar de `maxScale`. Se nem 2 cabem, 1 por linha um pouco
 * maior. A folha tem 160x200 px antes da escala.
 * - cena (padrão): até 2 por linha, no máximo o tamanho do kanban antigo (0.85);
 * - diário: até 4 por linha e escala 1, para o tablet em pé não ficar com folhas minúsculas.
 */
export const PAPER_SIZE = { width: 160, height: 200 } as const;

export interface PaperLayoutOptions {
  maxPerRow?: number;
  maxScale?: number;
  minScale?: number;
  gap?: number;
  /** fração da largura da folha que uma folha cobre da vizinha (0 = lado a lado, com `gap`) */
  overlap?: number;
}

// na cena: sempre 2 contratos por linha, pregados um pouco por cima um do outro (12% da folha), como num
// mural de verdade. A área das folhas é o painel mais ~1.4% do palco sobre cada poste (CSS do KanbanBoard):
// escala ~1.2 em 1920, ~0.86 em 1366 e ~0.75 no tablet deitado (1180)
export const SCENE_PAPER_LAYOUT: PaperLayoutOptions = {
  maxPerRow: 2,
  maxScale: 1.3,
  minScale: 0.55,
  gap: 2,
  overlap: 0.12,
};

/** quanto a área das folhas avança sobre os postes, de cada lado (fração da largura do palco) */
export const SCENE_PAPER_BLEED = 0.014;

// no diário a folha é lida de perto no celular: mais colunas só se cada folha ficar >= 0.8
export const JOURNAL_PAPER_LAYOUT: PaperLayoutOptions = { maxPerRow: 4, maxScale: 1, minScale: 0.8 };

export function paperLayoutForWidth(
  panelWidth: number,
  { maxPerRow = 2, maxScale = 0.85, minScale = 0.62, gap = 8, overlap = 0 }: PaperLayoutOptions = {},
): { perRow: number; scale: number } {
  const usable = Math.max(0, panelWidth - gap * 2);
  for (let n = maxPerRow; n >= 2; n--) {
    // n folhas sobrepostas ocupam n - overlap*(n-1) larguras; lado a lado, n larguras + os vãos
    const scale =
      overlap > 0
        ? usable / (PAPER_SIZE.width * (n - overlap * (n - 1)))
        : (usable - gap * (n - 1)) / (n * PAPER_SIZE.width);
    if (scale >= minScale) return { perRow: n, scale: Math.min(maxScale, scale) };
  }
  const oneUp = usable / PAPER_SIZE.width;
  return { perRow: 1, scale: Math.max(0.5, Math.min(maxScale * 1.15, oneUp)) };
}
