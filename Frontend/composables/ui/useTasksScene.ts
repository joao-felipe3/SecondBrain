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
 * `public/imagens/Mural-expandido.webp`: quadro limpo (Gemini) + expansão generativa (Firefly), painéis
 * alargados 1.45x (só o miolo das tábuas, remapeamento horizontal; postes e decoração intactos) e por fim
 * reiluminada no Gemini com o saguão como referência (luz de tocha âmbar, sem estouro), realinhada por
 * ECC à versão anterior. Os retângulos abaixo foram remedidos depois disso. Mestre fora do repo.
 */
export const TASKS_IMAGE = { width: 4391, height: 2536 } as const;

export const TASKS_BG_URL = '/imagens/Mural-expandido.webp';

/**
 * Espelho do CSS de `.mural-bg`: `object-position`/`transform-origin` `50% 43.2%`, `scale(1.6)`.
 * O quadro ocupa ~5%..95% da largura do palco; placas a partir de ~8.5% da altura (placa pendurada
 * do título em cima) e trilho inferior até ~99.5% (botão "Novo Contrato").
 */
export const TASKS_STAGE_MODE: StageMode = { posX: 0.5, posY: 0.432, scale: 1.6 };

export type BoardColumn = 'todo' | 'doing' | 'done';

/**
 * Retângulos medidos na imagem (px), pelos contornos pretos da arte:
 * - `panel`: tábuas vazias entre os postes, onde as folhas são pregadas;
 * - `plaque`: placa rúnica no topo de cada painel, onde vai o título da coluna.
 */
export const BOARD_RECTS: Record<BoardColumn, { panel: Rect; plaque: Rect }> = {
  todo: {
    panel: { x: 1091, y: 742, w: 648, h: 1099 },
    plaque: { x: 1071, y: 560, w: 654, h: 140 },
  },
  doing: {
    panel: { x: 1846, y: 742, w: 708, h: 1099 },
    plaque: { x: 1842, y: 560, w: 722, h: 140 },
  },
  done: {
    panel: { x: 2667, y: 742, w: 632, h: 1099 },
    plaque: { x: 2667, y: 560, w: 660, h: 140 },
  },
};

/** Moldura inteira do quadro (com os pés) e o trilho inferior, onde senta o botão de criar. */
export const BOARD_FRAME: Rect = { x: 966, y: 520, w: 2464, h: 1660 };
export const BOARD_BOTTOM_RAIL: Rect = { x: 1091, y: 1845, w: 2208, h: 120 };

export const BOARD_COLUMNS: BoardColumn[] = ['todo', 'doing', 'done'];

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
}

// na cena a folha precisa ser legível de longe (texto base de 12 px): 2 por linha só com escala >= 1;
// senão 1 por linha, maior (até ~1.6)
export const SCENE_PAPER_LAYOUT: PaperLayoutOptions = { maxPerRow: 2, maxScale: 1.4, minScale: 1 };

// no diário a folha é lida de perto no celular: mais colunas só se cada folha ficar >= 0.8
export const JOURNAL_PAPER_LAYOUT: PaperLayoutOptions = { maxPerRow: 4, maxScale: 1, minScale: 0.8 };

export function paperLayoutForWidth(
  panelWidth: number,
  { maxPerRow = 2, maxScale = 0.85, minScale = 0.62, gap = 8 }: PaperLayoutOptions = {},
): { perRow: number; scale: number } {
  const usable = Math.max(0, panelWidth - gap * 2);
  for (let n = maxPerRow; n >= 2; n--) {
    const scale = (usable - gap * (n - 1)) / (n * PAPER_SIZE.width);
    if (scale >= minScale) return { perRow: n, scale: Math.min(maxScale, scale) };
  }
  const oneUp = usable / PAPER_SIZE.width;
  return { perRow: 1, scale: Math.max(0.5, Math.min(maxScale * 1.15, oneUp)) };
}
